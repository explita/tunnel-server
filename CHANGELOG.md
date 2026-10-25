# Changelog

All notable changes to the **Explita Tunnel Server** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-25

Initial release of **Explita Tunnel Server**, a high-performance reverse tunneling edge gateway server with authenticated payload encryption and multi-tenant routing.

### Added

#### 🌐 Gateway & Proxy Engine

- **High-Performance Fastify Ingress**:
  - WebSocket tunnel endpoint at `/_connect` managing client connection lifecycles.
  - Subdomain and wildcard host router (`HostRouter`) dynamically routing public HTTP and WebSocket traffic to active tunnels.
  - Global raw buffer parsing (`app.addContentTypeParser("*", { parseAs: "buffer" })`) for lossless streaming of binary payloads, assets, and images.
  - Single-pass O(1) centralized frame decoding and routing to eliminate duplicate decryption overhead under concurrent loads.
- **HTTP Proxying & Chunked Streaming**:
  - Bidirectional request/response chunk streaming (`req_chunk`, `res_chunk`) supporting large uploads and Server-Sent Events (SSE) with zero buffering delays.
  - Automatic preservation of proxy headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`) to ensure Next.js Server Actions, Remix, and CSRF protection work seamlessly.
  - Hop-by-hop header strip list preventing connection-specific headers from corrupting proxy streams.
- **Full Duplex WebSocket Proxying**:
  - Dedicated `WebSocketProxy` mapping public WebSocket upgrade requests to tunnel wire frames (`ws_open`, `ws_frame`, `ws_close`).
  - Full support for live Hot Module Replacement (HMR) in Vite, Next.js, and Remix, plus custom WebSocket backends.

#### 🔐 Security & Cryptography

- **Encrypted Tunnel Transport**:
  - Ephemeral ECDH key agreement over curve `prime256v1` (NIST P-256) negotiated during the WebSocket handshake (`hello` and `ready` frames).
  - Key derivation via HKDF-SHA256 deriving a 256-bit symmetric session key (`AES-256-GCM`).
  - Authenticated symmetric encryption for all requests, responses, streaming chunks, headers, and WebSocket frames.
  - Random 12-byte initialization vector (IV) and 16-byte authentication tag per encrypted message frame for tamper detection.
- **Mutual Session Fingerprint Binding**:
  - Deterministic SHA-256 fingerprint generation binding protocol version and public keys, logged on connection to verify key agreement and prevent MITM attacks.
- **Untrusted Header Sanitization**:
  - Caller-supplied `x-explita-*` headers are stripped from inbound public requests before forwarding to prevent header spoofing vulnerabilities.
- **IP / CIDR Firewall Protection**:
  - Zero-dependency IPv4 and IPv6 CIDR subnet matching engine with IPv4-mapped IPv6 normalization.
  - Gateway enforcement rejecting non-allowed client IPs with HTTP 403 Forbidden (responsive HTML or JSON) and WebSocket close code `1008`.

#### 🔀 Multi-Tenant Subdomain Routing

- **Double-Hyphen (`--`) Notation**:
  - Built-in multi-tenant subdomain resolution (e.g. `tenant--myapp.tunnel.explita.ng`), enabling nested multi-tenant local testing under single-level wildcard TLS (`*.tunnel.explita.ng`).
- **Context Header Injection**:
  - Forwarded requests and WebSocket sessions automatically receive injected headers: `x-explita-subdomain`, `x-explita-parent-subdomain`, `x-explita-subdomain-prefix`, `x-explita-tenant`, and `x-explita-subdomain-parts`.
- **Recursive Host Resolution**:
  - Host resolution across both dot (`.`) and double-hyphen (`--`) boundaries.

#### 🛡️ Production Limits, Heartbeats & Guardrails

- **Per-Tunnel Sliding-Window Rate Limiter**:
  - Sliding-window limiter enforcing 100 requests per second (`MAX_REQUESTS_PER_SECOND`). Exceeding requests receive HTTP 429 (`Too Many Requests`) with `Retry-After: 1`.
- **Payload Size Bounds**:
  - Enforced 25MB maximum request payload limit (`MAX_REQUEST_BODY_SIZE`) to prevent server memory exhaustion.
- **Session Duration & Rotation**:
  - Automatic 24-hour session rotation (`MAX_SESSION_DURATION_MS`) with WebSocket close code `1000`, triggering client auto-reconnection and cryptographic session key rotation.
- **Heartbeat & Watchdog Mechanics**:
  - 15-second automatic ping frames with registry TTL refresh.
  - 40-second socket watchdog timer that detects dead/hung connections and forcibly terminates stale sockets.
- **Subdomain Collision Lock & Grace Reservation**:
  - 60-second atomic hold reservation prevents race conditions during reconnects and blocks unauthorized subdomain takeovers.
  - Configurable reconnect grace window via `RECONNECT_GRACE_PERIOD_MS`.
- **Active Subdomain Lock**:
  - Restricts active subdomains against usurpation by secondary sessions; reconnects require the exact matching `tunnelId`.
- **Connect Notice Broadcast**:
  - Server-configurable connection notice via `CONNECT_NOTICE` environment variable sent to clients upon connection.

#### 📊 Telemetry, Metrics & Health Monitoring

- **Health Check Endpoints**:
  - Dedicated `GET /_health` endpoint reporting server status, process uptime, active tunnel count, and memory allocation (`rss`, `heapTotal`, `heapUsed`, `external`).
- **Anonymous Metrics Engine (`MetricsCollector`)**:
  - In-memory delta accumulator tracking `tunnels_opened`, `requests_routed`, `bytes_transferred`, and active developer counts.
  - Periodic batch flush to database (`METRICS_FLUSH_INTERVAL_MS`, default 5 minutes) preventing database write amplification while preserving zero-log privacy.
- **Internal Stats API**:
  - `GET /_api/stats` endpoint protected by `X-Internal-App-Secret` header, returning today's metrics and all-time system aggregates.

#### 🎨 Centralized Error Pages & Edge Views

- **Content-Negotiated Error Handling**:
  - Centralized 502 Bad Gateway, 404 Not Found, 503 Reconnecting, and 504 Gateway Timeout handling.
  - Serves accessible dark-mode HTML templates for browser requests and structured JSON envelopes for API/cURL requests.
  - Auto-reload countdown and retry headers for reconnecting tunnels (`503`).
- **Edge Landing Page & SEO**:
  - Built-in apex domain (`/`) landing page with system status and architecture overview.
  - Dynamic `/sitemap.xml` and `/robots.txt` endpoints with strict `noindex, nofollow` directives on error pages.
- **Edge Response Compression**:
  - Registered `@fastify/compress` supporting Brotli (`br`) and Gzip for text, HTML, SVG, XML, and JSON above 1 KB, while proxy streams bypass compression via `reply.hijack()`.

#### 💾 Database & Lifecycle Management

- **Persistence Layer (Prisma + PostgreSQL)**:
  - Prisma schema managing developer accounts (`developers`), multi-device tokens (`tokens`), daily aggregate statistics (`daily_metrics`), and lifetime counters (`system_metrics`).
- **Distributed Registry**:
  - In-memory `TunnelRegistry` tracking active connections with Redis distributed cache sync and TTL heartbeats.
- **Process Signal Handling**:
  - Clean process signal handling (`SIGINT`, `SIGTERM`) with unref timers ensuring graceful socket closure and resource cleanup.
