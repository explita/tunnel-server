import { escapeHtml } from "@explita/infra-protocol";
import { renderBaseErrorHtml } from "./base.js";
import { productName } from "../../lib/constants.js";

export function renderTunnelReconnectingHtml(
  subdomain: string,
  host: string,
): string {
  const safeSubdomain = escapeHtml(subdomain);
  const safeHost = escapeHtml(host);

  return renderBaseErrorHtml({
    pageTitle: `Tunnel Reconnecting • ${productName}`,
    badgeCode: "ERR_TUNNEL_RECONNECTING",
    errorCode: "503 Service Unavailable",
    title: "Tunnel Reconnecting",
    badgeTone: "warning",
    descriptionHtml: `The agent for subdomain <span class="highlight">${safeSubdomain}</span> is temporarily disconnected and reconnecting. The subdomain is reserved.`,
    infoItems: [
      {
        title: "Subdomain Reserved",
        descriptionHtml: `This subdomain is protected by a reconnect grace period and cannot be claimed by another session.`,
        iconType: "info",
      },
      {
        title: "Automatic Reconnection",
        descriptionHtml: `The agent is re-establishing its WebSocket connection. This page will automatically retry in a few moments.`,
        iconType: "warning",
      },
      {
        title: "Host Information",
        descriptionHtml: `Requested host: <code class="code-inline">${safeHost}</code>`,
        iconType: "info",
      },
    ],
    showRetry: true,
    autoReloadSeconds: 10,
  });
}
