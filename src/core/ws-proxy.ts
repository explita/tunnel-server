import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import type { FastifyRequest } from "fastify";
import {
  sanitizeCloseCode,
  isIpAllowed,
  type TunnelMessage,
  type Headers,
} from "@explita/infra-protocol";
import { registry, type TunnelRegistry } from "./tunnel-registry.js";
import { checkBasicAuth, prepareForwardHeaders } from "../lib/utils.js";
import {
  metricsCollector,
  type MetricsCollector,
} from "./metrics-collector.js";

export class WebSocketProxy {
  constructor(
    private readonly registry: TunnelRegistry,
    private readonly metrics?: MetricsCollector,
  ) {}

  forward(
    clientSocket: WebSocket,
    request: FastifyRequest,
    subdomain: string,
  ): void {
    const tunnel = this.registry.get(subdomain);

    if (!tunnel) {
      try {
        if (this.registry.isReservedInGracePeriod(subdomain)) {
          clientSocket.close(1013, "Tunnel reconnecting");
        } else {
          clientSocket.close(1008, "Tunnel not found");
        }
      } catch {
        // Ignore if already closed
      }
      return;
    }

    if (tunnel.allowedIps && tunnel.allowedIps.length > 0) {
      if (!isIpAllowed(request.ip, tunnel.allowedIps)) {
        try {
          clientSocket.close(1008, "Access denied by IP allowlist");
        } catch {
          // Ignore if already closed
        }
        return;
      }
    }

    if (tunnel.auth) {
      const authHeader = request.headers["authorization"];
      if (!checkBasicAuth(authHeader, tunnel.auth)) {
        try {
          clientSocket.close(1008, "Authentication required");
        } catch {
          // Ignore if already closed
        }
        return;
      }
    }

    const id = randomUUID();

    const headers: Headers = prepareForwardHeaders({
      incomingHeaders: request.headers,
      subdomain,
      parentSubdomain: tunnel.subdomain,
      hostname: request.hostname,
      protocol: request.protocol,
      clientIp: request.ip,
      tunnelId: tunnel.id,
      requestId: id,
    });

    let isCleanedUp = false;
    let unregister: (() => void) | undefined;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      unregister?.();
      tunnel.socket.off("close", onTunnelClose);
      clientSocket.off("message", onClientMessage);
      clientSocket.off("close", onClientClose);
      clientSocket.off("error", onClientError);
    };

    unregister = tunnel.registerHandler(id, (msg: TunnelMessage) => {
      if (msg.type === "ws_data") {
        if (clientSocket.readyState === WebSocket.OPEN) {
          const data = msg.isBinary
            ? Buffer.from(msg.data, "base64")
            : msg.data;
          const bytes = Buffer.isBuffer(data)
            ? data.length
            : Buffer.byteLength(data);
          this.metrics?.recordBytes(bytes);
          try {
            clientSocket.send(data, { binary: !!msg.isBinary });
          } catch {
            cleanup();
          }
        }
      } else if (msg.type === "ws_close") {
        cleanup();
        if (
          clientSocket.readyState === WebSocket.OPEN ||
          clientSocket.readyState === WebSocket.CONNECTING
        ) {
          try {
            const code = sanitizeCloseCode(msg.code);
            clientSocket.close(code, msg.reason);
          } catch {
            try {
              clientSocket.close();
            } catch {
              // Ignore if already closing/closed
            }
          }
        }
      }
    });

    const onTunnelClose = () => {
      cleanup();
      if (
        clientSocket.readyState === WebSocket.OPEN ||
        clientSocket.readyState === WebSocket.CONNECTING
      ) {
        try {
          clientSocket.close(1000, "Tunnel disconnected");
        } catch {
          try {
            clientSocket.close();
          } catch {
            // Ignore if already closing/closed
          }
        }
      }
    };

    const toBuffer = (buf: Buffer | ArrayBuffer | Buffer[]): Buffer => {
      if (Buffer.isBuffer(buf)) return buf;
      if (Array.isArray(buf)) return Buffer.concat(buf);
      return Buffer.from(buf);
    };

    const onClientMessage = (
      data: Buffer | ArrayBuffer | Buffer[],
      isBinary: boolean,
    ) => {
      if (tunnel.socket.readyState === WebSocket.OPEN) {
        const buf = toBuffer(data);
        this.metrics?.recordRequest(buf.length);
        const payload = isBinary
          ? buf.toString("base64")
          : buf.toString("utf8");

        try {
          tunnel.send({
            type: "ws_data",
            id,
            data: payload,
            isBinary,
          });
        } catch {
          cleanup();
        }
      }
    };

    const onClientClose = (code: number, reason: Buffer) => {
      cleanup();
      if (tunnel.socket.readyState === WebSocket.OPEN) {
        try {
          tunnel.send({
            type: "ws_close",
            id,
            code,
            reason: reason ? reason.toString() : undefined,
          });
        } catch {
          // Ignore if socket already closed
        }
      }
    };

    const onClientError = () => {
      cleanup();
      if (tunnel.socket.readyState === WebSocket.OPEN) {
        try {
          tunnel.send({
            type: "ws_close",
            id,
            code: 1011,
            reason: "Client error",
          });
        } catch {
          // Ignore if socket already closed
        }
      }
    };

    tunnel.socket.on("close", onTunnelClose);
    clientSocket.on("message", onClientMessage);
    clientSocket.on("close", onClientClose);
    clientSocket.on("error", onClientError);

    // Notify agent to open local WebSocket connection
    try {
      tunnel.send({
        type: "ws_open",
        id,
        path: request.url,
        headers,
      });
    } catch {
      cleanup();
      try {
        clientSocket.close(1011, "Failed to reach tunnel agent");
      } catch {
        // Ignore
      }
    }
  }
}

export const wsProxy = new WebSocketProxy(registry, metricsCollector);
