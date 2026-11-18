import { escapeHtml } from "@explita/infra-protocol";
import { renderBaseErrorHtml } from "./base.js";
import { productName } from "../../lib/constants.js";

export function renderTunnelNotFoundHtml(
  subdomain: string,
  host: string,
): string {
  const safeSubdomain = escapeHtml(subdomain);
  const safeHost = escapeHtml(host);

  return renderBaseErrorHtml({
    pageTitle: `Tunnel Not Found • ${productName}`,
    badgeCode: "ERR_TUNNEL_NOT_FOUND",
    errorCode: "404 Error",
    title: "Tunnel Not Found",
    descriptionHtml: `The tunnel server could not find an active agent connection listening for subdomain <span class="highlight">${safeSubdomain}</span>.`,
    infoItems: [
      {
        title: "No Active Client Connected",
        descriptionHtml: `The developer agent running for this tunnel has disconnected or has not been started yet.`,
        iconType: "danger",
      },
      {
        title: "Host Information",
        descriptionHtml: `Requested host: <code class="code-inline">${safeHost}</code>`,
        iconType: "info",
      },
    ],
    cliCommand: safeSubdomain ? `eta 3000 -s ${safeSubdomain}` : "eta 3000",
    showRetry: true,
  });
}
