const { OrderBook } = require('../orderBook.js');
const { Order } = require('../orders.js');
const { MatchingEngine } = require('../engine.js');

const now = () => Date.now();
const limit = (id, side, price, qty, filled = 0, ts = now(), clientId = id) => {
  return new Order(id, side, 'limit', price, qty, filled, ts, clientId);
}
const market = (id, side, qty, ts = now(), clientId = id) => {
  return new Order(id, side, 'market', null, qty, 0, ts, clientId);
}

describe('OrderBook', () => {

  describe('unit tests', () => {

      test('price-time FIFO within price level', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'sell', 100, 10 ));
        book.addOrder(limit( 2, 'sell', 100, 10 ));
        expect(book.peekBest('sell').id).toBe(1);
        expect(book.popBest('sell').id).toBe(1);
        expect(book.peekBest('sell').id).toBe(2);
      });

      test('bestPrice ordering: bids desc, asks asc', () => {
        const book = new OrderBook();
        book.addOrder(limit( 1, 'buy', 101, 10 ));
        book.addOrder(limit(2,'buy', 99,10 ));
        book.addOrder(limit( 3, 'sell', 104, 10 ));
        book.addOrder(limit( 4, 'sell', 102, 10 ));
        expect(book.bestPrice('buy')).toBe(101);
        expect(book.bestPrice('sell')).toBe(102);
      });

      test('cancel removes by id - returns remaining qty; unknowns return false', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'buy', 100, 10));
        book.addOrder(limit(2, 'buy', 100, 10));
        expect(book.removeOrderById('buy', 1)).toBe(10);
        expect(book.peekBest('buy').id).toBe(2);
        expect(book.removeOrderById('invalid side', 1)).toBe(false);
        expect(book.removeOrderById('buy', 1)).toBe(false);
        expect(book.removeOrderById('sell', 1)).toBe(false);
        expect(book.removeOrderById('buy', 999)).toBe(false);
      });

      test('crossed() when bestBid >= bestAsk; false otherwise', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'buy', 100, 1));
        book.addOrder(limit(2, 'sell',101, 1));
        expect(book.crossed()).toBe(false);
        book.addOrder(limit(3, 'buy', 102, 1));
        expect(book.crossed()).toBe(true);
        expect(book.popBest('sell')?.id).toBe(2);
        expect(book.crossed()).toBe(false);
      });

      test('cancel from middle keeps FIFO', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'buy', 100, 1));
        book.addOrder(limit(2, 'buy', 100, 1));
        book.addOrder(limit(3, 'buy', 100, 1));
        expect(book.removeOrderById('buy', 2)).toBe(1);
        expect(book.peekBest('buy').id).toBe(1);
        expect(book.popBest('buy').id).toBe(1);
        expect(book.peekBest('buy').id).toBe(3);
      });

      test('pop path: removing last order drops price level', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'buy', 200, 1));
        expect(book.popBest('buy').id).toBe(1);
        expect(book.bestPrice('buy')).toBeUndefined();
      });

      test('best price constant across unrelated cancels', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'sell', 100, 1));
        book.addOrder(limit(2, 'sell', 101, 1));
        book.addOrder(limit(3, 'sell', 101, 3));
        expect(book.bestPrice('sell')).toBe(100);
        expect(book.removeOrderById('sell', 2)).toBe(1);
        expect(book.bestPrice('sell')).toBe(100);
      });

      test('hasLiquidity toggles with add/remove', () => {
        const book = new OrderBook();
        expect(book.bids.hasLiquidity()).toBe(false);
        book.addOrder(limit(1, 'buy', 100, 1));
        expect(book.bids.hasLiquidity()).toBe(true);
        expect(book.popBest('buy').id).toBe(1);
        expect(book.bids.hasLiquidity()).toBe(false);
      });

      test('idIndex cleared after popBest (cancel no-op afterwards)', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'buy', 100, 1));
        expect(book.popBest('buy').id).toBe(1);
        expect(book.removeOrderById('buy', 1)).toBe(false);
      });

      test('empty peeks/pops undefined; bestBid/Ask undefined', () => {
        const book = new OrderBook();
        expect(book.peekBest('buy')).toBeUndefined();
        expect(book.peekBest('sell')).toBeUndefined();
        expect(book.popBest('buy')).toBeUndefined();
        expect(book.popBest('sell')).toBeUndefined();
        expect(book.bestBid?.()).toBeUndefined?.();
        expect(book.bestAsk?.()).toBeUndefined?.();
      });

      test('promotes next best after removing last at best price', () => {
        const book = new OrderBook();
        book.addOrder(limit(10, 'sell', 100, 1));
        book.addOrder(limit(11, 'sell', 101, 1));
        expect(book.bestPrice('sell')).toBe(100);
        expect(book.popBest('sell')?.id).toBe(10);
        expect(book.bestPrice('sell')).toBe(101);
      });

      test('snapshot: ask levels sorted asc; FIFO within each level', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'sell', 102, 1));
        book.addOrder(limit(2, 'sell', 100, 1));
        book.addOrder(limit(3, 'sell', 100, 1));
        const snap = book.getBook();
        expect(snap.sells.map(l => l.price)).toEqual([100, 102]);
        expect(snap.sells[0].orders.map(o => o.id)).toEqual([2, 3]);
      });

      test('snapshot: bids sorted desc; FIFO within first bid level', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'buy', 103, 1));
        book.addOrder(limit(2, 'buy', 105, 1));
        book.addOrder(limit(3, 'buy', 105, 1));
        const snap = book.getBook();
        expect(snap.buys.map(l => l.price)).toEqual([105, 103]);
        expect(snap.buys[0].orders.map(o => o.id)).toEqual([2, 3]);
      });

      test('skip list ordering across multiple prices', () => {
        const book = new OrderBook();
        book.addOrder(limit(1, 'sell', 102, 1));
        book.addOrder(limit(2, 'sell', 100, 1));
        book.addOrder(limit(3, 'sell', 101, 1));
        expect(book.bestPrice('sell')).toBe(100);

        book.addOrder(limit(4, 'buy',  99, 1));
        book.addOrder(limit(5, 'buy', 101, 1));
        book.addOrder(limit(6, 'buy', 100, 1));
        expect(book.bestPrice('buy')).toBe(101);
      });

      test('public selectors throws on invalid side', () => {
        const book = new OrderBook();
        expect(() => { book.bestPrice('hold'); }).toThrow();
        expect(() => { book.peekBest('left'); }).toThrow();
        expect(() => { book.popBest('right'); }).toThrow();
      });
    });

  describe('integration tests', () => {

    test('market buy consumes best asks; remaining market qty does not rest', () => {
      const eng = new MatchingEngine();

      eng.processOrder(limit(1, 'sell', 101, 2));
      eng.processOrder(limit(2, 'sell', 102, 3));
      eng.processOrder(market(100, 'buy', 4));
      const trades = eng.getTrades();
      console.log('trades', trades);
      const tradedQty = trades.reduce((sum,t)=> sum + t.qty ,0);
      expect(tradedQty).toBe(4);
      expect(eng.book.bestPrice('sell')).toBe(102);
      expect(eng.book.bestPrice('buy')).toBeUndefined();
    });

    test('concurrent-looking mutations remain consistent', () => {
      const eng = new MatchingEngine();
      eng.processOrder(limit(1, 'sell', 100, 1));
      eng.processOrder(limit(2, 'sell', 100, 1));
      expect(eng.book.removeOrderById('sell', 1)).toBe(1);
      eng.processOrder(limit(10, 'buy', 100, 1));
      const trades = eng.getTrades();
      expect(trades[0].price).toBe(100);
      expect(trades[0].qty).toBe(1);
      expect(eng.book.bestPrice('sell')).toBeUndefined();
    });
  });
});