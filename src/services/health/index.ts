import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { registry } from "../../core/tunnel-registry.js";

export type HealthInfo = {
  status: string;
  uptime: number;
  activeTunnels: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  timestamp: string;
};

export function getHealthInfo(): HealthInfo {
  const memoryUsage = process.memoryUsage();
  return {
    status: "ok",
    uptime: Math.floor(process.uptime()),
    activeTunnels: registry.size,
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
    },
    timestamp: new Date().toISOString(),
  };
}

export function registerHealthRoutes(app: FastifyInstance): void {
  const handleHealth = async (
    _request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    return reply
      .code(200)
      .type("application/json; charset=utf-8")
      .send(getHealthInfo());
  };

  app.get("/_health", handleHealth);
}
