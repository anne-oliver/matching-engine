const { run } = require('../performance/workloads');

describe('workloads: deterministic smoke', () => {

  const MODES = ['steady','walk-book','cancel-heavy','single-level','many-levels', 'mixed-types'];

  test.each(MODES)('mode=%s produces invariants ok', (mode) => {
    const res = run(mode, 200, { seed: 123 });
    expect(res.mode).toBe(mode);
    expect(res.N).toBe(200);

    expect(res.invariants).toBeDefined();
    for(const v of Object.values(res.invariants)) {
      expect(v).toBe(true);
    }

    expect(res.latency_ms.p50).toBeGreaterThanOrEqual(0);
    expect(res.latency_ms.p95).toBeGreaterThanOrEqual(res.latency_ms.p50);
    expect(res.latency_ms.p99).toBeGreaterThanOrEqual(res.latency_ms.p95);
    expect(res.depth.buys).toBeGreaterThanOrEqual(0);
    expect(res.depth.sells).toBeGreaterThanOrEqual(0);
    expect(res.throughput_ops_sec).toBeGreaterThanOrEqual(0);

  });

  test('rng determinism yields identical summary for fixed seed', () => {

    const a = run('steady', 250, {seed: 500});
    const b = run('steady', 250, {seed: 500});

    expect(a.invariants).toEqual(b.invariants);
    expect(a.depth).toEqual(b.depth);

  });

});