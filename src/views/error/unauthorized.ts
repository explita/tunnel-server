import { escapeHtml } from "@explita/infra-protocol";
import { renderBaseErrorHtml } from "./base.js";
import { productName } from "../../lib/constants.js";

export function renderUnauthorizedHtml(
  subdomain: string,
  host: string,
): string {
  const safeSubdomain = escapeHtml(subdomain);
  const safeHost = escapeHtml(host);

  return renderBaseErrorHtml({
    pageTitle: `Authentication Required • ${productName}`,
    badgeCode: "ERR_UNAUTHORIZED",
    errorCode: "401 Unauthorized",
    title: "Authentication Required",
    badgeTone: "warning",
    descriptionHtml: `Access to tunnel <span class="highlight">${safeSubdomain}</span> is protected with Basic HTTP Authentication.`,
    infoItems: [
      {
        title: "Credentials Required",
        descriptionHtml: `This tunnel endpoint requires valid HTTP Basic Authentication credentials (username and password) configured by the tunnel owner.`,
        iconType: "warning",
      },
      {
        title: "Host Information",
        descriptionHtml: `Protected host: <code class="code-inline">${safeHost}</code>`,
        iconType: "info",
      },
      {
        title: "Automated / API Requests",
        descriptionHtml: `Send credentials via the standard HTTP header: <code class="code-inline">Authorization: Basic &lt;base64(user:pass)&gt;</code>`,
        iconType: "info",
      },
    ],
    showRetry: true,
  });
}
