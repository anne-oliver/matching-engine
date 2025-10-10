require('dotenv').config();
const { MatchingEngine } = require('../engine');
const { checkAll } = require('./invariants');

function rng(seed) {
  let s = BigInt(seed);
  return () =>
    Number((s = (s*6364136223846793005n+1n)&((1n<<61n)-1n))>>29n)/(2**32);
}

function nowMs() {
  return Date.now();
}

function genLimit(id, side, price, qty) {
  return { id, side, type: 'limit', price, qty, ts: nowMs() };
}

function steadyGen(N, seed = 42) {
  const r = rng(seed);
  return function* () {
    for (let i = 1; i <= N; i++) {
      const side = r() < 0.5 ? 'buy' : 'sell';
      const price = 95 + Math.floor(r()*11); // 95..105
      const qty = 1 + Math.floor(r()*5);     // 1..5
      yield genLimit(i, side, price, qty);
    }
  };
}

function walkBookGen(N, seed = 7) {
  const r = rng(seed);
  return function* () {
    let id = 1;
    for (let p = 95; p <= 100; p++) {
      for (let k = 0; k < 50; k++) {
        yield genLimit(id++, 'sell', p, 1 + Math.floor(r()*3));
      }
    }
    for (; id <= N; id++) {
      yield genLimit(id, 'buy', 105 + Math.floor(r()*3), 1 + Math.floor(r()*3));
    }
  }
};

function cancelHeavyGen(N, seed = 99) {
  const r = rng(seed);
  const open = [];
  return function* () {
    let id = 1;
    for (; id <= N; id++) {
      if (r() < 0.30 && open.length) {
        const order = open.splice(Math.floor(r()*open.length), 1)[0];
        yield { status: 'cancel', id: order.id, side: order.side };
      } else {
        const side = r() < 0.5 ? 'buy' : 'sell';
        const price = 95 + Math.floor(r()*11);
        const qty = 1 + Math.floor(r()*5);
        const order = genLimit(id, side, price, qty);
        open.push(order);
        yield order;
      }
    }
  }
};

function singleLevelGen(N) {
  return function* () {
    for (let i = 1; i <= N; i++) {
      yield genLimit(i, (i & 1) ? 'buy' : 'sell', 100, 1);
    }
  }
};

function manyLevelsGen(N, seed = 5) {
  const r = rng(seed);
  return function* () {
    for (let i = 1; i <= N; i++) {
      const side = r() < 0.5 ? 'buy' : 'sell';
      const price = 50 + Math.floor(r()*101);
      const qty = 1 + Math.floor(r()*5);
      yield genLimit(i, side, price, qty);
    }
  }
};

function mixedGen(N, seed = 123) {
  const r = rng(seed);
  return function* () {
    for (let i = 1; i <= N; i++) {
      if(r() < 0.2) {
        yield { id: i, side: r() < 0.5 ? 'buy' : 'sell', type: 'market', qty: 1 + Math.floor(r()*5), ts: Date.now() };
      } else {
        yield genLimit(i, r() < 0.5 ? 'buy' : 'sell', 95 + Math.floor(r()*11), 1 + Math.floor(r()*5));
      }
    }
  }
};

const MODES = {
  'steady': steadyGen,
  'walk-book': walkBookGen,
  'cancel-heavy': cancelHeavyGen,
  'single-level': singleLevelGen,
  'many-levels': manyLevelsGen,
  'mixed-types': mixedGen
};

function run(mode, N, opts = {}) {

  const make = MODES[mode];
  const gen = make(N, opts.seed);
  const eng = new MatchingEngine();

  const latNs = new Array(N);
  let submittedLimitQty = 0;
  const t0 = process.hrtime.bigint();
  let i = 0;

  for (const ev of gen()) {
    if (ev.status === 'cancel') {
      const removed = eng.book.removeOrderById(ev.side, ev.id);
      if(removed) {
        submittedLimitQty -= removed;
      }
      continue;
    }

    const s = process.hrtime.bigint();
    eng.process(ev);
    const e = process.hrtime.bigint();
    latNs[i++] = Number(e - s);

    if (ev.type === 'limit') {
      submittedLimitQty += ev.qty;
    }
  }

  const t1 = process.hrtime.bigint();
  const totalNs = Number(t1 - t0);
  const nsToMs = 1e6;

  const pct = (xs, p) => {
    if (!xs.length) {
      return 0;
    }
    const a = xs.slice(0, i).sort((a, b) => a - b);
    return a[Math.floor((p / 100) * (a.length - 1))];
  };

  const inv = checkAll(eng, {
    submittedLimitQty,
    tradedQtyTotal: eng.tradedQtyTotal
  });

  const book = eng.book.getBook();

  const depth = {
    buys: book.buys.length,
    sells: book.sells.length
  };

  const result = {
    mode, N,
    latency_ms: {
      avg: +((latNs.slice(0, i).reduce((a, b) => a + b, 0) / i) / nsToMs).toFixed(3),
      p50: +(pct(latNs, 50) / nsToMs).toFixed(3),
      p95: +(pct(latNs, 95) / nsToMs).toFixed(3),
      p99: +(pct(latNs, 99) / nsToMs).toFixed(3)
    },
    throughput_ops_sec: Math.round(N / (totalNs / 1e9)),
    invariants: inv,
    depth
  };

  console.log(JSON.stringify(result, null, 2));
  return result;

};

if (require.main === module) {
  const mode = process.env.MODE;
  const N = Number(process.env.N);
  run(mode, N);
};

module.exports = { run };