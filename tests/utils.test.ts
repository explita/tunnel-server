import "@explita/env-loader/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { prepareForwardHeaders } from "../src/lib/utils.js";

test("prepareForwardHeaders strips via and spoofed x-explita headers", () => {
  const headers = prepareForwardHeaders({
    incomingHeaders: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html",
      via: "2.0 Caddy, 1.1 varnish",
      Via: "1.1 other",
      "x-explita-fake": "malicious",
      authorization: "Bearer secret",
    },
    subdomain: "myapp",
    parentSubdomain: "myapp",
    hostname: "explita.test",
    protocol: "https",
    clientIp: "198.51.100.2",
    tunnelId: "tun-123",
    requestId: "req-456",
  });

  // via headers must be stripped
  assert.equal(headers["via"], undefined);
  assert.equal(headers["Via"], undefined);

  // caller-supplied x-explita-* must be stripped
  assert.equal(headers["x-explita-fake"], undefined);

  // legitimate headers preserved
  assert.equal(headers["user-agent"], "Mozilla/5.0");
  assert.equal(headers["accept"], "text/html");
  assert.equal(headers["authorization"], "Bearer secret");

  // standard proxy headers injected
  assert.equal(headers["x-forwarded-proto"], "https");
  assert.equal(headers["x-forwarded-host"], "myapp.explita.test");
  assert.equal(headers["x-forwarded-for"], "198.51.100.2");

  // verified x-explita-* headers properly added
  assert.equal(headers["x-explita-subdomain"], "myapp");
  assert.equal(headers["x-explita-tunnel-id"], "tun-123");
  assert.equal(headers["x-explita-request-id"], "req-456");
});
