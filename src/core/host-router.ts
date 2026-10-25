import type { WebSocket } from "ws";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requestProxy } from "./request-proxy.js";
import { wsProxy } from "./ws-proxy.js";
import { getHealthInfo, type HealthInfo } from "../services/health/index.js";
import { baseDomain, docsUrl, reservedSubdomains } from "../lib/constants.js";

export type { HealthInfo };

export class HostRouter {
  extractSubdomain = (hostname: string): string | undefined => {
    if (!hostname) return undefined;
    const host = hostname.toLowerCase().split(":")[0].replace(/\.+$/, "");
    const base = baseDomain.split(":")[0].toLowerCase().replace(/\.+$/, "");

    if (host === base || !host.includes(".")) {
      return undefined;
    }

    if (host.endsWith(`.${base}`)) {
      return host.slice(0, -(base.length + 1));
    }

    const parts = host.split(".");
    return parts.length > 1 ? parts[0] : undefined;
  };

  isReservedSubdomain = (subdomain: string): boolean => {
    const sub = subdomain.toLowerCase();
    if (reservedSubdomains.has(sub)) return true;
    const dotIndex = sub.lastIndexOf(".");
    if (dotIndex !== -1) {
      const rootParent = sub.slice(dotIndex + 1);
      if (reservedSubdomains.has(rootParent)) return true;
    }
    const dashIndex = sub.lastIndexOf("--");
    if (dashIndex !== -1) {
      const rootParent = sub.slice(dashIndex + 2);
      if (reservedSubdomains.has(rootParent)) return true;
    }
    return false;
  };

  handleRootRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const pathname = request.url.split("?")[0];

    if (pathname === "/_health") {
      return reply
        .code(200)
        .type("application/json; charset=utf-8")
        .send(getHealthInfo());
    }

    if (pathname === "/robots.txt") {
      return reply
        .code(200)
        .type("text/plain; charset=utf-8")
        .send("User-agent: *\nDisallow: /\n");
    }

    if (docsUrl) {
      return reply.redirect(docsUrl, 302);
    }

    return reply.code(200).type("application/json; charset=utf-8").send({
      service: "explita-tunnel-server",
      status: "ok",
      websocket: "/_connect",
      health: "/_health",
    });
  };

  route = async (request: FastifyRequest, reply: FastifyReply) => {
    const host = request.hostname || (request.headers.host as string) || "";
    const subdomain = this.extractSubdomain(host);

    if (!subdomain || this.isReservedSubdomain(subdomain)) {
      return this.handleRootRequest(request, reply);
    }

    return requestProxy.forward(request, reply, subdomain);
  };

  routeWs = (socket: WebSocket, request: FastifyRequest) => {
    const host = request.hostname || (request.headers.host as string) || "";
    const subdomain = this.extractSubdomain(host);

    if (!subdomain || this.isReservedSubdomain(subdomain)) {
      socket.close(1008, "Invalid host");
      return;
    }

    wsProxy.forward(socket, request, subdomain);
  };
}

export const hostRouter = new HostRouter();
