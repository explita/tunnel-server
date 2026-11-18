import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

import {
  decode,
  decryptPayload,
  encode,
  encryptPayload,
  type TunnelMessage,
} from "@explita/infra-protocol";
import { extractRootSubdomain } from "../lib/utils.js";

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
    const root = extractRootSubdomain(tunnel.subdomain);
    this.pendingReservations.delete(root);
    this.tunnels.set(root, tunnel);
  }

  cancelReservation(subdomain: string, tunnelId: string): void {
    const root = extractRootSubdomain(subdomain);
    const pending = this.pendingReservations.get(root);
    if (pending && pending.tunnelId === tunnelId) {
      this.pendingReservations.delete(root);
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
    return this.tunnels.get(extractRootSubdomain(subdomain));
  }

  isReservedInGracePeriod(subdomain: string): boolean {
    const pending = this.pendingReservations.get(extractRootSubdomain(subdomain));
    return Boolean(
      pending && pending.isGracePeriod && pending.expiresAt > Date.now(),
    );
  }

  isReservedByOwner(
    subdomain: string,
    tunnelId?: string,
    token?: string,
  ): boolean {
    const root = extractRootSubdomain(subdomain);
    const pending = this.pendingReservations.get(root);
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
    const root = extractRootSubdomain(subdomain);
    const now = Date.now();
    const pending = this.pendingReservations.get(root);
    if (pending) {
      if (pending.expiresAt <= now) {
        this.pendingReservations.delete(root);
      } else {
        const isOwner =
          (tunnelId && pending.tunnelId === tunnelId) ||
          (token && pending.token && pending.token === token);

        if (!isOwner) {
          return {
            available: false,
            reason: pending.isGracePeriod
              ? `Subdomain "${root}" is reserved for a reconnecting session. Please choose another or try again later.`
              : `Subdomain "${root}" is currently being reserved by another session.`,
          };
        }
      }
    }

    const local = this.get(root);
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
        reason: `Subdomain "${root}" is already in use by an active session.\nPlease choose a different subdomain or stop the active session first.`,
      };
    }

    if (tunnelId) {
      this.pendingReservations.set(root, {
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
    const root = extractRootSubdomain(subdomain);
    this.tunnels.delete(root);

    if (gracePeriodMs > 0 && tunnelId) {
      const expiresAt = Date.now() + gracePeriodMs;
      this.pendingReservations.set(root, {
        tunnelId,
        token,
        expiresAt,
        isGracePeriod: true,
      });

      const timer = setTimeout(() => {
        const current = this.pendingReservations.get(root);
        if (current && current.expiresAt <= Date.now()) {
          this.pendingReservations.delete(root);
        }
      }, gracePeriodMs + 500);
      timer.unref?.();
    } else {
      this.pendingReservations.delete(root);
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
