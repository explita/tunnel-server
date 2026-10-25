import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  EXPLITA_HEADERS,
  HOP_BY_HOP_HEADERS,
  MAX_REQUESTS_PER_SECOND,
  PRODUCT_NAME,
  isIpAllowed,
  type TunnelMessage,
  type TunnelRequest,
} from "@explita/infra-protocol";
import { registry, type TunnelRegistry } from "./tunnel-registry.js";
import {
  renderBadGatewayHtml,
  renderForbiddenHtml,
  renderTunnelNotFoundHtml,
  renderTunnelReconnectingHtml,
  renderTunnelTimeoutHtml,
  renderUnauthorizedHtml,
} from "../views/error-page.js";
import { checkBasicAuth, prepareForwardHeaders } from "../lib/utils.js";
import {
  metricsCollector,
  type MetricsCollector,
} from "./metrics-collector.js";

class TunnelRateLimiter {
  private readonly windows = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private lastCleanup = Date.now();

  check(tunnelId: string, maxPerSecond = 100): boolean {
    const now = Date.now();

    // Periodic sweep every 10s to clean stale entries
    if (now - this.lastCleanup > 10_000) {
      this.lastCleanup = now;
      for (const [id, entry] of this.windows.entries()) {
        if (now - entry.windowStart > 5000) {
          this.windows.delete(id);
        }
      }
    }

    const current = this.windows.get(tunnelId);
    if (!current || now - current.windowStart >= 1000) {
      this.windows.set(tunnelId, { count: 1, windowStart: now });
      return true;
    }

    if (current.count >= maxPerSecond) {
      return false;
    }

    current.count++;
    return true;
  }
}

export class RequestProxy {
  private readonly rateLimiter = new TunnelRateLimiter();

  constructor(
    private readonly registry: TunnelRegistry,
    private readonly metrics?: MetricsCollector,
  ) {}

  async forward(
    request: FastifyRequest,
    reply: FastifyReply,
    subdomain: string,
  ) {
    const tunnel = this.registry.get(subdomain);

    if (!tunnel) {
      if (this.registry.isReservedInGracePeriod(subdomain)) {
        return reply
          .code(503)
          .header("Retry-After", "10")
          .type("text/html; charset=utf-8")
          .send(renderTunnelReconnectingHtml(subdomain, request.hostname));
      }

      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(renderTunnelNotFoundHtml(subdomain, request.hostname));
    }

    // IP / CIDR Allowlist enforcement
    if (tunnel.allowedIps && tunnel.allowedIps.length > 0) {
      if (!isIpAllowed(request.ip, tunnel.allowedIps)) {
        reply.code(403);
        const accept = request.headers["accept"] || "";
        if (accept.includes("text/html")) {
          return reply
            .type("text/html; charset=utf-8")
            .send(renderForbiddenHtml(subdomain, request.hostname, request.ip));
        }

        return reply.type("application/json; charset=utf-8").send({
          error: "Forbidden",
          message: "Access denied by tunnel IP allowlist.",
          statusCode: 403,
        });
      }
    }

    // Basic HTTP Authentication enforcement
    if (tunnel.auth) {
      const authHeader = request.headers["authorization"];
      if (!checkBasicAuth(authHeader, tunnel.auth)) {
        const safeRealm = subdomain.replace(/["\\]/g, "");
        reply
          .code(401)
          .header(
            "WWW-Authenticate",
            `Basic realm="${PRODUCT_NAME} - ${safeRealm}"`,
          );

        const accept = request.headers["accept"] || "";
        if (accept.includes("text/html")) {
          return reply
            .type("text/html; charset=utf-8")
            .send(renderUnauthorizedHtml(subdomain, request.hostname));
        }

        return reply.type("application/json; charset=utf-8").send({
          error: "Unauthorized",
          message:
            "Authentication required. Provide valid HTTP Basic Authentication credentials.",
          statusCode: 401,
        });
      }
    }

    // Rate limiting per tunnel
    if (!this.rateLimiter.check(tunnel.id, MAX_REQUESTS_PER_SECOND)) {
      return reply
        .code(429)
        .header("Retry-After", "1")
        .type("application/json; charset=utf-8")
        .send({
          error: "Too Many Requests",
          message: `Tunnel rate limit exceeded (${MAX_REQUESTS_PER_SECOND} req/s). Please slow down.`,
          statusCode: 429,
        });
    }

    const id = randomUUID();

    let body: string | undefined = undefined;
    let isBinary = false;

    if (request.body != null) {
      if (Buffer.isBuffer(request.body)) {
        body = request.body.toString("base64");
        isBinary = true;
      } else if (typeof request.body === "string") {
        body = request.body;
      } else {
        body = JSON.stringify(request.body);
      }
    }

    const incomingHeaders = prepareForwardHeaders({
      incomingHeaders: request.headers,
      subdomain,
      parentSubdomain: tunnel.subdomain,
      hostname: request.hostname,
      protocol: request.protocol,
      clientIp: request.ip,
      tunnelId: tunnel.id,
      requestId: id,
    });

    const message: TunnelRequest = {
      type: "request",
      id,
      method: request.method,
      path: request.url,
      headers: incomingHeaders,
      body,
      isBinary,
    };

    const reqBytes = body
      ? isBinary
        ? Buffer.from(body, "base64").length
        : Buffer.byteLength(body)
      : 0;
    this.metrics?.recordRequest(reqBytes);

    return new Promise<void>((resolve) => {
      let isCleanedUp = false;
      let unregister: (() => void) | undefined;

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        clearTimeout(timer);
        unregister?.();
        tunnel.socket.off("close", onClose);
      };

      const timer = setTimeout(() => {
        cleanup();
        if (!reply.raw.headersSent) {
          reply
            .code(504)
            .type("text/html; charset=utf-8")
            .send(renderTunnelTimeoutHtml(subdomain, request.hostname));
        } else {
          reply.raw.destroy();
        }
        resolve();
      }, 30_000);

      const onClose = () => {
        cleanup();
        if (!reply.raw.headersSent) {
          reply
            .code(502)
            .type("text/html; charset=utf-8")
            .send(renderTunnelNotFoundHtml(subdomain, request.hostname));
        } else {
          reply.raw.destroy();
        }
        resolve();
      };

      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) {
          cleanup();
          resolve();
        }
      });

      unregister = tunnel.registerHandler(id, (msg: TunnelMessage) => {
        if (msg.type === "response_start") {
          clearTimeout(timer);
          reply.hijack();
          const filteredHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(msg.headers)) {
            if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
              filteredHeaders[key] = value;
            }
          }
          filteredHeaders[EXPLITA_HEADERS.REQUEST_ID] = id;
          filteredHeaders[EXPLITA_HEADERS.TUNNEL_ID] = tunnel.id;
          filteredHeaders[EXPLITA_HEADERS.SUBDOMAIN] = subdomain;
          reply.raw.writeHead(msg.status, filteredHeaders);
          return;
        }

        if (msg.type === "response_chunk") {
          if (!reply.raw.headersSent) {
            reply.hijack();
          }
          const buf = msg.isBinary
            ? Buffer.from(msg.chunk, "base64")
            : Buffer.from(msg.chunk, "utf8");
          this.metrics?.recordBytes(buf.length);
          reply.raw.write(buf);
          return;
        }

        if (msg.type === "response_end") {
          cleanup();
          reply.raw.end();
          resolve();
          return;
        }

        if (msg.type === "response") {
          cleanup();
          reply.hijack();
          const filteredHeaders: Record<string, string> = {};
          for (const [key, value] of Object.entries(msg.headers)) {
            if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
              filteredHeaders[key] = value;
            }
          }
          filteredHeaders[EXPLITA_HEADERS.REQUEST_ID] = id;
          filteredHeaders[EXPLITA_HEADERS.TUNNEL_ID] = tunnel.id;
          filteredHeaders[EXPLITA_HEADERS.SUBDOMAIN] = subdomain;

          if (msg.isBinary && msg.body) {
            const buffer = Buffer.from(msg.body, "base64");
            this.metrics?.recordBytes(buffer.length);
            filteredHeaders["content-length"] = String(buffer.length);
            reply.raw.writeHead(msg.status, filteredHeaders);
            reply.raw.end(buffer);
          } else {
            const buffer = Buffer.from(msg.body ?? "", "utf8");
            this.metrics?.recordBytes(buffer.length);
            filteredHeaders["content-length"] = String(buffer.length);
            reply.raw.writeHead(msg.status, filteredHeaders);
            reply.raw.end(buffer);
          }
          resolve();
          return;
        }

        if (msg.type === "error") {
          cleanup();
          if (!reply.raw.headersSent) {
            const accept = (request.headers["accept"] as string) || "";
            const isJson =
              accept.includes("application/json") &&
              !accept.includes("text/html");

            if (isJson) {
              const details =
                !msg.message || msg.message === "fetch failed"
                  ? msg.port
                    ? `Connection refused: No application listening on localhost:${msg.port} (ECONNREFUSED)`
                    : "Connection refused: Local application is offline"
                  : msg.message;

              reply
                .code(502)
                .type("application/json; charset=utf-8")
                .send({
                  error: "Bad Gateway",
                  message: msg.port
                    ? `Unable to reach localhost:${msg.port}`
                    : "Unable to reach local target",
                  details,
                  statusCode: 502,
                });
            } else {
              reply
                .code(502)
                .type("text/html; charset=utf-8")
                .send(
                  renderBadGatewayHtml({
                    subdomain,
                    host: request.hostname,
                    port: msg.port,
                    errorMessage: msg.message,
                    path: request.url,
                    method: request.method,
                  }),
                );
            }
          } else {
            reply.raw.destroy();
          }
          resolve();
        }
      });

      tunnel.socket.on("close", onClose);
      try {
        tunnel.send(message);
      } catch {
        onClose();
      }
    });
  }
}

export const requestProxy = new RequestProxy(registry, metricsCollector);
