import {
  PRODUCT_NAME,
  DEFAULT_TUNNEL_DOMAIN,
  DEFAULT_RECONNECT_GRACE_PERIOD_MS,
} from "@explita/infra-protocol";

import { getReservedSubdomains } from "./reserved-subdomains.js";

export const reservedSubdomains = getReservedSubdomains();

export const baseDomain = (
  process.env.TUNNEL_DOMAIN || DEFAULT_TUNNEL_DOMAIN
).toLowerCase();

export const protocol =
  process.env.NODE_ENV === "production" ? "https" : "http";

export const productName = PRODUCT_NAME.tunnel;

export const docsUrl = process.env.DOCS_URL;
export const reconnectGracePeriodMs = process.env.RECONNECT_GRACE_PERIOD_MS
  ? Number(process.env.RECONNECT_GRACE_PERIOD_MS)
  : DEFAULT_RECONNECT_GRACE_PERIOD_MS;
