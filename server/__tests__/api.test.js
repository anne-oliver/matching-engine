const path = require('path');
const request = require('supertest');
const fs = require('fs');
const { makeApp, buildMemory } = require('../api/server.js');
const { open } = require('../db');


const DB_FILE = path.join(__dirname, 'test.sqlite');

function clearFile(file) {
  if(fs.existsSync(file)) {
    fs.rmSync(file);
  }
}

describe('Server API', () => {

    let app;
    let db;

    beforeEach(() => {
      process.env.DB_FILE = DB_FILE;
      db = open({ filename: DB_FILE });
      app = makeApp(db);
    });

    afterEach(() => {
      db.close();
      clearFile(DB_FILE);
    });

      // ---------- UNIT TESTS ----------
  describe('unit tests', () => {

    test('health/version/ready respond', () => {
      return Promise.all([
        request(app).get('/ready').expect(200),
        request(app).get('/version').expect(200)
          .then(res => {
            expect(res.body).toHaveProperty('version');
        })
      ]);
    });
    test('POST /orders validates input types', () => {
      return Promise.all([
        request(app).post('/orders').send({ side: 'buy', price: -1, qty: 1 }).expect(400),
        request(app).post('/orders').send({ side: 'buy', price: 10, qty: 0 }).expect(400),
        request(app).post('/orders').send({ side: 'sell', type: 'market', qty: -5 }).expect(400)
      ]);
    });
    test('GET /book returns book with requested depth', () => {

      for (let i = 0; i < 5; i++) {
        db.insertOrder({ side: 'buy', price: 100 - i, qty: 1, filled: 1, status: 'open', ts: Date.now(), clientOrderId: String(i + 1)});
      }

      buildMemory(app.eng, app.db);

      return request(app).get('/book?depth=2').expect(200)
        .then(res => {
          expect(res.body.buys.length).toBe(2);
        });
    });
    test('GET /metrics returns metrics snapshot with open order count', () => {

      db.insertOrder({side: 'sell', price: 100, qty: 5, filled: 5, status: 'open', ts: Date.now(), clientOrderId: '1'});

      buildMemory(app.eng, app.db);

      return request(app).get('/metrics').expect(200)
        .then(res => {
          expect(res.body).toHaveProperty('openOrdersTotal');
          expect(res.body.openOrdersTotal).toBeGreaterThan(0);
        });
    });
    test('POST /orders enforces two-decimal price', () => {
      return request(app).post('/orders')
        .send({ side: 'buy', type: 'limit', price: 100.001, qty: 1, clientOrderId: 'px-1' })
        .expect(400)
        .then(() => {
          return request(app).post('/orders')
          .send({ side: 'buy', type: 'limit', price: 100.01, qty: 1, clientOrderId: 'px-2' })
          .expect(201);
        });
    });

  });

  describe('integration tests', () => {

    test('rebuild restores memory from DB', () => {

      db.insertOrder({ side: 'buy', price: 100, qty: 10, filled: 10, status: 'open', ts: Date.now(), clientOrderId: '1'});

      let app2 = makeApp(db);

      return request(app2).get('/book')
        .expect(200)
        .then(res => {
          expect(res.body.buys[0].orders[0].id).toBe(1)
        });
    });

    test('POST /orders persists to DB and memory, metrics increments order and records match ms', () => {

      return request(app).post('/orders')
        .send({ side: 'buy', price: 101, qty: 20, type: 'limit', clientOrderId: '1' }).expect(201)
        .then(() => {
          const row = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '1'").get();
          expect(row).toBeDefined();
          expect(app.metrics.ordersPlacedSession).toBe(1);
          expect(app.metrics.matchRing.len).toBe(1);
          return request(app).get('/book').expect(200);
        })
        .then(res => {
          expect(res.body.buys[0].price).toBe(101);
        });
    });

    test('DELETE /orders/:id deletes in memory, cancels DB, increments metrics cancellation count', () => {

      let currentId = db.insertOrder({ side: 'sell', price: 120, qty: 25, filled: 25, status: 'open', ts: Date.now(), clientOrderId: '1' });

      buildMemory(app.eng, app.db);

      return request(app).delete(`/orders/${currentId}`).query({ side: 'sell' }).expect(204)
        .then(() => {
          const row = db.raw.prepare(`SELECT * FROM orders WHERE id = ${currentId}`).get();
          expect(row.status).toBe('cancelled');
          expect(app.metrics.cancelsSession).toBe(1);
          return request(app).get('/book').expect(200);
        })
        .then(res => {
          const match = res.body.sells.some(lvl => lvl.orders.some(o => o.id === currentId));
          expect(match).toBe(false);
        });
    });

    test('POST /admin/clear-db wipes in-memory, database, metrics', () => {
      db.insertOrder({ side: 'sell', price: 100, qty: 5, filled: 5, status: 'open', ts: Date.now(), clientOrderId: '1' });
      return request(app).post('/admin/clear-db').expect(204)
        .then(() => {
          const rows = db.getOpenOrders();
          expect(rows.length).toBe(0);
          expect(app.metrics.ordersPlacedSession).toBe(0);
          return request(app).get('/book').expect(200);
        })
        .then(res => {
          expect(res.body.sells.length).toBe(0);
          expect(res.body.buys.length).toBe(0);
        });
    });
  });
  describe('E2E tests', () => {

    test('market buy matches resting sell and is persisted as cancelled - not stored in memory', () => {

      return request(app).post('/orders')
        .send({side: 'sell', price: 101, qty: 10, type: 'limit', clientOrderId: '1'})
        .expect(201)
        .then(() => {
          return request(app).post('/orders')
            .send({side: 'buy', price: null, qty: 20, type: 'market', clientOrderId: '2' })
            .expect(201);
        })
        .then((res) => {
          expect(res.body.filled).toBe(10);
          expect(res.body.remaining).toBe(10);
          expect(app.eng.book.getBook().buys.length).toBe(0);

          const trades = db.getRecentTrades(1);
          expect(trades.length).toBe(1);
          expect(trades[0].price).toBe(101);
          expect(trades[0].qty).toBe(10);

          const s = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '1'").get();
          const b = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '2'").get();
          expect(s.filled).toBe(10);
          expect(s.status).toBe('filled');
          expect(b.qty).toBe(10);
          expect(b.status).toBe('cancelled');
        });
    });
    test('limit order that rests matches on later incoming order', () => {

      return request(app).post('/orders')
        .send({ side: 'buy', price: 100, qty: 15, type: 'limit', clientOrderId:'1' })
        .expect(201)
        .then(res => {
          expect(res.body.filled).toBe(0);
          expect(res.body.remaining).toBe(15);

          const book1 = app.eng.book.getBook();
          expect(book1.buys.length).toBe(1);
          expect(book1.buys[0].price).toBe(100);
          expect(book1.buys[0].orders[0].qty).toBe(15);

          return request(app).post('/orders')
            .send({ side: 'sell', price: 99, qty: 7, type: 'limit', clientOrderId: '2' })
            .expect(201);
        })
        .then(res2 => {
          expect(res2.body.filled).toBe(7);
          expect(res2.body.remaining).toBe(0);

          const trades = db.getRecentTrades(1);
          expect(trades.length).toBe(1);
          expect(trades[0].price).toBe(100);
          expect(trades[0].qty).toBe(7);

          const maker = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '1'").get();
          const taker = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '2'").get();
          expect(maker.qty).toBe(8);
          expect(maker.filled).toBe(7);
          expect(maker.status).toBe('partial');

          expect(taker.qty).toBe(0);
          expect(taker.filled).toBe(7);
          expect(taker.status).toBe('filled');

          const book2 = app.eng.book.getBook();
          expect(book2.buys.length).toBe(1);
          expect(book2.buys[0].price).toBe(100);
          expect(book2.buys[0].orders[0].qty).toBe(8);
      });
    });
    test('lifecycle: non-crossing limits → crossing trade → cancel → metrics check', () => {
      return request(app).post('/orders')
        .send({ side: 'buy', price: 100, qty: 5, type: 'limit', clientOrderId: '1' })
        .expect(201)
        .then(() => request(app).post('/orders')
          .send({ side: 'sell', price: 105, qty: 5, type: 'limit', clientOrderId: '2' })
          .expect(201)
        )
        .then(() => {

          expect(db.getRecentTrades(1).length).toBe(0);

          return request(app).post('/orders')
            .send({ side: 'buy', price: null, qty: 5, type: 'market', clientOrderId: '3' })
            .expect(201);
        })
        .then(res => {

          expect(res.body.filled).toBe(5);
          expect(res.body.remaining).toBe(0);

          const trade = db.getRecentTrades(1)[0];
          expect(trade.price).toBe(105);
          expect(trade.qty).toBe(5);

          const s = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '2'").get();
          expect(s.status).toBe('filled');
          expect(s.qty).toBe(0);
          expect(s.filled).toBe(5);

          const buyId = db.raw.prepare("SELECT id FROM orders WHERE clientOrderId = '1'").get().id;
          return request(app).delete(`/orders/${buyId}`).query({ side: 'buy' }).expect(204);
        })
        .then(() => {

          const b = db.raw.prepare("SELECT * FROM orders WHERE clientOrderId = '1'").get();
          expect(b.status).toBe('cancelled');

          const book = app.eng.book.getBook();
          expect(book.buys.length).toBe(0);

          const metrics = app.metrics.snapshot({ bestBid: app.eng.book.bestBid(), bestAsk: app.eng.book.bestAsk(), openOrders: 0 });
          expect(metrics.bestBid).toBe(null);
          expect(metrics.bestAsk).toBe(null);
          expect(metrics.ordersPlacedSession).toBe(3);
          expect(metrics.cancelsSession).toBe(1);
          expect(metrics.tradesSession).toBe(1);
        });
      });
  });
});
