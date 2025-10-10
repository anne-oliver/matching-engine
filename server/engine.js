const { OrderBook } = require('./orderBook.js');

class MatchingEngine {
  constructor(handlers = {}) {
    this.book = new OrderBook();
    this.trades = [];
    this.tradedQtyTotal = 0;

    const isFn = (f) => typeof f === 'function';
    const { onRested, onUpdated, onTrade, onCancelled } = handlers;

    this.hooks = Object.freeze({
      onRested:  isFn(onRested)  ? onRested  : () => {},
      onUpdated: isFn(onUpdated) ? onUpdated : () => {},
      onTrade:   isFn(onTrade)   ? onTrade   : () => {},
      onCancelled: isFn(onCancelled) ? onCancelled : () => {}
    });
  }

  process(order) {

    if (order.side === 'buy') {
      this.#matchGeneric(order, {
        bestOppPx: () => this.book.bestAsk(),
        peekOppBest: () => this.book.peekBest('sell'),
        popOppBest: () => this.book.popBest('sell'),
        noCross: function (incomingPx, bestOpp) { return incomingPx < bestOpp; }
      });
    } else {
      this.#matchGeneric(order, {
        bestOppPx: () => this.book.bestBid(),
        peekOppBest: () => this.book.peekBest('buy'),
        popOppBest: () => this.book.popBest('buy'),
        noCross: function (incomingPx, bestOpp) { return incomingPx > bestOpp; }
      });
    }

    return order.filled;
  }

  processOrder(order) {
    return this.process(order);
  }

  getTrades() {
    return this.trades;
  }

  #matchGeneric(incoming, deps) {
    if (incoming.filled === undefined || incoming.filled === null) {
      incoming.filled = 0;
    }

    while (incoming.qty > 0) {
      const oppPx = deps.bestOppPx();
      if (oppPx === undefined) {
        break;
      }
      if (incoming.type === 'limit' && deps.noCross(incoming.price, oppPx)) {
        break;
      }

      const resting = deps.peekOppBest();
      const tradeQty = Math.min(incoming.qty, resting.qty);
      const tradePx = resting.price;

      this.#fill(resting, incoming, tradeQty, tradePx);

      this.hooks.onUpdated(resting);
      this.hooks.onUpdated(incoming);

      if (resting.qty === 0) {
        deps.popOppBest();
      }
    }

    if (incoming.qty > 0) {
      if (incoming.type === 'limit') {
        this.book.addOrder(incoming);
        this.hooks.onRested(incoming);
      } else {
        this.hooks.onCancelled(incoming);
      }
    }
  }

  #fill(maker, taker, qty, price) {
    maker.qty -= qty;
    taker.qty -= qty;
    maker.filled = (maker.filled || 0) + qty;
    taker.filled = (taker.filled || 0) + qty;

    const trade = {
      price: price,
      qty: qty,
      buy:  (maker.side === 'buy')  ? { id: maker.id } : { id: taker.id },
      sell: (maker.side === 'sell') ? { id: maker.id } : { id: taker.id },
      ts: Date.now()
    };

    this.trades.push(trade);
    this.tradedQtyTotal += qty;

    if (this.trades.length > 10000) {
      this.trades.shift();
    }

    this.hooks.onTrade(trade);
  }
}

module.exports = { MatchingEngine };