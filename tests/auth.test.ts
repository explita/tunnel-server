import "@explita/env-loader/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { ConnectionHandler } from "../src/core/connection-handler.js";
import { TunnelRegistry } from "../src/core/tunnel-registry.js";
import { encode, decode, PROTOCOL_VERSION } from "@explita/infra-protocol";
import { EventEmitter } from "node:events";

class MockWebSocket extends EventEmitter {
  OPEN = 1;
  readyState = 1;
  sentMessages: any[] = [];
  closeCode?: number;
  closeReason?: string;
  _binaryType = "nodebuffer";

  send(data: any) {
    this.sentMessages.push(decode(Buffer.from(data)));
  }

  close(code?: number, reason?: string) {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
    this.emit("close", code, reason);
  }
}

test("ConnectionHandler rejects when token is missing and auth is enabled", async () => {
  const registry = new TunnelRegistry();
  const handler = new ConnectionHandler({
    registry,
    authTokens: new Set(["valid-tok"]),
  });

  const ws = new MockWebSocket();
  handler.handle(ws as any);

  // Send hello without token
  ws.emit(
    "message",
    encode({
      type: "hello",
      version: PROTOCOL_VERSION,
    }),
  );

  // Allow async message handler to complete
  await new Promise((r) => setImmediate(r));

  assert.equal(ws.closeCode, 1008);
  assert.equal(ws.closeReason, "Token required");
  assert.equal(ws.sentMessages.length, 1);
  assert.equal(ws.sentMessages[0].type, "error");
  assert.match(ws.sentMessages[0].message, /eta config set token <your-token>/);
});

test("ConnectionHandler accepts valid static token", async () => {
  const registry = new TunnelRegistry();
  const handler = new ConnectionHandler({
    registry,
    authTokens: new Set(["secret-tok-123"]),
  });

  const ws = new MockWebSocket();
  handler.handle(ws as any);

  ws.emit(
    "message",
    encode({
      type: "hello",
      version: PROTOCOL_VERSION,
      token: "secret-tok-123",
      subdomain: "my-test-sub",
    }),
  );

  await new Promise((r) => setImmediate(r));

  // Should succeed, not close with 1008
  assert.equal(ws.closeCode, undefined);
  assert.equal(ws.sentMessages.length, 1);
  assert.equal(ws.sentMessages[0].type, "ready");
  assert.equal(ws.sentMessages[0].subdomain, "my-test-sub");
  ws.emit("close", 1000);
});

test("ConnectionHandler rejects invalid static token", async () => {
  const registry = new TunnelRegistry();
  const handler = new ConnectionHandler({
    registry,
    authTokens: new Set(["static-secret"]),
  });

  const ws = new MockWebSocket();
  handler.handle(ws as any);

  ws.emit(
    "message",
    encode({
      type: "hello",
      version: PROTOCOL_VERSION,
      token: "wrong-token",
      subdomain: "my-test-sub",
    }),
  );

  await new Promise((r) => setImmediate(r));

  assert.equal(ws.closeCode, 1008);
  assert.equal(ws.closeReason, "Invalid token");
  assert.equal(ws.sentMessages.length, 1);
  assert.equal(ws.sentMessages[0].type, "error");
  assert.match(ws.sentMessages[0].message, /Invalid token/);
});

test("ConnectionHandler uses validateToken callback when requireAuth: true", async () => {
  const registry = new TunnelRegistry();
  let validatedTokenValue = "";
  const handler = new ConnectionHandler({
    registry,
    requireAuth: true,
    validateToken: async (tok) => {
      validatedTokenValue = tok;
      return tok === "custom-cloud-token";
    },
  });

  const ws = new MockWebSocket();
  handler.handle(ws as any);

  ws.emit(
    "message",
    encode({
      type: "hello",
      version: PROTOCOL_VERSION,
      token: "custom-cloud-token",
      subdomain: "valid-sub",
    }),
  );

  await new Promise((r) => setImmediate(r));

  assert.equal(validatedTokenValue, "custom-cloud-token");
  assert.equal(ws.closeCode, undefined);
  assert.equal(ws.sentMessages[0].type, "ready");
  ws.emit("close", 1000);
});

test("ConnectionHandler defaults to open mode when no auth options are configured", async () => {
  const origAuthTokens = process.env.AUTH_TOKENS;
  delete process.env.AUTH_TOKENS;

  try {
    const registry = new TunnelRegistry();
    const handler = new ConnectionHandler({
      registry,
    });

    const ws = new MockWebSocket();
    handler.handle(ws as any);

    ws.emit(
      "message",
      encode({
        type: "hello",
        version: PROTOCOL_VERSION,
        subdomain: "open-mode",
      }),
    );

    await new Promise((r) => setImmediate(r));

    assert.equal(ws.closeCode, undefined);
    assert.equal(ws.sentMessages[0].type, "ready");
    ws.emit("close", 1000);
  } finally {
    if (origAuthTokens !== undefined) process.env.AUTH_TOKENS = origAuthTokens;
  }
});

test("ConnectionHandler automatically requires auth when validateToken is provided", async () => {
  const registry = new TunnelRegistry();
  let called = false;
  const handler = new ConnectionHandler({
    registry,
    validateToken: async () => {
      called = true;
      return true;
    },
  });

  const ws = new MockWebSocket();
  handler.handle(ws as any);

  // Connecting without token should fail because auth is automatically required
  ws.emit(
    "message",
    encode({
      type: "hello",
      version: PROTOCOL_VERSION,
      subdomain: "auto-auth",
    }),
  );

  await new Promise((r) => setImmediate(r));

  assert.equal(ws.closeCode, 1008);
  assert.equal(ws.closeReason, "Token required");
  assert.equal(called, false);
});

test("ConnectionHandler respects requireAuth: true option", async () => {
  const registry = new TunnelRegistry();
  const handler = new ConnectionHandler({
    registry,
    requireAuth: true,
  });

  const ws = new MockWebSocket();
  handler.handle(ws as any);

  ws.emit(
    "message",
    encode({
      type: "hello",
      version: PROTOCOL_VERSION,
      subdomain: "auth-enforced",
    }),
  );

  await new Promise((r) => setImmediate(r));

  assert.equal(ws.closeCode, 1008);
  assert.equal(ws.closeReason, "Token required");
});
