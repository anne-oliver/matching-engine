const { MatchingEngine } = require('../engine');
const inv = require('./invariants');

function rng(seed = 123) {
  let s = BigInt(seed);
  return () =>
    Number((s = (s*6364136223846793005n+1n)&((1n<<61n)-1n))>>29n)/(2**32);
}

function randomScenario(N = 50000, seed = 42) {

  const r = rng(seed);
  const eng = new MatchingEngine();
  const cancelledIds = new Set();
  const actions = ['limit', 'market', 'cancel'];
  const liveIds = [];
  let submittedLimitQty = 0;
  let idStart = 0;

  for (let i = 0; i < N; i++) {

    const a = actions[Math.floor(r() * actions.length)];

    if (a === 'limit') {
      const side = r() < 0.5 ? 'buy' : 'sell';
      const price = 95 + Math.floor(r()*11);
      const qty = 1 + Math.floor(r()*5);
      const id = ++idStart;
      eng.process({ id, side, type: 'limit', price, qty, ts: Date.now() });
      liveIds.push({ id, side });
      submittedLimitQty += qty;

    } else if (a === 'market') {
      const side = r() < 0.5 ? 'buy' : 'sell';
      const qty = 1 + Math.floor(r()*5);
      eng.process({ side, type: 'market', qty, ts: Date.now() });

    } else {
      if (liveIds.length) {
        const k = Math.floor(r()*liveIds.length);
        const { id, side } = liveIds.splice(k, 1)[0];
        const removed = eng.book.removeOrderById(side, id);
        if (removed) {
          cancelledIds.add(id);
        }
      }
    }

    // Periodic assertions - every 8k
    if (i % 8192 === 0) {
      const book = eng.book.getBook();
      if (!inv.fifoOk(book)) { throw new Error('FIFO violated'); }
      if (!inv.crossedOk(eng)) { throw new Error('Crossed book at rest'); }
      if (!inv.priceOrderOk(book)) { throw new Error('Price order violated'); }
      if (!inv.nonNegativeOk(book)) { throw new Error('Negative qty'); }
      if (!inv.cancelSemanticsOk(eng, cancelledIds)) { throw new Error('Cancel semantics violated'); }
    }
  }

  // Final checks including conservation
  const ok = inv.checkAll(eng, {
    submittedLimitQty,
    tradedQtyTotal: eng.tradedQtyTotal,
    cancelledIds
  });

  for (const [k, v] of Object.entries(ok)) {
    if (!v) {
      throw new Error(`Invariant failed: ${k}`);
    }
  }

  return {
    ok: true,
    submittedLimitQty
  };
}

if (require.main === module) {
  try {
    const N = Number(process.env.N || 50000);
    const t0 = process.hrtime.bigint();
    const res = randomScenario(N);
    const t1 = process.hrtime.bigint();
    console.log(JSON.stringify({ N, ...res, ms: Number(t1 - t0) / 1e6 }, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { randomScenario };