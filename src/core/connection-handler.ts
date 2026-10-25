import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  computeFingerprint,
  decode,
  encode,
  formatTunnelUrl,
  generateEcdhKeyPair,
  MIN_SUBDOMAIN_LENGTH,
  MAX_SUBDOMAIN_LENGTH,
  MAX_CONCURRENT_TUNNELS,
  MAX_SESSION_DURATION_MS,
  DEFAULT_RECONNECT_GRACE_PERIOD_MS,
  PROTOCOL_VERSION,
  type TunnelMessage,
  type TunnelReady,
  isValidIpOrCidr,
  logger,
} from "@explita/infra-protocol";
import {
  createTunnelSender,
  decodeTunnelMessage,
  type MessageHandler,
  type TunnelConnection,
  type TunnelRegistry,
} from "./tunnel-registry.js";
import type { MetricsCollector } from "./metrics-collector.js";
import {
  baseDomain,
  protocol,
  reconnectGracePeriodMs,
  reservedSubdomains,
} from "../lib/constants.js";

export type AuthResult =
  | { success: true }
  | { success: false; message: string; reason: string };

export type ConnectionHandlerOptions = {
  registry: TunnelRegistry;
  metrics?: MetricsCollector;
  authTokens?: Set<string>;
  requireAuth?: boolean;
  validateToken?: (token: string) => Promise<boolean> | boolean;
};

export class ConnectionHandler {
  constructor(private readonly options: ConnectionHandlerOptions) {}

  private async authenticate(token?: string): Promise<AuthResult> {
    const staticTokens =
      this.options.authTokens ??
      (process.env.AUTH_TOKENS
        ? new Set(
            process.env.AUTH_TOKENS.split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          )
        : undefined);

    const requireAuth =
      this.options.requireAuth ??
      (Boolean(staticTokens?.size) || Boolean(this.options.validateToken));
    if (!requireAuth) {
      return { success: true };
    }

    if (!token) {
      return {
        success: false,
        message:
          "Authentication required.\nPlease provide your token using -t <token> or via 'eta config set token <your-token>'.",
        reason: "Token required",
      };
    }

    if (staticTokens && staticTokens.size > 0) {
      if (!staticTokens.has(token)) {
        return {
          success: false,
          message:
            "Invalid token.\nPlease provide a valid token using -t <token> or via 'eta config set token <your-token>'.",
          reason: "Invalid token",
        };
      }
      return { success: true };
    }

    if (this.options.validateToken) {
      const isValid = await this.options.validateToken(token);
      if (!isValid) {
        return {
          success: false,
          message:
            "Invalid token.\nPlease provide a valid token using -t <token> or via 'eta config set token <your-token>'.",
          reason: "Invalid token",
        };
      }
      return { success: true };
    }

    return {
      success: false,
      message:
        "Invalid token.\nPlease provide a valid token using -t <token> or via 'eta config set token <your-token>'.",
      reason: "Invalid token",
    };
  }

  handle(socket: WebSocket) {
    let activeSubdomain: string | undefined;
    let pingInterval: NodeJS.Timeout | undefined;
    let watchdogTimer: NodeJS.Timeout | undefined;
    let sessionDurationTimer: NodeJS.Timeout | undefined;
    let lastActivity = Date.now();

    const cleanupHeartbeat = () => {
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = undefined;
      }
      if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = undefined;
      }
      if (sessionDurationTimer) {
        clearTimeout(sessionDurationTimer);
        sessionDurationTimer = undefined;
      }
    };

    const startHeartbeat = (
      subdomain: string,
      send: (message: TunnelMessage) => void,
    ) => {
      cleanupHeartbeat();
      lastActivity = Date.now();

      // Send ping every 15s & refresh registry TTL
      pingInterval = setInterval(() => {
        if (socket.readyState === socket.OPEN) {
          try {
            send({ type: "ping", timestamp: Date.now() });
            void this.options.registry.refreshHeartbeat(subdomain);
          } catch {
            // Socket write failed
          }
        }
      }, 15_000);
      pingInterval.unref();

      // Watchdog: terminate socket if no activity for 40s
      watchdogTimer = setInterval(() => {
        if (Date.now() - lastActivity > 40_000) {
          logger.warn(
            { subdomain },
            "Tunnel heartbeat timed out, terminating stale socket",
          );
          cleanupHeartbeat();
          socket.terminate();
        }
      }, 10_000);
      watchdogTimer.unref();
    };

    const onMessage = async (raw: Buffer) => {
      let message: TunnelMessage;
      try {
        message = decode(raw);
      } catch {
        return;
      }

      // Any valid message updates the activity timestamp
      lastActivity = Date.now();

      if (message.type === "pong") {
        return;
      }

      if (message.type === "ping") {
        if (socket.readyState === socket.OPEN) {
          socket.send(encode({ type: "pong", timestamp: message.timestamp }));
        }
        return;
      }

      if (message.type === "hello") {
        socket.off("message", onMessage);
        clearTimeout(helloTimeout);

        if (
          typeof message.version === "number" &&
          message.version > PROTOCOL_VERSION
        ) {
          socket.send(
            encode({
              type: "error",
              code: "UNSUPPORTED_PROTOCOL",
              message: `Protocol version ${message.version} is not supported. Supported protocol version is ${PROTOCOL_VERSION}.`,
            }),
          );
          socket.close(1008, "Unsupported protocol version");
          return;
        }

        const auth = await this.authenticate(message.token);
        if (!auth.success) {
          socket.send(
            encode({
              type: "error",
              message: auth.message,
            }),
          );
          socket.close(1008, auth.reason);
          return;
        }

        const requested = message.subdomain?.trim().toLowerCase();

        // Enforce maximum concurrent tunnels per token (when token is provided)
        const activeCount = message.token
          ? this.options.registry.countByToken(message.token)
          : 0;
        const existingTunnel = requested
          ? this.options.registry.get(requested)
          : undefined;
        const isReconnect =
          (existingTunnel && existingTunnel.id === message.tunnelId) ||
          (existingTunnel &&
            message.token &&
            existingTunnel.token === message.token) ||
          (requested
            ? this.options.registry.isReservedByOwner(
                requested,
                message.tunnelId,
                message.token,
              )
            : false);

        if (
          message.token &&
          !isReconnect &&
          activeCount >= MAX_CONCURRENT_TUNNELS
        ) {
          socket.send(
            encode({
              type: "error",
              message: `Maximum concurrent tunnels limit (${MAX_CONCURRENT_TUNNELS}) reached for this account. Please close an active tunnel before opening a new one.`,
            }),
          );
          socket.close(1008, "Max concurrent tunnels reached");
          return;
        }

        let subdomain: string;

        if (requested) {
          if (
            requested.length < MIN_SUBDOMAIN_LENGTH ||
            requested.length > MAX_SUBDOMAIN_LENGTH
          ) {
            socket.send(
              encode({
                type: "error",
                message: `Subdomain "${requested}" is invalid. Subdomain length must be between ${MIN_SUBDOMAIN_LENGTH} and ${MAX_SUBDOMAIN_LENGTH} characters.`,
              }),
            );
            socket.close(1008, "Invalid subdomain length");
            return;
          }

          if (reservedSubdomains.has(requested)) {
            socket.send(
              encode({
                type: "error",
                message: `Subdomain "${requested}" is reserved.\nPlease choose another.`,
              }),
            );
            socket.close(1008, "Subdomain reserved");
            return;
          }

          if (!/^[a-z0-9-]+$/.test(requested)) {
            socket.send(
              encode({
                type: "error",
                message: `Subdomain "${requested}" is invalid. Subdomains may only contain lowercase letters, numbers, and hyphens.`,
              }),
            );
            socket.close(1008, "Invalid subdomain");
            return;
          }

          const availability = await this.options.registry.isSubdomainAvailable(
            requested,
            message.tunnelId,
            message.token,
          );

          if (!availability.available) {
            socket.send(
              encode({
                type: "error",
                message:
                  availability.reason || `Subdomain "${requested}" is in use.`,
              }),
            );
            socket.close(1008, "Subdomain in use");
            return;
          }

          // If reconnecting with matching tunnelId locally, close previous socket cleanly
          const existing = this.options.registry.get(requested);
          if (existing && existing.socket !== socket) {
            try {
              existing.socket.send(
                encode({
                  type: "error",
                  message: `Tunnel session closed: Subdomain "${requested}" was re-established by a reconnecting session.`,
                }),
              );
              existing.socket.close(
                1008,
                "Re-established by reconnecting session",
              );
            } catch {
              // Ignore socket send errors on dying socket
            }
          }

          subdomain = requested;
        } else {
          let candidate: string;
          let isAvailable = false;
          do {
            candidate = randomUUID().slice(0, 8);
            if (!reservedSubdomains.has(candidate)) {
              const res = await this.options.registry.isSubdomainAvailable(
                candidate,
                undefined,
                message.token,
              );
              isAvailable = res.available;
            }
          } while (!isAvailable);

          subdomain = candidate;
        }

        activeSubdomain = subdomain;
        const tunnelId = message.tunnelId || randomUUID();
        const url = formatTunnelUrl(subdomain, {
          domain: baseDomain,
          protocol,
        });

        // Key exchange: if agent sent public key, derive shared secret
        let sharedKey: Buffer | undefined;
        let serverPublicKey: string | undefined;

        if (message.publicKey) {
          try {
            const serverKeyPair = generateEcdhKeyPair();
            serverPublicKey = serverKeyPair.publicKey;
            sharedKey = serverKeyPair.computeSharedKey(message.publicKey);
          } catch (err) {
            logger.warn(
              { err },
              "Failed to derive shared key from agent public key",
            );
          }
        }

        let validAuth: string | undefined;
        if (
          typeof message.auth === "string" &&
          message.auth.trim().length > 0
        ) {
          const trimmed = message.auth.trim();
          const colonIdx = trimmed.indexOf(":");
          if (
            colonIdx > 0 &&
            colonIdx < trimmed.length - 1 &&
            trimmed.length <= 256
          ) {
            validAuth = trimmed;
          }
        }

        let validAllowedIps: string[] | undefined;
        if (Array.isArray(message.allowedIps)) {
          const valid = message.allowedIps
            .map((ip) => (typeof ip === "string" ? ip.trim() : ""))
            .filter((ip) => ip.length > 0 && isValidIpOrCidr(ip));
          if (valid.length > 0) {
            validAllowedIps = Array.from(new Set(valid));
          }
        }

        const send = createTunnelSender(socket, sharedKey);
        const handlers = new Map<string, MessageHandler>();

        const tunnel: TunnelConnection = {
          id: tunnelId,
          subdomain,
          token: message.token,
          auth: validAuth,
          allowedIps: validAllowedIps,
          socket,
          sharedKey,
          send,
          registerHandler: (id: string, handler: MessageHandler) => {
            handlers.set(id, handler);
            return () => {
              handlers.delete(id);
            };
          },
        };

        this.options.registry.add(tunnel);
        this.options.metrics?.recordTunnelOpened(message.token);

        // Enforce maximum continuous tunnel duration
        sessionDurationTimer = setTimeout(() => {
          logger.info(
            { subdomain },
            "Tunnel reached maximum continuous duration (24h), closing for rotation",
          );
          socket.close(1000, "Session duration expired (24h)");
        }, MAX_SESSION_DURATION_MS);
        sessionDurationTimer.unref();

        const readyMessage: TunnelReady = {
          type: "ready",
          tunnelId,
          subdomain,
          url,
          publicKey: serverPublicKey,
          authEnabled: Boolean(validAuth),
          ipFilterEnabled: Boolean(
            validAllowedIps && validAllowedIps.length > 0,
          ),
          allowedIpsCount: validAllowedIps?.length,
          message: process.env.CONNECT_NOTICE,
        };

        // Ready is sent plaintext so agent receives server public key
        socket.send(encode(readyMessage));
        const fingerprint =
          message.publicKey && serverPublicKey
            ? computeFingerprint(message.publicKey, serverPublicKey)
            : undefined;
        logger.info(
          fingerprint
            ? `Tunnel connected: ${url} (encryption: AES-256-GCM, fingerprint: ${fingerprint})`
            : `Tunnel connected: ${url} (encryption: plaintext)`,
        );

        startHeartbeat(subdomain, send);

        // Keep receiving subsequent pings/pongs/messages to track liveness
        socket.on("message", (data: Buffer) => {
          lastActivity = Date.now();

          let msg: TunnelMessage;
          try {
            msg = decodeTunnelMessage(data, sharedKey);
          } catch {
            return;
          }

          if (msg.type === "ping" && socket.readyState === socket.OPEN) {
            send({ type: "pong", timestamp: msg.timestamp });
            return;
          }

          if (msg.type === "pong") {
            return;
          }

          if ("id" in msg && msg.id) {
            const handler = handlers.get(msg.id);
            if (handler) {
              handler(msg);
            }
          }
        });
      }
    };

    const helloTimeout = setTimeout(() => {
      socket.off("message", onMessage);
      socket.close(1008, "Hello timeout");
    }, 10_000);
    helloTimeout.unref();

    socket.on("message", onMessage);

    socket.on("close", (code) => {
      clearTimeout(helloTimeout);
      cleanupHeartbeat();
      if (activeSubdomain) {
        const current = this.options.registry.get(activeSubdomain);
        if (current?.socket === socket) {
          // If cleanly closed by client (e.g. code 1000 normal closure), release immediately
          if (code === 1000) {
            this.options.registry.remove(activeSubdomain);
            logger.info(
              { subdomain: activeSubdomain, code },
              "Tunnel disconnected cleanly (subdomain released)",
            );
          } else {
            // Unexpected disconnect (network drop, timeout): hold grace period for reconnect
            const graceMs = reconnectGracePeriodMs;
            this.options.registry.release(
              activeSubdomain,
              current.id,
              graceMs,
              current.token,
            );
            logger.info(
              { subdomain: activeSubdomain, code, gracePeriodMs: graceMs },
              "Tunnel disconnected unexpectedly (subdomain reserved for reconnect)",
            );
          }
        }
      }
    });
  }
}
