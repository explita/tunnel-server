import { escapeHtml } from "@explita/infra-protocol";
import { ErrorPageConfig, renderBaseErrorHtml } from "./base.js";
import { productName } from "../../lib/constants.js";

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
