import { timingSafeEqual } from "node:crypto";
import { createExplitaHeaders } from "@explita/infra-protocol";

export type ForwardHeadersOptions = {
  incomingHeaders: Record<string, unknown>;
  subdomain: string;
  parentSubdomain: string;
  hostname: string;
  protocol?: string;
  clientIp: string;
  tunnelId: string;
  requestId: string;
};

export function prepareForwardHeaders(
  options: ForwardHeadersOptions,
): Record<string, string> {
  const {
    incomingHeaders: rawHeaders,
    subdomain,
    parentSubdomain,
    hostname,
    protocol = "http",
    clientIp,
    tunnelId,
    requestId,
  } = options;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") {
      const lower = key.toLowerCase();
      // Strip any caller-supplied x-explita-* headers to prevent spoofing,
      // and strip intermediate proxy via headers (e.g. Caddy, Nginx)
      if (!lower.startsWith("x-explita-") && lower !== "via") {
        headers[lower] = value;
      }
    }
  }

  const host = headers["host"] || `${subdomain}.${hostname}`;
  // Always enforce the trusted public host as x-forwarded-host
  headers["x-forwarded-host"] = host;
  headers["x-forwarded-proto"] = headers["x-forwarded-proto"] || protocol;
  headers["x-forwarded-for"] = headers["x-forwarded-for"]
    ? `${headers["x-forwarded-for"]}, ${clientIp}`
    : clientIp;

  const explitaHeaders = createExplitaHeaders({
    subdomain,
    parentSubdomain,
    tunnelId,
    requestId,
    clientIp,
  });

  for (const [key, value] of Object.entries(explitaHeaders)) {
    headers[key] = value;
  }

  return headers;
}

export function checkBasicAuth(
  authHeader: string | undefined,
  expectedAuth: string,
): boolean {
  if (!authHeader || typeof authHeader !== "string") return false;
  if (!authHeader.startsWith("Basic ") && !authHeader.startsWith("basic ")) {
    return false;
  }
  try {
    const b64 = authHeader.slice(6).trim();
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    const credsBuf = Buffer.from(decoded);
    const expectedBuf = Buffer.from(expectedAuth);
    if (credsBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(credsBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}
