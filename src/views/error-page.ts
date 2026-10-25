import { productName } from "../lib/constants.js";
import { escapeHtml } from "@explita/infra-protocol";

export type ErrorPageConfig = {
  pageTitle: string;
  badgeCode: string;
  errorCode: string;
  title: string;
  descriptionHtml: string;
  badgeTone?: "danger" | "warning";
  infoItems: Array<{
    title: string;
    descriptionHtml: string;
    iconType: "danger" | "info" | "warning";
  }>;
  cliCommand?: string;
  showRetry?: boolean;
  autoReloadSeconds?: number;
};

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

export type BadGatewayErrorOptions = {
  subdomain?: string;
  host?: string;
  port?: number;
  errorMessage?: string;
  path?: string;
  method?: string;
};

export function renderBadGatewayHtml(options: BadGatewayErrorOptions): string {
  const {
    subdomain,
    host,
    port,
    errorMessage = "Connection failed",
    path,
    method,
  } = options;
  const normalizedError =
    !errorMessage || errorMessage === "fetch failed"
      ? port
        ? `Connection refused: No application listening on localhost:${port} (ECONNREFUSED)`
        : "Connection refused: Local application is offline"
      : errorMessage;
  const safeErrorMessage = escapeHtml(normalizedError);
  const safePath = path ? escapeHtml(path) : undefined;
  const safeMethod = method ? escapeHtml(method.toUpperCase()) : undefined;

  const target = port ? `http://localhost:${port}` : "your local server";

  const descriptionHtml = `The tunnel agent is active and forwarded this request, but could not connect to your local application at <span class="highlight">${target}</span>.`;

  const infoItems: ErrorPageConfig["infoItems"] = [
    {
      title: "Local Server Offline",
      descriptionHtml: port
        ? `Your local application (e.g. Next.js, Vite, Express) does not appear to be running or listening on port <strong>${port}</strong>.`
        : `Your local application does not appear to be running.`,
      iconType: "danger",
    },
    {
      title: "Connection Details",
      descriptionHtml: `Error: <code class="code-inline error">${safeErrorMessage}</code>${
        safeMethod && safePath
          ? ` on <code>${safeMethod} ${safePath}</code>`
          : ""
      }${host ? ` (${escapeHtml(host)})` : ""}.`,
      iconType: "warning",
    },
    {
      title: "Troubleshooting",
      descriptionHtml: port
        ? `Start your local server (e.g. <code>npm run dev</code>) and verify it is listening on <code>localhost:${port}</code>.`
        : `Check that your local dev server is running and accessible.`,
      iconType: "info",
    },
  ];

  return renderBaseErrorHtml({
    pageTitle: `502 Bad Gateway • ${productName}`,
    badgeCode: "ERR_BAD_GATEWAY",
    errorCode: "502 Bad Gateway",
    title: "Cannot Reach Local Server",
    descriptionHtml,
    infoItems,
    cliCommand: port
      ? `eta ${port}${subdomain ? ` -s ${escapeHtml(subdomain)}` : ""}`
      : undefined,
    showRetry: true,
  });
}

export function renderBaseErrorHtml(config: ErrorPageConfig): string {
  const tone = config.badgeTone ?? "danger";

  const infoItemsHtml = config.infoItems
    .map((item) => {
      let iconColor = "#f87171";
      let iconBg = "rgba(239, 68, 68, 0.1)";
      let iconSvg = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>`;

      if (item.iconType === "info") {
        iconColor = "#60a5fa";
        iconBg = "rgba(59, 130, 246, 0.1)";
        iconSvg = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>`;
      } else if (item.iconType === "warning") {
        iconColor = "#fbbf24";
        iconBg = "rgba(245, 158, 11, 0.1)";
        iconSvg = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>`;
      }

      return `
        <li class="info-item">
          <div class="info-icon" style="background: ${iconBg}; color: ${iconColor};" aria-hidden="true">
            ${iconSvg}
          </div>
          <div class="info-content">
            <h2 class="info-title">${escapeHtml(item.title)}</h2>
            <div class="info-desc">${item.descriptionHtml}</div>
          </div>
        </li>`;
    })
    .join("");

  const cliHtml = config.cliCommand
    ? `
      <section class="cli-box" aria-labelledby="cli-heading">
        <div class="cli-header">
          <span class="cli-label" id="cli-heading">Start your local tunnel agent</span>
        </div>
        <div class="cli-command">
          <span class="cli-cmd-text" id="cmd-text">${escapeHtml(config.cliCommand)}</span>
          <button type="button" class="copy-btn" id="copy-btn" onclick="copyCommand()" aria-label="Copy command to clipboard">
            <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <svg class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span id="copy-label">Copy</span>
          </button>
        </div>
        <div id="copy-announcer" class="sr-only" aria-live="polite"></div>
      </section>`
    : "";

  const countdownHtml = config.autoReloadSeconds
    ? `
      <div class="auto-reload-bar" role="status" aria-live="polite">
        <span class="auto-reload-text">Auto-retrying in <strong id="countdown-num">${config.autoReloadSeconds}</strong>s</span>
        <button type="button" class="btn-sm btn-ghost" id="pause-btn" onclick="toggleAutoReload()" aria-label="Pause automatic page reload">
          Pause
        </button>
      </div>`
    : "";

  const retryHtml = config.showRetry
    ? `
      <div class="actions-container">
        <div class="actions-bar">
          <button type="button" class="btn btn-primary" id="retry-btn" onclick="retryConnection()" aria-label="Retry connection and reload this page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Retry Connection</span>
          </button>
        </div>
        ${countdownHtml}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.pageTitle)}</title>
  <meta name="robots" content="noindex, nofollow, noarchive">
  <meta name="googlebot" content="noindex, nofollow">
  <meta name="theme-color" content="#07090e">
  <meta name="color-scheme" content="dark">
  <meta name="description" content="${escapeHtml(config.title)}: ${escapeHtml(config.errorCode)} - ${productName} Reverse Tunnel Gateway">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='16 18 22 12 16 6'/%3E%3Cpolyline points='8 6 2 12 8 18'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #07090e;
      --card-bg: rgba(15, 23, 42, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --card-border-hover: rgba(59, 130, 246, 0.3);
      --text-main: #f8fafc;
      --text-muted: #cbd5e1;
      --text-dim: #94a3b8;
      --primary: #3b82f6;
      --primary-glow: rgba(59, 130, 246, 0.25);
      --accent: #8b5cf6;
      --danger: #ef4444;
      --danger-glow: rgba(239, 68, 68, 0.2);
      --warning: #f59e0b;
      --code-bg: rgba(2, 6, 23, 0.75);
      --code-border: rgba(255, 255, 255, 0.08);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .skip-link {
      position: absolute;
      top: -100px;
      left: 16px;
      background: #2563eb;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.9rem;
      z-index: 10000;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
      transition: top 0.2s ease;
    }

    .skip-link:focus {
      top: 16px;
      outline: 2px solid #ffffff;
      outline-offset: 3px;
    }

    :focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 3px;
    }

    body {
      background-color: var(--bg);
      background-image: 
        radial-gradient(at 10% 20%, rgba(59, 130, 246, 0.12) 0px, transparent 50%),
        radial-gradient(at 90% 80%, rgba(139, 92, 246, 0.1) 0px, transparent 50%),
        radial-gradient(at 50% 50%, rgba(239, 68, 68, 0.04) 0px, transparent 60%);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.5;
      overflow-x: hidden;
    }

    .container {
      width: 100%;
      max-width: 620px;
      position: relative;
      z-index: 10;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .brand-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding: 0 4px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #fff;
      box-shadow: 0 0 16px var(--primary-glow);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 12px;
      border-radius: 9999px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.76rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .status-badge.danger {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.25);
      color: #fca5a5;
    }

    .status-badge.warning {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fde68a;
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    .status-badge.danger .pulse-dot {
      background-color: var(--danger);
      box-shadow: 0 0 8px var(--danger);
    }

    .status-badge.warning .pulse-dot {
      background-color: var(--warning);
      box-shadow: 0 0 8px var(--warning);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .main-card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      padding: 36px;
      box-shadow: 
        0 20px 40px -15px rgba(0, 0, 0, 0.6),
        0 0 1px 1px rgba(255, 255, 255, 0.05);
      position: relative;
      overflow: hidden;
    }

    .main-card:focus {
      outline: none;
    }

    .main-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
    }

    .error-header {
      margin-bottom: 24px;
    }

    .error-code {
      display: inline-block;
      font-size: 0.85rem;
      font-weight: 700;
      color: #f87171;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }

    .status-badge.warning ~ .main-card .error-code,
    .error-code.warning {
      color: #fbbf24;
    }

    .error-title {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.2;
      color: #fff;
      margin-bottom: 12px;
    }

    .error-desc {
      color: var(--text-muted);
      font-size: 0.98rem;
      line-height: 1.6;
    }

    .highlight {
      color: #93c5fd;
      font-family: 'JetBrains Mono', monospace;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.2);
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 0.88rem;
    }

    .code-inline {
      font-family: 'JetBrains Mono', monospace;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.04);
      padding: 1px 6px;
      border-radius: 4px;
    }

    .code-inline.error {
      color: #f87171;
    }

    .info-grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 28px 0;
      list-style: none;
      padding-left: 0;
    }

    .info-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 14px;
      padding: 14px 16px;
    }

    .info-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      margin-top: 1px;
    }

    .info-content {
      font-size: 0.88rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .info-title {
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 2px;
    }

    .cli-box {
      background: var(--code-bg);
      border: 1px solid var(--code-border);
      border-radius: 16px;
      padding: 18px 20px;
      margin-top: 24px;
      position: relative;
    }

    .cli-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .cli-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .cli-command {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 10px;
      padding: 10px 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.88rem;
      color: #7dd3fc;
    }

    .cli-cmd-text {
      user-select: all;
      overflow-x: auto;
      white-space: nowrap;
    }

    .copy-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-dim);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 6px;
      font-family: inherit;
      font-size: 0.78rem;
      font-weight: 600;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .copy-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }

    .copy-btn .check-icon {
      display: none;
    }

    .copy-btn.copied {
      color: #4ade80;
      background: rgba(74, 222, 128, 0.1);
      border-color: rgba(74, 222, 128, 0.25);
    }

    .copy-btn.copied .copy-icon {
      display: none;
    }

    .copy-btn.copied .check-icon {
      display: inline-block;
    }

    .actions-container {
      margin-top: 28px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .actions-bar {
      display: flex;
      gap: 12px;
    }

    .btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 13px 20px;
      border-radius: 12px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
      border: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(37, 99, 235, 0.45);
    }

    .auto-reload-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 12px;
      padding: 10px 16px;
      font-size: 0.85rem;
      color: #fde68a;
    }

    .auto-reload-bar strong {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.95rem;
      color: #fff;
    }

    .btn-sm {
      padding: 5px 12px;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
    }

    .btn-ghost {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      transition: background 0.15s ease;
    }

    .btn-ghost:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .footer {
      margin-top: 28px;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-dim);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    @media (max-width: 640px) {
      .main-card {
        padding: 24px;
      }
      .actions-bar {
        flex-direction: column;
      }
      .error-title {
        font-size: 1.5rem;
      }
      .status-badge .badge-text {
        display: none;
      }
      .status-badge {
        padding: 6px;
        gap: 0;
      }
      .copy-btn #copy-label {
        display: none;
      }
      .copy-btn {
        padding: 6px 8px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
      .pulse-dot {
        animation: none;
      }
    }
  </style>
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to error details</a>

  <div class="container">
    <header class="brand-bar">
      <div class="brand">
        <div class="brand-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <span>${productName}</span>
      </div>
      <div class="status-badge ${tone}" role="status" aria-label="Status code: ${escapeHtml(config.badgeCode)}">
        <span class="pulse-dot" aria-hidden="true"></span>
        <span class="badge-text">${escapeHtml(config.badgeCode)}</span>
      </div>
    </header>

    <main class="main-card" id="main-content" tabindex="-1">
      <div class="error-header">
        <span class="error-code ${tone === "warning" ? "warning" : ""}">${escapeHtml(config.errorCode)}</span>
        <h1 class="error-title">${escapeHtml(config.title)}</h1>
        <p class="error-desc">
          ${config.descriptionHtml}
        </p>
      </div>

      <ul class="info-grid" role="list">
        ${infoItemsHtml}
      </ul>

      ${cliHtml}

      ${retryHtml}
    </main>

    <footer class="footer">
      ${productName} Edge &bull; Reverse WebSocket Tunneling
    </footer>
  </div>

  <script>
    function copyCommand() {
      const el = document.getElementById('cmd-text');
      if (!el) return;
      const text = el.innerText || el.textContent || '';
      navigator.clipboard.writeText(text.trim()).then(() => {
        const btn = document.getElementById('copy-btn');
        const label = document.getElementById('copy-label');
        const announcer = document.getElementById('copy-announcer');
        if (btn) btn.classList.add('copied');
        if (label) label.textContent = 'Copied!';
        if (announcer) announcer.textContent = 'CLI command copied to clipboard';
        setTimeout(() => {
          if (btn) btn.classList.remove('copied');
          if (label) label.textContent = 'Copy';
          if (announcer) announcer.textContent = '';
        }, 2000);
      });
    }

    function retryConnection() {
      window.location.reload();
    }

    ${
      config.autoReloadSeconds
        ? `
    (function initAutoReload() {
      let countdown = ${config.autoReloadSeconds};
      let isPaused = false;
      const numEl = document.getElementById('countdown-num');
      const pauseBtn = document.getElementById('pause-btn');

      const timerId = setInterval(() => {
        if (isPaused) return;
        countdown--;
        if (numEl) numEl.textContent = String(countdown);
        if (countdown <= 0) {
          clearInterval(timerId);
          window.location.reload();
        }
      }, 1000);

      window.toggleAutoReload = function() {
        isPaused = !isPaused;
        if (pauseBtn) {
          pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
          pauseBtn.setAttribute('aria-label', isPaused ? 'Resume automatic page reload' : 'Pause automatic page reload');
        }
      };
    })();`
        : ""
    }
  </script>
</body>
</html>`;
}
