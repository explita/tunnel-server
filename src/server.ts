import "@explita/env-loader/auto/watch";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import compress from "@fastify/compress";
import { registry } from "./core/tunnel-registry.js";
import { ConnectionHandler } from "./core/connection-handler.js";
import { hostRouter } from "./core/host-router.js";
import { registerHealthRoutes } from "./services/health/index.js";
import { MAX_REQUEST_BODY_SIZE } from "@explita/infra-protocol";
import { metricsCollector } from "./core/metrics-collector.js";
import { loadCustomConfig } from "./lib/config-loader.js";

const app = Fastify({
  logger: false,
  bodyLimit: MAX_REQUEST_BODY_SIZE, // 25 MB max payload
  trustProxy: true,
});

app.removeAllContentTypeParsers();
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, payload, done) => {
  done(null, payload);
});

await app.register(websocket);
await app.register(compress, {
  // Compress text, json, xml, svg, but exclude streaming SSE (text/event-stream)
  customTypes:
    /^text\/(?!event-stream)|\+json$|\+xml$|application\/xml|application\/json|image\/svg\+xml/,
  threshold: 1024,
});

const customConfig = await loadCustomConfig(app, {
  registry,
  metricsCollector,
});

const connectionHandler = new ConnectionHandler({
  registry,
  metrics: metricsCollector,
  validateToken: customConfig?.validateToken,
});

app.get("/_connect", { websocket: true }, (socket) => {
  connectionHandler.handle(socket);
});

registerHealthRoutes(app);

app.route({
  method: "GET",
  url: "/*",
  handler: hostRouter.route,
  wsHandler: hostRouter.routeWs,
});

app.route({
  method: ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  url: "/*",
  handler: async (request, reply) => {
    return hostRouter.route(request, reply);
  },
});

app.addHook("onClose", async () => {
  metricsCollector.destroy();
  await metricsCollector.flush();
  registry.clearAll();
});

let isShuttingDown = false;
const onSignal = () => {
  if (isShuttingDown) {
    process.exit(0);
  }
  isShuttingDown = true;
  // Unref timer ensures process exits if app.close() takes longer than 2s
  const timer = setTimeout(() => process.exit(0), 2000);
  timer.unref();
  app
    .close()
    .catch(() => {})
    .finally(() => {
      process.exit(0);
    });
};

process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

app.listen(
  {
    host: "0.0.0.0",
    port: Number(process.env.HTTP_PORT),
  },
  (err, address) => {
    if (err) return console.log(`Connection error: ${err.message}!`);
    console.log(`Server running on: ${address}`);
  },
);
