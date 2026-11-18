import { escapeHtml } from "@explita/infra-protocol";
import { renderBaseErrorHtml } from "./base.js";
import { productName } from "../../lib/constants.js";

export function renderTunnelTimeoutHtml(
  subdomain: string,
  host: string,
): string {
  const safeSubdomain = escapeHtml(subdomain);
  const safeHost = escapeHtml(host);

  return renderBaseErrorHtml({
    pageTitle: `Gateway Timeout • ${productName}`,
    badgeCode: "ERR_TUNNEL_TIMEOUT",
    errorCode: "504 Gateway Timeout",
    title: "Tunnel Request Timed Out",
    descriptionHtml: `The tunnel gateway waited 30 seconds, but your local application behind <span class="highlight">${safeSubdomain}</span> failed to respond.`,
    infoItems: [
      {
        title: "Local Application Not Responding",
        descriptionHtml: `The tunnel agent is connected, but the local web server on your machine took too long to return a response or crashed.`,
        iconType: "danger",
      },
      {
        title: "Host Information",
        descriptionHtml: `Requested host: <code class="code-inline">${safeHost}</code>`,
        iconType: "info",
      },
      {
        title: "Troubleshooting",
        descriptionHtml: `Check your local application console for hung requests, unhandled errors, or long-running tasks.`,
        iconType: "warning",
      },
    ],
    showRetry: true,
  });
}
