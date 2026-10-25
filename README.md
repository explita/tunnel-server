# Explita Tunnel Server

The reverse tunneling edge gateway server for the [Explita Infra](https://infra.explita.ng) suite. Engineered with Fastify and `@fastify/websocket`, it terminates inbound public traffic, handles subdomain routing, and proxies requests to connected local developers over an **authenticated, inner-encrypted WebSocket connection (ECDH P-256 + AES-256-GCM between gateway and local workstation)**.

[**Documentation**](https://infra.explita.ng/docs/tunnel) • [**Self-Hosting Guide**](https://infra.explita.ng/docs/tunnel/setup) • [**Auth & Telemetry Plugin**](https://infra.explita.ng/docs/tunnel/plugin) • [**CLI Reference**](https://infra.explita.ng/docs/tunnel/cli)

---

## ⚡ Features

- 🔒 **Inner Payload Cryptography**: Ephemeral ECDH (P-256) key exchange with AES-256-GCM authenticated encryption securing the tunnel link between gateway and local workstation.
- 🔑 **Cryptographic Fingerprint Verification**: Displays matching session fingerprints on client and server to verify key agreement.
- ⚡ **High-Throughput Streaming**: Chunk-buffered streaming for large assets and zero-delay streaming for Server-Sent Events (SSE) and live API responses.
- 🔌 **Full WebSocket & HMR Support**: Full duplex proxying for Next.js, Vite, Remix, Turbopack, and custom WebSockets.
- 🧭 **O(1) Centralized Dispatcher**: Single-pass decoding and direct request routing on the server, eliminating redundant decryption overhead under high concurrent load.
- 🎨 **Branded Gateway & Centralized Error Pages**: Built-in landing page for root domain traffic and content-negotiated 502 Bad Gateway handling (responsive HTML for browsers, JSON for APIs/cURL).
- 🗜️ **Edge Response Compression**: Automatic Brotli and Gzip compression for landing pages, SVG assets, and sitemaps via `@fastify/compress` with size thresholds.
- 🛡️ **IP / CIDR Firewall Protection**: Restrict tunnel access exclusively to authorized developer IPs or webhook providers (Stripe, Shopify, GitHub) with `-i, --allow-ip <cidr>`, rejecting unauthorized callers with HTTP 403 Forbidden.
- 🌐 **Subdomain Routing & Distributed State**: In-memory registry with Redis distributed cache sync and TTL heartbeats.
- 🔀 **Multi-Tenant & Nested Subdomains**: Route nested tenants via `--` (e.g. `tenant--myapp.tunnel.explita.ng`) seamlessly under standard wildcard TLS with injected `x-explita-*` headers.
- 🛡️ **Production Guardrails**: 100 req/s sliding-window rate limiter per tunnel, 25MB request payload limit, and automatic 24-hour session rotation.
- 🧹 **Untrusted Header Sanitization**: Inbound client requests are stripped of caller-supplied `x-explita-*` headers to eliminate header spoofing vulnerabilities.
- 🏷️ **Wire Protocol Versioning**: Explicit framing versioning (`PROTOCOL_VERSION = 1`) and mutual public-key fingerprint binding via `@explita/infra-protocol`.

---

## 📖 Documentation

Full architectural walkthroughs, deployment guides, self-hosting configurations, and CLI references live on our documentation site:

👉 **[infra.explita.ng/docs/tunnel](https://infra.explita.ng/docs/tunnel)**

- [Self-Hosting Guide (Docker & VPS)](https://infra.explita.ng/docs/tunnel/setup)
- [Auth & Telemetry Plugin (@explita/tunnel-server-plugin)](https://infra.explita.ng/docs/tunnel/plugin)
- [Security & Inner Cryptography](https://infra.explita.ng/docs/tunnel/security)
- [Multi-Tenant & Wildcard Subdomains](https://infra.explita.ng/docs/tunnel/multi-tenant)
- [Web Traffic Inspector](https://infra.explita.ng/docs/tunnel/inspector)
- [CLI Reference (`eta`)](https://infra.explita.ng/docs/tunnel/cli)

---

## 🏗️ Architecture & Component Roles

- **Gateway Server (in this repository)**:
  Ultra-fast Fastify + WebSocket proxy gateway. Maintains active tunnels in memory, enforces rate limits and IP/CIDR firewalls, negotiates ECDH keys, and forwards traffic.
- **Client CLI (`@explita/cli`)**:
  The developer command-line interface (`eta` / `explita tunnel`). Connects outward to the tunnel gateway server over WebSockets.
- **Protocol Library (`@explita/infra-protocol`)**:
  Shared binary/JSON wire protocol definitions, message types, and cryptographic primitives.
- **Auth & Telemetry Plugin (`@explita/tunnel-server-plugin`)**:
  Optional modular plugin providing passwordless email OTP authentication, machine token issuance, PostgreSQL/Prisma persistence, Redis caching, and cluster analytics.

---

## 🚀 Quick Start (Development)

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **pnpm**: v9 or higher

### 1. Installation & Build

```bash
pnpm install
pnpm build
```

### 2. Environment Variables

Create `.env` in this directory:

```env
HTTP_PORT=39755
TUNNEL_DOMAIN="localhost:39755"

# Optional:
# DOCS_URL="https://infra.explita.ng/docs/tunnel" # 302 redirect for apex root domain requests
# AUTH_TOKENS="tok_123,tok_456"                   # Optional static tokens for basic auth
```

### 3. Start Development Server

```bash
pnpm dev
```

The gateway server listens on `http://localhost:39755` (with WebSocket endpoint at `ws://localhost:39755/_connect`).

### 4. Connect Using the Explita CLI

From your local machine or terminal:

```bash
eta 3000 -s myapp -l
```

### 5. Adding Authentication & Metrics (Optional)

To enable database persistence, user accounts, and telemetry via `@explita/tunnel-server-plugin`:

```bash
# 1. Install the plugin
pnpm add @explita/tunnel-server-plugin

# 2. Copy configuration template
cp tunnel.config.example.js tunnel.config.js

# 3. Add DATABASE_URL to your .env and sync schema
pnpm db:push
```

See the [Auth & Telemetry Plugin Documentation](https://infra.explita.ng/docs/tunnel/plugin) for full details.

---

## 🛡️ Security Architecture

1. **Ephemeral Key Exchange**:
   - The agent initiates the connection over WebSocket with a `hello` frame containing an ephemeral ECDH public key (curve `prime256v1`).
   - The server generates its own ephemeral keypair and responds with `ready` containing its public key.
2. **Key Derivation (HKDF)**:
   - Both sides compute the shared secret and derive a 256-bit symmetric key using HKDF-SHA256.
3. **Authenticated Encryption (AES-256-GCM)**:
   - All HTTP requests, streamed chunks, headers, and WebSocket frames are enveloped inside an authenticated AES-256-GCM ciphertext payload with a random 12-byte IV and a 16-byte authentication tag.
   - Any tampering in transit causes immediate tag verification failure.
4. **Fingerprint Verification**:
   - A truncated SHA-256 hash of the derived shared key is logged on both sides:
     ```text
     [Server] Tunnel connected: http://myapp.localhost:39755 (encryption: AES-256-GCM, fingerprint: SHA256:7f:a9:...)
     [Agent]  Fingerprint: SHA256:7f:a9:...
     ```

---

## ⚖️ Production Limits & Guardrails

| Resource / Guardrail           | Limit         | Behavior when Exceeded                                                         |
| :----------------------------- | :------------ | :----------------------------------------------------------------------------- |
| **Max Concurrent Tunnels**     | `5` per token | Connection rejected with `MAX_TUNNELS_EXCEEDED` close code                     |
| **Request Rate Limit**         | `100 req/s`   | HTTP `429 Too Many Requests` (`Retry-After: 1`)                                |
| **IP / CIDR Allowlist**        | Configurable  | HTTP `403 Forbidden` (`ERR_FORBIDDEN`) / WebSocket close code `1008`           |
| **Max Request Body**           | `25 MB`       | HTTP `413 Payload Too Large`                                                   |
| **Max Session Duration**       | `24 hours`    | Server closes socket (`1000`); client auto-reconnects and rotates keys         |
| **Subdomain Reservation Lock** | `60 seconds`  | Atomic hold reservation prevents race conditions during reconnects             |
| **Header Sanitization**        | `x-explita-*` | Incoming untrusted client headers are stripped; `x-forwarded-host` is enforced |

---

## 📄 License

MIT © [Explita](https://explita.ng)
