import test from "node:test";
import assert from "node:assert/strict";
import { hostRouter } from "../src/core/host-router.js";
import { baseDomain } from "../src/lib/constants.js";
import { requestProxy } from "../src/core/request-proxy.js";
import { wsProxy } from "../src/core/ws-proxy.js";

test("HostRouter.extractSubdomain parses standard, nested, and port-formatted hosts", () => {
  assert.equal(hostRouter.extractSubdomain(baseDomain), undefined);
  assert.equal(hostRouter.extractSubdomain(`${baseDomain}:443`), undefined);
  assert.equal(hostRouter.extractSubdomain("localhost"), undefined);
  assert.equal(hostRouter.extractSubdomain(`my-app.${baseDomain}`), "my-app");
  assert.equal(hostRouter.extractSubdomain(`my-app.${baseDomain}:3000`), "my-app");
  assert.equal(hostRouter.extractSubdomain(`api.v1.${baseDomain}`), "api.v1");
  assert.equal(hostRouter.extractSubdomain(`my-app.${baseDomain}.`), "my-app");
});

test("HostRouter.isReservedSubdomain identifies default reserved subdomains and compound patterns", () => {
  assert.equal(hostRouter.isReservedSubdomain("admin"), true);
  assert.equal(hostRouter.isReservedSubdomain("api"), true);
  assert.equal(hostRouter.isReservedSubdomain("status"), true);
  assert.equal(hostRouter.isReservedSubdomain("nested.admin"), true);
  assert.equal(hostRouter.isReservedSubdomain("preview--api"), true);
  assert.equal(hostRouter.isReservedSubdomain("my-unreserved-app-xyz"), false);
});

test("HostRouter.route forwards valid subdomains to requestProxy", async (t) => {
  let forwardedSubdomain: string | undefined;

  t.mock.method(requestProxy, "forward", async (_req: any, _reply: any, sub: string) => {
    forwardedSubdomain = sub;
    return "forwarded";
  });

  const mockReq: any = { hostname: `app-123.${baseDomain}`, url: "/users" };
  const mockReply: any = {};

  const result = await hostRouter.route(mockReq, mockReply);
  assert.equal(result, "forwarded");
  assert.equal(forwardedSubdomain, "app-123");
});

test("HostRouter.route handles root and health requests without registry passed", async () => {
  // Test /_health on root domain
  let responseCode: number | undefined;
  let responseData: any;
  const healthReply: any = {
    code: (c: number) => {
      responseCode = c;
      return healthReply;
    },
    type: () => healthReply,
    send: (data: any) => {
      responseData = data;
      return data;
    },
  };

  await hostRouter.route({ hostname: baseDomain, url: "/_health" } as any, healthReply);
  assert.equal(responseCode, 200);
  assert.equal(responseData.status, "ok");
  assert.equal(typeof responseData.activeTunnels, "number");

  // Test /robots.txt on root domain
  let textResponse: string | undefined;
  const robotsReply: any = {
    code: (c: number) => {
      responseCode = c;
      return robotsReply;
    },
    type: () => robotsReply,
    send: (data: string) => {
      textResponse = data;
      return data;
    },
  };

  await hostRouter.route({ hostname: baseDomain, url: "/robots.txt" } as any, robotsReply);
  assert.equal(responseCode, 200);
  assert.ok(textResponse?.includes("User-agent: *"));
});

test("HostRouter.routeWs forwards valid subdomains and rejects invalid hosts with 1008", (t) => {
  let forwardedWsSubdomain: string | undefined;
  let closedCode: number | undefined;
  let closedReason: string | undefined;

  t.mock.method(wsProxy, "forward", (_socket: any, _req: any, sub: string) => {
    forwardedWsSubdomain = sub;
  });

  const mockSocket: any = {
    close: (code: number, reason: string) => {
      closedCode = code;
      closedReason = reason;
    },
  };

  // Valid subdomain
  hostRouter.routeWs(mockSocket, { hostname: `app-ws.${baseDomain}` } as any);
  assert.equal(forwardedWsSubdomain, "app-ws");
  assert.equal(closedCode, undefined);

  // Reserved subdomain
  hostRouter.routeWs(mockSocket, { hostname: `admin.${baseDomain}` } as any);
  assert.equal(closedCode, 1008);
  assert.equal(closedReason, "Invalid host");
});
