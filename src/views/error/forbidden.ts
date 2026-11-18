import { escapeHtml } from "@explita/infra-protocol";
import { renderBaseErrorHtml } from "./base.js";
import { productName } from "../../lib/constants.js";

export function renderForbiddenHtml(
  subdomain: string,
  host: string,
  clientIp?: string,
): string {
  const safeSubdomain = escapeHtml(subdomain);
  const safeHost = escapeHtml(host);
  const safeClientIp = clientIp ? escapeHtml(clientIp) : undefined;

  return renderBaseErrorHtml({
    pageTitle: `Access Forbidden • ${productName}`,
    badgeCode: "ERR_FORBIDDEN",
    errorCode: "403 Forbidden",
    title: "Access Forbidden",
    badgeTone: "danger",
    descriptionHtml: `Access to tunnel <span class="highlight">${safeSubdomain}</span> is restricted by an IP allowlist rule.`,
    infoItems: [
      {
        title: "IP Allowlist Active",
        descriptionHtml: `The tunnel operator has restricted incoming access exclusively to authorized IP addresses or CIDR ranges. Your IP address is not permitted.`,
        iconType: "danger",
      },
      ...(safeClientIp
        ? [
            {
              title: "Your Client IP",
              descriptionHtml: `Detected IP: <code class="code-inline">${safeClientIp}</code>`,
              iconType: "warning" as const,
            },
          ]
        : []),
      {
        title: "Host Information",
        descriptionHtml: `Protected host: <code class="code-inline">${safeHost}</code>`,
        iconType: "info",
      },
      {
        title: "Configuration Assistance",
        descriptionHtml: `If you are the tunnel operator, add this IP or CIDR to your tunnel using <code class="code-inline">--allow-ip &lt;cidr&gt;</code> or update <code class="code-inline">.etarc</code>.`,
        iconType: "info",
      },
    ],
    showRetry: true,
  });
}
