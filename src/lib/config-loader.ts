import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FastifyInstance } from "fastify";
import type { TunnelRegistry } from "../core/tunnel-registry.js";
import type { MetricsCollector } from "../core/metrics-collector.js";

export interface CustomConfigContext {
  registry: TunnelRegistry;
  metricsCollector: MetricsCollector;
}

export interface CustomConfigResult {
  validateToken?: (token: string) => Promise<boolean> | boolean;
}

export const CONFIG_FILE_NAME = "tunnel.config.js";

export async function loadCustomConfig(
  app: FastifyInstance,
  context: CustomConfigContext,
): Promise<CustomConfigResult | undefined> {
  const configPath = resolve(process.cwd(), CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const configModule = await import(pathToFileURL(configPath).href);
    const configure = configModule.default || configModule.configure;
    if (typeof configure === "function") {
      const result = await configure(app, context);
      return result || undefined;
    }
  } catch (err) {
    console.error(
      `[tunnel] Error loading custom config from ${CONFIG_FILE_NAME}:`,
      err,
    );
  }

  return undefined;
}
