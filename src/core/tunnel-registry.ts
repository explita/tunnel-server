import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

import {
  decode,
  decryptPayload,
  encode,
  encryptPayload,
  type TunnelMessage,
} from "@explita/infra-protocol";

export type MessageHandler = (message: TunnelMessage) => void;

export type TunnelConnection = {
  id: string;
  subdomain: string;
  token?: string;
  auth?: string;
  allowedIps?: string[];
  socket: WebSocket;
  sharedKey?: Buffer;
  send: (message: TunnelMessage) => void;
  registerHandler: (id: string, handler: MessageHandler) => () => void;
};

export function createTunnelSender(
  socket: WebSocket,
  sharedKey?: Buffer,
): (message: TunnelMessage) => void {
  return (message: TunnelMessage) => {
    if (socket.readyState !== socket.OPEN) return;
    try {
      if (sharedKey) {
        const encrypted = encryptPayload(encode(message), sharedKey);
        socket.send(encode(encrypted));
      } else {
        socket.send(encode(message));
      }
    } catch {
      // Socket write failure
    }
  };
}

export function decodeTunnelMessage(
  raw: Buffer | string,
  sharedKey?: Buffer,
): TunnelMessage {
  const msg = decode(raw);
  if (msg.type === "encrypted" && sharedKey) {
    const plaintext = decryptPayload(msg, sharedKey);
    return decode(plaintext);
  }
  return msg;
}

export type DistributedTunnelRecord = {
  serverId: string;
  tunnelId: string;
  token?: string;
  subdomain: string;
  connectedAt: number;
};

export type SubdomainReservation = {
  tunnelId: string;
  token?: string;
  expiresAt: number;
  isGracePeriod?: boolean;
};

export class TunnelRegistry {
  public readonly serverId = randomUUID().slice(0, 8);
  private readonly tunnels = new Map<string, TunnelConnection>();
  private readonly pendingReservations = new Map<
    string,
    SubdomainReservation
  >();

  get size(): number {
    return this.tunnels.size;
  }

  add(tunnel: TunnelConnection): void {
    this.pendingReservations.delete(tunnel.subdomain);
    this.tunnels.set(tunnel.subdomain, tunnel);
  }

  cancelReservation(subdomain: string, tunnelId: string): void {
    const pending = this.pendingReservations.get(subdomain);
    if (pending && pending.tunnelId === tunnelId) {
      this.pendingReservations.delete(subdomain);
    }
  }

  countByToken(token: string): number {
    let count = 0;
    for (const tunnel of this.tunnels.values()) {
      if (tunnel.token === token) {
        count++;
      }
    }
    return count;
  }

  get(subdomain: string): TunnelConnection | undefined {
    const direct = this.tunnels.get(subdomain);
    if (direct) {
      return direct;
    }

    // Support wildcard parent subdomains via dot (e.g. "access.ruta" -> "ruta")
    const dotIndex = subdomain.indexOf(".");
    if (dotIndex !== -1) {
      const parent = subdomain.slice(dotIndex + 1);
      const conn = this.get(parent);
      if (conn) return conn;
    }

    // Support wildcard parent subdomains via double hyphen (e.g. "access--ruta" -> "ruta")
    const dashIndex = subdomain.indexOf("--");
    if (dashIndex !== -1) {
      const parent = subdomain.slice(dashIndex + 2);
      const conn = this.get(parent);
      if (conn) return conn;
    }

    return undefined;
  }

  isReservedInGracePeriod(subdomain: string): boolean {
    const pending = this.pendingReservations.get(subdomain);
    return Boolean(
      pending && pending.isGracePeriod && pending.expiresAt > Date.now(),
    );
  }

  isReservedByOwner(
    subdomain: string,
    tunnelId?: string,
    token?: string,
  ): boolean {
    const pending = this.pendingReservations.get(subdomain);
    if (!pending || pending.expiresAt <= Date.now()) return false;
    if (tunnelId && pending.tunnelId === tunnelId) return true;
    if (token && pending.token && pending.token === token) return true;
    return false;
  }

  async isSubdomainAvailable(
    subdomain: string,
    tunnelId?: string,
    token?: string,
  ): Promise<{ available: boolean; reason?: string }> {
    const now = Date.now();
    const pending = this.pendingReservations.get(subdomain);
    if (pending) {
      if (pending.expiresAt <= now) {
        this.pendingReservations.delete(subdomain);
      } else {
        const isOwner =
          (tunnelId && pending.tunnelId === tunnelId) ||
          (token && pending.token && pending.token === token);

        if (!isOwner) {
          return {
            available: false,
            reason: pending.isGracePeriod
              ? `Subdomain "${subdomain}" is reserved for a reconnecting session. Please choose another or try again later.`
              : `Subdomain "${subdomain}" is currently being reserved by another session.`,
          };
        }
      }
    }

    const local = this.tunnels.get(subdomain);
    if (local) {
      // If the socket is currently OPEN and active:
      // Only the same session (matching tunnelId) is allowed to reconnect.
      // Another session (even with the same token) cannot usurp an active connection.
      const isSameSession = Boolean(tunnelId && local.id === tunnelId);
      if (isSameSession) {
        return { available: true };
      }

      // If the existing socket is closed or dead, an owner with the same token can claim it
      const isDead = local.socket.readyState !== local.socket.OPEN;
      const isOwner = Boolean(token && local.token && local.token === token);
      if (isDead && isOwner) {
        return { available: true };
      }

      return {
        available: false,
        reason: `Subdomain "${subdomain}" is already in use by an active session.\nPlease choose a different subdomain or stop the active session first.`,
      };
    }

    if (tunnelId) {
      this.pendingReservations.set(subdomain, {
        tunnelId,
        token,
        expiresAt: now + 10_000,
      });
    }

    return { available: true };
  }

  refreshHeartbeat(_subdomain: string): void {
    // In-memory heartbeat is tracked by active socket
  }

  release(
    subdomain: string,
    tunnelId?: string,
    gracePeriodMs = 0,
    token?: string,
  ): void {
    this.tunnels.delete(subdomain);

    if (gracePeriodMs > 0 && tunnelId) {
      const expiresAt = Date.now() + gracePeriodMs;
      this.pendingReservations.set(subdomain, {
        tunnelId,
        token,
        expiresAt,
        isGracePeriod: true,
      });

      const timer = setTimeout(() => {
        const current = this.pendingReservations.get(subdomain);
        if (current && current.expiresAt <= Date.now()) {
          this.pendingReservations.delete(subdomain);
        }
      }, gracePeriodMs + 500);
      timer.unref?.();
    } else {
      this.pendingReservations.delete(subdomain);
    }
  }

  remove(subdomain: string): void {
    this.release(subdomain, undefined, 0);
  }

  values() {
    return this.tunnels.values();
  }

  clearAll(): void {
    this.tunnels.clear();
    this.pendingReservations.clear();
  }
}

export const registry = new TunnelRegistry();
