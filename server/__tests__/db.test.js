const path = require('path');
const fs = require('fs');
const { open } = require('../db');

const DB_FILE = path.join(__dirname, 'db.test.sqlite');

function clearFile(file) {
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
}

describe('DB layer', () => {

  let db;

  beforeEach(() => {
    process.env.DB_FILE = DB_FILE;
    db = open({ filename: DB_FILE });
  });

  afterEach(() => {
    db.close();
    clearFile(DB_FILE);
  });

  // ---------- UNIT TESTS ----------
  describe('unit tests', () => {

    test('applySchema creates tables for orders, trades', () => {
      const tables = db.raw.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name IN ('orders','trades')
        ORDER BY name
      `).all();
      expect(tables.map(t => t.name)).toEqual(['orders', 'trades']);

    });

    test('persisted rows survive close & reopen; applySchema is idempotent', () => {

        const id = db.insertOrder({
          side:'buy', price:100, qty:3, filled:0, status:'open', ts:Date.now(), clientOrderId: '1'}
        );

        db.close();

        let db2 = open({filename: DB_FILE});
        const row = db2.raw.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        expect(row.clientOrderId).toBe('1');
        db2.close();

    });

    test('insertOrder returns id and row is persisted', () => {
      const now = Date.now();
      const id = db.insertOrder({
        side: 'buy', price: 101, qty: 5, filled: 5, status: 'open', ts: now, clientOrderId: '42'
      });
      expect(typeof id).toBe('number');
      const row = db.raw.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
      expect(row.side).toBe('buy');
      expect(row.price).toBe((101));
      expect(row.qty).toBe(5);
      expect(row.filled).toBe(5);
      expect(row.status).toBe('open');
      expect(row.clientOrderId).toBe('42');
    });


    test('updateOrderRemaining flips status to partial or filled', () => {
      const id = db.insertOrder({
        side: 'sell', price: 120, qty: 10, filled: 0, status: 'open', ts: Date.now(), clientOrderId: '1'
      });

      db.updateOrderRemaining(id, 3);
      let row = db.raw.prepare(`SELECT qty, status FROM orders WHERE id = ?`).get(id);
      expect(row.qty).toBe(3);
      expect(row.status).toBe('partial');

      db.updateOrderRemaining(id, 0);
      row = db.raw.prepare(`SELECT qty, status FROM orders WHERE id = ?`).get(id);
      expect(row.qty).toBe(0);
      expect(row.status).toBe('filled');
    });

    test('cancelOrder sets status=cancelled and preserves remaining', () => {
      const id = db.insertOrder({
        side: 'buy', price: 99, qty: 8, filled: 6, status: 'partial', ts: Date.now(), clientOrderId: '2'
      });
      db.cancelOrder(id, 8);

      const row = db.raw.prepare(`SELECT qty, status FROM orders WHERE id = ?`).get(id);
      expect(row.qty).toBe(8);
      expect(row.status).toBe('cancelled');
    });

    test('recordTrade inserts a trade row', () => {
      const buyId = db.insertOrder({ side: 'buy', price: 100, qty: 5, filled: 5, status: 'open', ts: Date.now(), clientOrderId: '11' });
      const sellId = db.insertOrder({ side: 'sell', price: 100, qty: 5, filled: 5, status: 'open', ts: Date.now(), clientOrderId: '12' });

      const t = { price: 100, qty: 5, buyId, sellId, ts: Date.now() };
      db.recordTrade(t);

      const row = db.raw.prepare(`SELECT * FROM trades ORDER BY id DESC LIMIT 1`).get();
      expect(row.price).toBe(100);
      expect(row.qty).toBe(5);
      expect(row.buyOrderId).toBe(buyId);
      expect(row.sellOrderId).toBe(sellId);
    });

    test('getRecentTrades returns most recent first, limited to count of 15 for UI', () => {
      const ids = [];
      ids.push(db.insertOrder({ side: 'buy', price: 10, qty: 1, filled: 1, status: 'open', ts: Date.now(), clientOrderId: '1' }));
      ids.push(db.insertOrder({ side: 'sell', price: 10, qty: 1, filled: 1, status: 'open', ts: Date.now(), clientOrderId: '2' }));

      const base = Date.now();
      db.recordTrade({ price: 10, qty: 1, buyId: ids[0], sellId: ids[1], ts: base });
      db.recordTrade({ price: 11, qty: 2, buyId: ids[0], sellId: ids[1], ts: base + 1 });
      db.recordTrade({ price: 12, qty: 3, buyId: ids[0], sellId: ids[1], ts: base + 2 });

      const tradeDepth = db.getRecentTrades(2);
      expect(tradeDepth.length).toBe(2);
      expect(tradeDepth[0].price).toBe(12);
      expect(tradeDepth[1].price).toBe(11);

      const allTrades = db.getRecentTrades(15);
      expect(allTrades.length).toBe(3);
      expect(allTrades[0].price).toBe(12);
      expect(allTrades[2].price).toBe(10);
    });

    test('getOpenOrders only returns (open|partial) with remaining > 0', () => {
      const now = Date.now();
      const ids = [];
      ids.push(db.insertOrder({ side: 'buy', price: 100, qty: 10, filled: 0, status: 'open', ts: now, clientOrderId: '1' }));
      ids.push(db.insertOrder({ side: 'sell', price: 101, qty: 0, filled: 10, status: 'filled', ts: now, clientOrderId: '2' }));
      ids.push(db.insertOrder({ side: 'buy', price: 99, qty: 10, filled: 5, status: 'partial', ts: now, clientOrderId: '3' }));
      ids.push(db.insertOrder({ side: 'sell', price: 105, qty: 10, filled: 9, status: 'cancelled', ts: now, clientOrderId: '4' }));

      const open = db.getOpenOrders();
      const byId = open.map(o => o.id);
      expect(byId).toContain(ids[0]);
      expect(byId).toContain(ids[2]);
      expect(byId).not.toContain(ids[1]);
      expect(byId).not.toContain(ids[3]);
    });

    test('clear wipes both orders and trades from db storage', () => {
      const buyId = db.insertOrder({ side: 'buy', price: 50, qty: 2, filled: 2, status: 'partial', ts: Date.now(), clientOrderId: '7' });
      const sellId = db.insertOrder({ side: 'sell', price: 50, qty: 2, filled: 2, status: 'partial', ts: Date.now(), clientOrderId: '8' });
      db.recordTrade({ price: 50, qty: 2, buyId, sellId, ts: Date.now() });

      db.clear();

      const orders = db.raw.prepare(`SELECT COUNT(*) AS n FROM orders`).get().n;
      const trades = db.raw.prepare(`SELECT COUNT(*) AS n FROM trades`).get().n;
      expect(orders).toBe(0);
      expect(trades).toBe(0);
    });
  });

  describe('integration - DB state transitions', () => {
    test('trade -> update -> cancel sequence yields expected DB state', () => {

      const buyId = db.insertOrder({ side: 'buy', price: 100, qty: 6, filled: 2, status: 'partial', ts: Date.now(), clientOrderId: '9' });
      const sellId = db.insertOrder({ side: 'sell', price: 100, qty: 10, filled: 0, status: 'open', ts: Date.now(), clientOrderId: '10' });

      db.recordTrade({ price: 100, qty: 6, buyId, sellId, ts: Date.now() });
      db.updateOrderRemaining(sellId, 4, 6);
      db.updateOrderRemaining(buyId, 0, 6);
      db.cancelOrder(sellId, 4);

      const buyRow  = db.raw.prepare(`SELECT status, qty, filled FROM orders WHERE id = ?`).get(buyId);
      const sellRow = db.raw.prepare(`SELECT status, qty, filled FROM orders WHERE id = ?`).get(sellId);
      expect(buyRow.status).toBe('filled');
      expect(buyRow.filled).toBe(6);
      expect(sellRow.filled).toBe(6);
      expect(sellRow.qty).toBe(4);
      expect(sellRow.status).toBe('cancelled');
      const trades = db.getRecentTrades(5);
      expect(trades.length).toBe(1);
      expect(trades[0].qty).toBe(6);
      expect(trades[0].price).toBe(100);
    });

  });
});