function levelsFrom(book) {
  return [...(book.buys || []), ...(book.sells || [])];
}
function* iterOrders(book) {
  for (const lvl of (book.buys || [])) {
    for (const o of (lvl.orders || [])) {
      yield o;
    }
  }
  for (const lvl of (book.sells || [])) {
    for (const o of (lvl.orders || [])) {
      yield o;
    }
  }
}

function crossedOk(eng) {
  const bb = eng.book.bestBid();
  const ba = eng.book.bestAsk();
  return (bb === undefined || ba === undefined || bb < ba);
}

function fifoOk(book) {
  const monotonic = (levels) => {
    for (const lvl of (levels || [])) {
      let lastTs = -Infinity;
      for (const o of (lvl.orders || [])) {
        if (o.ts < lastTs) {
          return false;
        }
        lastTs = o.ts;
      }
    }
    return true;
  };
  return monotonic(book.buys) && monotonic(book.sells);
}

function priceOrderOk(book) {
  const asc  = (a) => a.every((v,i,arr) => i === 0 || arr[i-1] <= v);
  const desc = (a) => a.every((v,i,arr) => i === 0 || arr[i-1] >= v);
  const bidPrices = (book.buys  || []).map(l => l.price);
  const askPrices = (book.sells || []).map(l => l.price);
  return desc(bidPrices) && asc(askPrices);
}

function nonNegativeOk(book) {
  for (const o of iterOrders(book)) {
    if ((o.qty ?? 0) < 0) {
      return false;
    }
  }
  return true;
}

function quantityConservationOk(book, { tradedQtyTotal, trades }, submittedLimitQty) {
  const remaining = Array.from(iterOrders(book)).reduce((s, o) => s + (o.qty || 0), 0);
  const traded = (typeof tradedQtyTotal === 'number')
    ? tradedQtyTotal
    : trades.reduce((s, t) => s + (t.qty || 0), 0);
  return remaining + traded === submittedLimitQty;
}

function cancelSemanticsOk(eng, cancelledIds) {
  if (!cancelledIds || cancelledIds.size === 0) {
    return true;
  }
  for (const id of cancelledIds) {
    if (eng.book.idIndex.has(id)) {
      return false;
    }
  }
  const book = eng.book.getBook();
  for (const lvl of levelsFrom(book)) {
    for (const o of (lvl.orders || [])) {
      if (cancelledIds.has(o.id)) {
        return false;
      }
    }
  }
  return true;
}

function checkAll(eng, { submittedLimitQty = 0, trades = [], cancelledIds = new Set(), tradedQtyTotal } = {}) {
  const book = eng.book.getBook();
  return {
    fifoOk: fifoOk(book),
    crossedOk: crossedOk(eng),
    priceOrderOk: priceOrderOk(book),
    nonNegativeOk: nonNegativeOk(book),
    quantityConservationOk: quantityConservationOk(book, { tradedQtyTotal, trades }, submittedLimitQty),
    cancelSemanticsOk: cancelSemanticsOk(eng, cancelledIds)
  };
}

module.exports = {
  crossedOk,
  fifoOk,
  priceOrderOk,
  nonNegativeOk,
  quantityConservationOk,
  cancelSemanticsOk,
  checkAll
};