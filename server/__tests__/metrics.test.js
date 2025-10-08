const { Metrics, LatencyRing } = require('../api/metrics');

describe('Metrics tests', () => {

  describe('LatencyRing', () => {

    test('push / sorted - push wraps on capacity maxed - sorted returns asc ms times', () => {
      const m = new Metrics();
      m.matchRing = new LatencyRing(5);

      for (let i = 0; i < 4; i++) {
        m.matchRing.push(4 - i);
      };

      expect(m.matchRing.len).toBe(4);
      expect(m.matchRing.buf.length).toBe(5);

      for(let i = 0; i < 2; i++) {
        m.matchRing.push(2 - i);
      }

      expect(m.matchRing.len).toBe(5);
      expect(m.matchRing.buf[0]).toBe(1);

      const a = m.matchRing.sorted();

      expect(a[0]).toBe(1);

    });
    test('quantiles ', () => {

      const r = new Metrics().matchRing;
      expect(r.quantile(0.5)).toBe(0);
      [10, 20, 30, 40].forEach((v) => r.push(v));
      expect(r.quantile(0.00)).toBe(10);
      expect(r.quantile(0.50)).toBe(20);
      expect(r.quantile(0.99)).toBe(30);

    });
  });
  describe('RollingQps', () => {
    test('mark order and rate per sec across time shifts', () => {
      const m = new Metrics();
      const t0 = Date.now();
      const base = m.qps.epochSec;
      const size = m.qps.size;

      m.qps.mark(t0);
      m.qps.mark(t0);
      const idx = base % size;

      expect(m.qps.buckets[idx]).toBe(2);

      const t2 = t0 + 2000; //advance 2 seconds (2 x 1000 miliseconds)
      const idx1 = (base + 1) % size;
      const idx2 = (base + 2) % size;
      m.qps.mark(t2);

      expect(m.qps.buckets[idx1]).toBe(0);
      expect(m.qps.buckets[idx2]).toBe(1);
      expect(m.qps.ratePerSec(t2)).toBeCloseTo(3 / size, 3);

    });
  });
  describe('Metrics counters / snapshot / reset', () => {
      test('snapshot fields updated on increment', () => {

        const m = new Metrics();
        m.markOrder();
        m.markOrder();
        m.markTrade(1);
        m.recordMatchMs(5.5);
        m.markOrder();
        m.markTrade(1);
        m.markCancel();
        m.recordMatchMs(7.5);
        m.markOrder();
        m.markOrder();
        m.markTrade(1);
        m.recordMatchMs(9.5);

        const snap = m.snapshot({ bestBid: null, bestAsk: null, openOrders: 0 });
        expect(snap.openOrdersTotal).toBe(0);
        expect(snap.bestBid).toBe(null);
        expect(snap.bestAsk).toBe(null);
        expect(snap.ordersPlacedSession).toBe(5);
        expect(snap.cancelsSession).toBe(1);
        expect(snap.tradesSession).toBe(3);
        expect(snap.matchMs.p50).toBeGreaterThan(5.5);
        expect(snap.matchMs.p99).toBeGreaterThanOrEqual(7.5, 6);

      });
      test('reset zeroes counters and structures', () => {
        const m = new Metrics();
        m.markOrder();
        m.markCancel();
        m.markTrade(1);
        m.recordMatchMs(5.5);
        const base = m.snapshot({ bestBid: null, bestAsk: null, openOrders: 0 });
        expect(base.ordersPlacedSession).toBe(1);
        expect(base.cancelsSession).toBe(1);
        expect(base.tradesSession).toBe(1);
        expect(base.matchMs.p50).toBeGreaterThan(0);
        expect(base.qps1m).toBeGreaterThan(0);
        m.reset();
        const reset = m.snapshot({ bestBid: null, bestAsk: null, openOrders: 0 });
        expect(reset.ordersPlacedSession).toBe(0);
        expect(reset.cancelsSession).toBe(0);
        expect(reset.tradesSession).toBe(0);
        expect(reset.matchMs.p50).toBe(0);
        expect(reset.qps1m).toBe(0);

      });
    });
});