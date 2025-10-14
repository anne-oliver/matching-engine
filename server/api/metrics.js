class LatencyRing {
  constructor(cap = 4096) {
    this.buf = new Float64Array(cap);
    this.cap = cap;
    this.len = 0;
    this.idx = 0;
  }
  push(x) {
    this.buf[this.idx] = x;
    this.idx = (this.idx + 1) % this.cap;
    this.len = Math.min(this.len + 1, this.cap);
  }

  sorted() {
    const a = Array.from(this.buf.slice(0, this.len));
    a.sort((x, y) => x - y);
    return a;
  }
  quantile(q) {
    if (this.len === 0) {
      return 0;
    }
    const a = this.sorted();
    const i = Math.floor(q * (a.length - 1));
    return a[i];
  }
}

class RollingQps {
  constructor(windowSec = 60) {
    this.size = windowSec;
    this.buckets = new Uint32Array(this.size);
    this.epochSec = Math.floor(Date.now() / 1000);
  }
  shift(now) {
    const nowSec = Math.floor(now / 1000);
    let diff = nowSec - this.epochSec;
    if (diff <= 0) {
      return;
    }
    while (diff > 0) {
      this.epochSec++;
      this.buckets[this.epochSec % this.size] = 0;
      diff--;
    }
  }
  mark(now = Date.now()) {
    this.shift(now);
    this.buckets[this.epochSec % this.size]++;
  }
  ratePerSec(now = Date.now()) {
    this.shift(now);
    const sum = this.buckets.reduce((a, b) => a + b, 0);
    return sum / this.size;
  }
}

class Metrics {
  constructor() {
    this.ordersPlacedSession = 0;
    this.cancelsSession = 0;
    this.tradesSession = 0;
    this.qps = new RollingQps(60);
    this.matchRing = new LatencyRing();
  }
  markOrder() {
    this.ordersPlacedSession++;
    this.qps.mark();
  }
  markTrade(n = 1) {
    this.tradesSession += n;
  }
  recordMatchMs(ms) {
    this.matchRing.push(ms);
  }
  markCancel(n = 1) {
    this.cancelsSession += n;
  }
  snapshot({ bestBid, bestAsk, openOrders }) {
    return {
      openOrdersTotal: openOrders,
      uptimeSec: Math.floor(process.uptime()),
      qps1m: Number(this.qps.ratePerSec().toFixed(3)),
      matchMs: {
        p50: Number(this.matchRing.quantile(0.50).toFixed(3)),
        p95: Number(this.matchRing.quantile(0.95).toFixed(3)),
        p99: Number(this.matchRing.quantile(0.99).toFixed(3))
      },
      ordersPlacedSession: this.ordersPlacedSession,
      cancelsSession: this.cancelsSession,
      tradesSession: this.tradesSession,
      bestBid: bestBid ?? null,
      bestAsk: bestAsk ?? null
    }
  }
  reset() {
    this.uptimeStart = Date.now();
    this.ordersPlacedSession = 0;
    this.tradesSession = 0;
    this.cancelsSession = 0;
    this.qps = new RollingQps(60);
    this.matchRing = new LatencyRing(4096);
  }
}

module.exports = { Metrics, LatencyRing };