const { MatchingEngine } = require('../engine.js');
const { Order } = require('../orders.js');
const { open } = require('../db');

const now = () => Date.now();
const limit = (id, side, price, qty, filled = 0, ts = now(), clientId = id) => {
  return new Order(id, side, 'limit', price, qty, filled, ts, clientId);
}
const market = (id, side, qty, ts = now(), clientId = id) => {
  return new Order(id, side, 'market', null, qty, 0, ts, clientId);
}

describe('MatchingEngine', () => {

  describe('unit tests', () => {

    describe('basic matching', () => {

        test('FIFO full fill at same price - buy resting', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'buy',  10, 100));
          eng.processOrder(limit(2, 'sell', 10, 100));

          const trades = eng.getTrades();
          expect(trades).toHaveLength(1);
          expect(trades[0]).toMatchObject({ price: 10, qty: 100, buy: { id: 1 }, sell: { id: 2 } });
        });

        test('FIFO full fill at same price - sell resting', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'sell', 10, 100));
          eng.processOrder(limit(2, 'buy',  10, 100));

          const trades = eng.getTrades();
          expect(trades).toHaveLength(1);
          expect(trades[0]).toMatchObject({ price: 10, qty: 100, buy: { id: 2 }, sell: { id: 1 } });
        });

        test('partial fill aggregates across makers - buy incoming', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'sell', 10,  50));
          eng.processOrder(limit(2, 'sell', 10, 100));
          eng.processOrder(limit(3, 'buy',  10, 150));

          const trades = eng.getTrades();
          expect(trades).toHaveLength(2);
          expect(trades[0]).toMatchObject({ qty: 50, buy: { id: 3 }, sell: { id: 1 } });
          expect(trades[1]).toMatchObject({ qty: 100, buy: { id: 3 }, sell: { id: 2 } });
        });

        test('partial fill aggregates across makers - sell incoming', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'sell', 10,  50));
          eng.processOrder(limit(2, 'sell', 10, 100));
          eng.processOrder(limit(3, 'buy',  10, 150));

          const trades = eng.getTrades();
          expect(trades).toHaveLength(2);
          expect(trades[0]).toMatchObject({ qty: 50, buy: { id: 3 }, sell: { id: 1 } });
          expect(trades[1]).toMatchObject({ qty: 100, buy: { id: 3 }, sell: { id: 2 } });

        });

        test('no cross → no trade - buy resting', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'buy',  9,  100));
          eng.processOrder(limit(2, 'sell', 10, 100));
          expect(eng.getTrades()).toHaveLength(0);
        });

        test('no cross → no trade - sell resting', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'sell', 10, 100));
          eng.processOrder(limit(2, 'buy',  9,  100));
          expect(eng.getTrades()).toHaveLength(0);
        });

        test('executes at maker (resting) price: sell resting', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'sell', 105, 10));
          eng.processOrder(limit(2,  'buy',  110,  5));
          const t = eng.getTrades();
          expect(t[0]).toMatchObject({ price: 105, qty: 5, sell:{id: 1}, buy:{id:2} });
        });

        test('executes at maker (resting) price: buy resting', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1,  'buy',  110,  5));
          eng.processOrder(limit(2, 'sell', 105, 10));
          const t = eng.getTrades();
          expect(t[0]).toMatchObject({ price: 110, qty: 5, sell:{id: 2}, buy:{id:1} });
        });
      });

    describe('multi-level', () => {

        test('buy walks ask levels (maker price at each level)', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'sell', 100, 40));
          eng.processOrder(limit(2, 'sell', 102, 50));
          eng.processOrder(limit(3, 'sell', 101, 30));
          eng.processOrder(limit(4,  'buy',  105, 120));
          const t = eng.getTrades();
          expect(t).toHaveLength(3);
          expect(t[0]).toMatchObject({ price: 100, qty: 40, sell:{id: 1}, buy:{id: 4} });
          expect(t[1]).toMatchObject({ price: 101, qty: 30, sell:{id: 3}, buy:{id: 4} });
          expect(t[2]).toMatchObject({ price: 102, qty: 50, sell:{id: 2}, buy:{id: 4} });
          expect(eng.book.bestAsk()).toBeUndefined();
        });

        test('sell walks bid levels', () => {
          const eng = new MatchingEngine();
          eng.processOrder(limit(1, 'buy',  102, 50));
          eng.processOrder(limit(2, 'buy',  101, 30));
          eng.processOrder(limit(3, 'buy',  100, 40));
          eng.processOrder(limit(4, 'sell',  99, 90));

          const t = eng.getTrades().slice(-3);
          expect(t[0]).toMatchObject({ price: 102, qty: 50, buy:{id:1}, sell:{id:4} });
          expect(t[1]).toMatchObject({ price: 101, qty: 30, buy:{id:2}, sell:{id:4} });
          expect(t[2]).toMatchObject({ price: 100, qty: 10, buy:{id:3}, sell:{id:4} });
          expect(eng.book.bids.bestQueue().peek().qty).toBe(30);
        });


      });

    describe('market vs limit', () => {

      test('market buy on empty asks: no trade; remainder discarded', () => {
        const eng = new MatchingEngine();
        const mktBid = market(1, 'buy', 25);
        eng.processOrder(mktBid);
        expect(eng.getTrades()).toHaveLength(0);
        expect(mktBid.qty).toBe(25);
        expect(eng.book.getBook().sells).toHaveLength(0);
        expect(eng.book.bestAsk()).toBeUndefined();
      });

      test('market sell on empty bids: no trade; remainder discarded', () => {
        const eng = new MatchingEngine();
        const mktAsk = market(2, 'sell', 25);
        eng.processOrder(mktAsk);
        expect(eng.getTrades()).toHaveLength(0);
        expect(mktAsk.qty).toBe(25);
        expect(eng.book.getBook().buys).toHaveLength(0);
        expect(eng.book.bestBid()).toBeUndefined();
      });

      test('market buy fills with existing liquidity, cancels remaining', () => {
        const eng = new MatchingEngine();
        eng.processOrder(limit(1, 'sell', 100, 10));
        const order = market(2, 'buy', 25);
        eng.processOrder(order);
        const trades = eng.getTrades();
        expect(trades.length).toBe(1);
        expect(trades[0]).toMatchObject({ price: 100, qty: 10, buy:{id:2}, sell:{id:1} });
        expect(order.filled).toBe(10);
        expect(order.qty).toBe(15);
        expect(eng.book.getBook().buys).toHaveLength(0);
      });

    });

    describe('engine behavior', () => {

      test('cancel removes open order by id', () => {
        const eng = new MatchingEngine();
        eng.processOrder(limit(1, 'sell', 10, 40));
        eng.processOrder(limit(2, 'sell', 10, 60));

        const removed = eng.book.removeOrderById('sell', 2);
        expect(removed).toBe(60);

        eng.processOrder(limit(3, 'buy', 10, 60));
        const trades = eng.getTrades();
        expect(trades).toHaveLength(1);
        expect(trades[0]).toMatchObject({ price: 10, qty: 40, sell:{id: 1}, buy:{id: 3} });
        expect(eng.book.bestAsk()).toBeUndefined();
      });

      test('trade timestamp correctness', () => {
        const eng = new MatchingEngine();
        eng.processOrder(limit(1, 'sell', 100, 1));
        eng.processOrder(limit(2, 'buy',  100, 1));
        const trades = eng.getTrades();
        expect(typeof trades[0].ts).toBe('number');
      });

      test('hooks fire on rest/update/trade as expected', () => {
        const calls = { rested: 0, updated: 0, trade: 0, cancelled: 0 };
        const eng = new MatchingEngine({
          onRested:  () => calls.rested++,
          onUpdated: () => calls.updated++,
          onTrade:   () => calls.trade++,
          onCancelled: () => calls.cancelled++
        });
        eng.processOrder(limit(1, 'sell', 100, 30));
        eng.processOrder(limit(2, 'buy',  100, 50));
        eng.processOrder(market(3, 'sell', 60));
        expect(calls.trade).toBe(2);
        expect(calls.updated).toBe(4);
        expect(calls.rested).toBe(2);
        expect(calls.cancelled).toBe(1);
      });

      test('trades array capped at 10k', () => {
        const eng = new MatchingEngine();
        // seed sell side
        for (let i = 0; i < 10050; i++) {
          eng.processOrder(limit(10000 + i, 'sell', 100, 1));
        }
        // take with market buys
        for (let i = 0; i < 10050; i++) {
          eng.processOrder(market(20000 + i, 'buy', 1));
        }
        expect(eng.getTrades().length).toBe(10000);
      });
    });
  });

  describe('integration tests: MatchingEngine ↔ OrderBook ↔ hooks ', () => {

    test('single trade updates both orders, pops empty level, hook calls incremented', () => {

      const calls = { trade: [], updated: [], rested: [], cancelled: [] };

      const eng = new MatchingEngine({
        onTrade: (t) => calls.trade.push(t),
        onUpdated: (order) => calls.updated.push({ id: order.id, qty: order.qty, filled: order.filled }),
        onRested: (o) => calls.rested.push(o.id),
        onCancelled: (o) => calls.cancelled.push({ id: o.id, qty: o.qty }),
      });

      eng.process(limit(1, 'sell', 100, 7));
      expect(calls.rested).toHaveLength(1);
      eng.process(limit(2,  'buy',  101, 7));

      // empty book ontrade
      expect(eng.book.bestAsk()).toBeUndefined();
      expect(eng.book.bestBid()).toBeUndefined();

      // Hooks
      expect(calls.trade).toHaveLength(1);
      expect(calls.trade[0]).toMatchObject({ price: 100, qty: 7, sell:{id:1}, buy:{id:2} });
      expect(calls.updated).toHaveLength(2);

      // maker qty->0, filled 7; taker qty->0, filled 7
      const ids = calls.updated.map(u => [u.id, u.qty, u.filled]).sort((a,b)=>a[0]-b[0]);
      expect(ids).toEqual([[1, 0, 7], [2, 0, 7]]);

      // empty book no cancels
      expect(calls.cancelled).toHaveLength(0);

    });
    test('residual limit rests → increments onRested; multi-level walk pops levels', () => {

      const calls = { rested: [] };
      const eng = new MatchingEngine({
        onRested: (o) => calls.rested.push({ id: o.id, side: o.side, qty: o.qty, price: o.price })
      });

      eng.process(limit(1, 'sell', 101, 30));
      eng.process(limit(2, 'sell', 102, 30));
      eng.process(limit(3,  'buy',  110, 100)); // walks 101 then 102, residual 40 @ 110 rests

      const trades = eng.getTrades();
      expect(trades).toHaveLength(2);
      expect(trades[0]).toMatchObject({ price: 101, qty: 30 });
      expect(trades[1]).toMatchObject({ price: 102, qty: 30 });

      // Ask side empty (both popped), residual buy added
      expect(eng.book.bestAsk()).toBeUndefined();
      expect(eng.book.bestBid()).toBe(110);

      // buy residual rests
      expect(calls.rested[calls.rested.length - 1]).toMatchObject({ id: 3, side: 'buy', qty: 40, price: 110 });

    });

    test('Insufficient liquidity on opp side  → market order calls onCancelled with remaining ', () => {

      const calls = { cancelled: [], updated: [] };

      const eng = new MatchingEngine({
        onCancelled: (o) => calls.cancelled.push({ id: o.id, side: o.side, qty: o.qty }),
        onUpdated:   (o) => calls.updated.push({ id: o.id, qty: o.qty, filled: o.filled })
      });

      // Only 10 bid liquidity; market sell for 25
      eng.process(limit(1, 'buy', 100, 10));
      const mktAsk = market(2, 'sell', 25);
      eng.process(mktAsk);

      const trades = eng.getTrades();
      expect(trades).toHaveLength(1);
      expect(trades[0]).toMatchObject({ price: 100, qty: 10, buy:{id:1}, sell:{id:2} });

      // Empty book after trade
      expect(eng.book.bestBid()).toBeUndefined();

      // onUpdated called for maker and taker after the trade
      // maker qty->0, taker qty->15, taker filled 10
      const upd = calls.updated.sort((a,b)=>a.id-b.id);
      expect(upd).toEqual([{ id: 1, qty: 0,  filled: 10 }, { id: 2, qty: 15, filled: 10 }]);

      // No more liquidity → market remainder cancelled; engine passes leftover qty to onCancelled
      expect(calls.cancelled).toEqual([{ id: 2, side: 'sell', qty: 15 }]);

    });
  });
});