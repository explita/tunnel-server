import "@explita/env-loader/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { RequestProxy } from "../src/core/request-proxy.js";
import { TunnelRegistry } from "../src/core/tunnel-registry.js";
import type { FastifyReply, FastifyRequest } from "fastify";

test("RequestProxy rejects unauthorized IP with 403 Forbidden", async () => {
  const registry = new TunnelRegistry();
  const proxy = new RequestProxy(registry);

  const mockTunnel: any = {
    id: "test-tunnel-id",
    subdomain: "myapp",
    allowedIps: ["10.0.0.0/8", "192.168.1.100"],
    socket: { readyState: 1, send: () => {} },
    send: () => {},
    registerHandler: () => () => {},
  };

  registry.add(mockTunnel);

  let statusCode = 200;
  let sentBody: any = null;
  let contentType = "";

  const mockReply: any = {
    code(c: number) {
      statusCode = c;
      return this;
    },
    header() {
      return this;
    },
    type(t: string) {
      contentType = t;
      return this;
    },
    send(b: any) {
      sentBody = b;
      return this;
    },
  };

  const mockRequest: any = {
    ip: "203.0.113.5",
    hostname: "myapp.explita.test",
    headers: {
      accept: "application/json",
    },
  };

  await proxy.forward(
    mockRequest as FastifyRequest,
    mockReply as FastifyReply,
    "myapp",
  );

  assert.equal(statusCode, 403);
  assert.equal(sentBody.error, "Forbidden");
  assert.equal(sentBody.statusCode, 403);
  assert.match(sentBody.message, /IP allowlist/);
});

test("RequestProxy allows authorized IP", async () => {
  const registry = new TunnelRegistry();
  const proxy = new RequestProxy(registry);

  let tunnelReceivedRequest = false;

  const mockTunnel: any = {
    id: "test-tunnel-id-2",
    subdomain: "myapp2",
    allowedIps: ["10.0.0.0/8", "192.168.1.100"],
    socket: {
      readyState: 1,
      on: () => {},
      once: () => {},
      off: () => {},
    },
    send: (msg: any) => {
      tunnelReceivedRequest = true;
    },
    registerHandler: (id: string, handler: any) => {
      setImmediate(() => {
        handler({
          type: "response",
          id,
          status: 200,
          headers: {},
          body: "ok",
        });
      });
      return () => {};
    },
  };

  registry.add(mockTunnel);

  const mockReply: any = {
    code: () => mockReply,
    header: () => mockReply,
    type: () => mockReply,
    send: () => mockReply,
    hijack: () => {},
    raw: {
      writeHead: () => {},
      write: () => {},
      end: (_buf?: any, cb?: () => void) => {
        if (typeof _buf === "function") _buf();
        else cb?.();
      },
      on: () => {},
      off: () => {},
    },
  };

  const mockRequest: any = {
    ip: "10.2.3.4", // Inside 10.0.0.0/8
    hostname: "myapp2.explita.test",
    method: "GET",
    protocol: "https",
    url: "/api/test",
    headers: {},
  };

  // Start forwarding (tunnel mock will receive request message)
  await proxy.forward(
    mockRequest as FastifyRequest,
    mockReply as FastifyReply,
    "myapp2",
  );
  assert.equal(tunnelReceivedRequest, true);
});
