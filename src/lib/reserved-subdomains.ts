import { existsSync, readFileSync } from "node:fs";

/**
 * Curated list of reserved subdomains to protect system infrastructure,
 * avoid collisions with core services, and prevent phishing.
 */
export const DEFAULT_RESERVED_SUBDOMAINS = new Set([
  // Core infrastructure & Explita services
  "tunnel",
  "app",
  "api",
  "admin",
  "auth",
  "console",
  "dashboard",
  "docs",
  "portal",
  "status",
  "billing",
  "pay",
  "payment",
  "support",
  "help",

  // Security, accounts & sensitive endpoints
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "account",
  "accounts",
  "secure",
  "security",
  "root",
  "ssl",
  "vpn",
  "oauth",
  "sso",

  // Common internet protocols & infrastructure
  "www",
  "mail",
  "webmail",
  "smtp",
  "imap",
  "pop",
  "pop3",
  "ftp",
  "dns",
  "ns",
  "ns1",
  "ns2",
  "mx",
  "mx1",
  "mx2",
  "caddy",
  "traefik",
  "nginx",
  "proxy",
  "gateway",

  // Environments & local development
  "localhost",
  "internal",
  "private",
  "test",
  "dev",
  "development",
  "stage",
  "staging",
  "prod",
  "production",
]);

/**
 * Loads the complete set of reserved subdomains:
 * 1. Built-in defaults
 * 2. Optional file via RESERVED_SUBDOMAINS_FILE
 * 3. Optional comma-separated env via RESERVED_SUBDOMAINS
 */
export function getReservedSubdomains(): Set<string> {
  const reserved = new Set<string>(DEFAULT_RESERVED_SUBDOMAINS);

  // Load from external file if specified
  const filePath = process.env.RESERVED_SUBDOMAINS_FILE?.trim();
  if (filePath && existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed && !trimmed.startsWith("#")) {
          reserved.add(trimmed);
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // Load from environment variable (comma-separated list of reserved subdomains)
  const envOverrides = process.env.RESERVED_SUBDOMAINS;
  if (envOverrides) {
    for (const item of envOverrides.split(",")) {
      const trimmed = item.trim().toLowerCase();
      if (trimmed) {
        reserved.add(trimmed);
      }
    }
  }

  return reserved;
}
