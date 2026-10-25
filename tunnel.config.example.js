/**
 * Explita Tunnel Server Configuration Template
 *
 * To enable the @explita/tunnel-server-plugin (database auth, email OTP, metrics):
 * 1. Install the plugin:
 *    pnpm add @explita/tunnel-server-plugin
 *
 * 2. Copy this file to tunnel.config.js:
 *    cp tunnel.config.example.js tunnel.config.js
 *
 * 3. Set your environment variables in .env (DATABASE_URL, INTERNAL_SECRET, etc.)
 *
 * 4. Apply the database schema:
 *    pnpm db:push
 *
 * Note: tunnel.config.js is in .gitignore, so your custom configurations and plugins
 * will never be overwritten when running 'git pull' for upstream tunnel updates.
 */

import {
  registerTunnelPlugin,
  validateToken,
} from "@explita/tunnel-server-plugin";

/**
 * Configure custom plugins and middleware for the Explita Tunnel gateway.
 *
 * @param {import("fastify").FastifyInstance} app - The Fastify server instance
 * @param {object} context - Gateway context
 * @param {any} context.registry - Active tunnel connections registry
 * @param {object} context.metricsCollector - Gateway telemetry collector
 */
export default async function configure(app, context) {
  // Optional SMTP setup for Email OTP verification
  const smtpOptions = process.env.SMTP_URL
    ? {
        url: process.env.SMTP_URL,
        from: process.env.SMTP_FROM,
      }
    : process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure:
            process.env.SMTP_SECURE === "true" ||
            process.env.SMTP_PORT === "465",
          auth: process.env.SMTP_USER
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS || "",
              }
            : undefined,
          from: process.env.SMTP_FROM,
        }
      : undefined;

  // Register the auth & telemetry plugin
  registerTunnelPlugin(app, {
    internalSecret: process.env.INTERNAL_SECRET,
    smtp: smtpOptions,
    metricsCollector: {
      setPersister: (p) => context.metricsCollector.setPersister(p),
      getActiveTunnelsCount: () => context.registry.size,
      getSnapshot: () => context.metricsCollector.getSnapshot(),
      getStats: (s) => context.metricsCollector.getStats(s),
    },
  });

  // Return custom token validator to hook into WebSocket connection handler
  return {
    validateToken,
  };
}
