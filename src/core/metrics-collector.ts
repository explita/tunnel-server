import { getTodayDateString } from "../lib/utils.js";

export type MetricsDeltas = {
  tunnels: number;
  requests: number;
  bytes: bigint;
  todayDevTokens?: Set<string>;
};

export type StatsSummary = {
  success: boolean;
  data: {
    active_tunnels: number;
    today: {
      date: string;
      tunnels_opened: number;
      requests_routed: number;
      bytes_transferred: number;
      active_developers: number;
    };
    all_time: {
      total_tunnels: number;
      total_requests: number;
      total_bytes: number;
    };
  };
};

export interface MetricsPersister {
  flush: (deltas: MetricsDeltas) => Promise<void>;
  getStats: (
    activeTunnelsCount: number,
    currentDeltas?: MetricsDeltas,
  ) => Promise<StatsSummary>;
}

export class MetricsCollector {
  private deltaTunnels = 0;
  private deltaRequests = 0;
  private deltaBytes = 0n;
  private todayDevTokens = new Set<string>();
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;
  private persister?: MetricsPersister;

  constructor(
    private readonly flushIntervalMs = process.env.METRICS_FLUSH_INTERVAL_MS
      ? Number(process.env.METRICS_FLUSH_INTERVAL_MS)
      : 300_000,
  ) {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        console.error("[Metrics] Periodic flush error:", err);
      });
    }, this.flushIntervalMs);
    this.flushTimer.unref();
  }

  setPersister(persister: MetricsPersister) {
    this.persister = persister;
  }

  recordTunnelOpened(token?: string) {
    this.deltaTunnels++;
    if (token) {
      this.todayDevTokens.add(token);
    }
  }

  recordRequest(bytes = 0) {
    this.deltaRequests++;
    if (bytes > 0) {
      this.deltaBytes += BigInt(bytes);
    }
  }

  recordBytes(bytes = 0) {
    if (bytes > 0) {
      this.deltaBytes += BigInt(bytes);
    }
  }

  getSnapshot(): MetricsDeltas {
    return {
      tunnels: this.deltaTunnels,
      requests: this.deltaRequests,
      bytes: this.deltaBytes,
      todayDevTokens: this.todayDevTokens,
    };
  }

  async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (
      this.deltaTunnels === 0 &&
      this.deltaRequests === 0 &&
      this.deltaBytes === 0n
    ) {
      return;
    }

    if (!this.persister) {
      return;
    }

    this.isFlushing = true;

    // Snapshot and reset deltas atomically
    const tunnelsToFlush = this.deltaTunnels;
    const requestsToFlush = this.deltaRequests;
    const bytesToFlush = this.deltaBytes;
    const devTokensToFlush = this.todayDevTokens;

    this.deltaTunnels = 0;
    this.deltaRequests = 0;
    this.deltaBytes = 0n;

    try {
      await this.persister.flush({
        tunnels: tunnelsToFlush,
        requests: requestsToFlush,
        bytes: bytesToFlush,
        todayDevTokens: devTokensToFlush,
      });
    } catch (error) {
      // Restore unflushed deltas if persistence fails so counts are never lost
      this.deltaTunnels += tunnelsToFlush;
      this.deltaRequests += requestsToFlush;
      this.deltaBytes += bytesToFlush;
      console.error("[Metrics] Failed to flush metrics to persister:", error);
    } finally {
      this.isFlushing = false;
    }
  }

  async getStats(activeTunnelsCount: number): Promise<StatsSummary> {
    if (this.persister) {
      return this.persister.getStats(activeTunnelsCount, this.getSnapshot());
    }

    const today = getTodayDateString();

    return {
      success: true,
      data: {
        active_tunnels: activeTunnelsCount,
        today: {
          date: today,
          tunnels_opened: this.deltaTunnels,
          requests_routed: this.deltaRequests,
          bytes_transferred: Number(this.deltaBytes),
          active_developers: this.todayDevTokens.size,
        },
        all_time: {
          total_tunnels: this.deltaTunnels,
          total_requests: this.deltaRequests,
          total_bytes: Number(this.deltaBytes),
        },
      },
    };
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}

export const metricsCollector = new MetricsCollector();
