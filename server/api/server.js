require('dotenv').config();

//utility
const express = require('express');
const cors = require('cors');
const path = require('path');
const pino = require('pino');

//files
const { open } = require('../db');
const { MatchingEngine } = require('../engine');
const { OrderBook } = require('../orderBook');
const { Metrics } = require('./metrics');
const { Order } = require('../orders')

//.env
const isTest = process.env.NODE_ENV === 'test';
const logger = pino({ level: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info') });

// Auth routes
// const bcrypt = require('bcrypt');
// const BCRYPT_COST = Number(process.env.BCRYPT_COST)

// database connection
const dbFilename = process.env.DB_FILE || ':memory:'; // memory fallback
const db = open({ filename: dbFilename });

// Session packages
const session = require('express-session');
const BetterSQLiteStore = require('better-sqlite3-session-store')(session);

// Memory build helper
const buildMemory = (eng, db) => {
  const orders = db.getOpenOrders();
    if (orders.length > 0) {
      for (const o of orders) {
      // Markets never rest; DB encodes them with null price
        const type = (o.price === null) ? 'market' : 'limit';
        eng.book.addOrder(new Order(o.id, o.side, type, o.price, o.qty, o.filled, o.ts, o.clientOrderId));
    }
  }
};

const makeApp = function(db) {
  const metrics = new Metrics();
  const eng = new MatchingEngine({
    onRested(order) {
        logger.info({ id: order.id, side: order.side, price: order.price, qty: order.qty, filled: order.filled }, `rested on ${new Date().toISOString()}`)
    },
    onUpdated: function (order) {
      db.updateOrderRemaining(order.id, order.qty, order.filled);
    },
    onTrade: function (t) {
      metrics.markTrade(1);
      db.recordTrade({
        price: t.price,
        qty: t.qty,
        buyId: t.buy.id,
        sellId: t.sell.id,
        ts: t.ts
      });
    },
    onCancelled(order) {
      metrics.markCancel(1);
      db.cancelOrder(order.id, order.qty);
    }
  });

  // App and storage
  const app = express();
  app.db = db;
  app.eng = eng;
  app.metrics = metrics;
  app.use(express.json());
  app.use(cors());

  // Per-request timing for logs/metrics
  app.use((req, _res, next) => { req.reqStart = Date.now(); next(); });

  // Static files
  app.use(express.static(path.join(__dirname, '../../client/dist')));

  // Session setup
  app.use(session({
    store: new BetterSQLiteStore({
      client: db.raw,
      expired: { clear: true, intervalMS: 900000 }
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 3600000,
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    }
  }));

  // Rebuild in-memory book from DB on reboot
  buildMemory(eng, db);

  // Clear helper fcn for dev admin
  const clearAll = function() {
    db.clear();
    eng.book = new OrderBook();
    eng.trades = [];
    eng.tradedQtyTotal = 0;
    metrics.reset();
  };

  // Liveness
  app.get('/', (req, res) => {
    return res.status(200).send('OK');
  });
  app.get('/health', (req, res) => {
    return res.status(200).send('OK')
  });

  // Readiness
  app.get('/ready', (req, res) => {
    try {
      db.raw.prepare('SELECT 1').get();
      return res.status(200).json({ ready: true });
    } catch (err) {
      logger.error({ err }, 'readiness failed');
      return res.status(503).json({ ready: false });
    }
  });

  // Build/version
  app.get('/version', (req, res) => {
    res.json({
      name: 'matching-engine',
      version: process.env.BUILD_VERSION || 'dev',
      commit: process.env.GIT_SHA || 'local',
      node: process.version
    });
  });

  // Request access log (omit under test)
  if (process.env.ACCESS_LOG !== 'off') {
    app.use((req, res, next) => {
      res.on('finish', () => {
        logger.info({
          method: req.method,
          path: req.path,
          status: res.statusCode,
          ms: Date.now() - (req.reqStart || Date.now())
        });
      });
      next();
    });
  }

  // ---- POST /orders  ----
  app.post('/orders', function (req, res) {
    try {
      const body = req.body;

      // Decimal guard
      const EPS = 1e-9;
      const isTwoDecimals = (px) => {
        // allow up to 2 decimal digits; reject 3+ (e.g., 100.001)
        const cents = Math.round(px * 100);
        return Math.abs(px * 100 - cents) < EPS;
      };

      // Validate inputs
      if (!Number.isInteger(body.qty) || body.qty <= 0) {
          return res.status(400).json({ error: 'qty must be positive integer' });
       }

      if (body.type !== 'market') {
        if (typeof body.price !== 'number' || body.price <= 0) {
          return res.status(400).json({ error: 'price must be positive number' });
        }
        if (!isTwoDecimals(body.price)) {
          return res.status(400).json({ error: 'price must have at most two decimals (cents)' });
        }
      }

    const now = Date.now(); //timestamp on order placement

    const order = new Order(
      null,
      body.side,
      body.type,
      body.price,
      body.qty,
      0,
      now,
      body.clientOrderId
    );

    // Persist request before matching - returns id
    let id = db.insertOrder({
      side: order.side,
      price: order.price,
      qty: order.qty,
      filled: 0,
      status: 'open',
      ts: now,
      clientOrderId: order.clientOrderId
    });

    order.id = id; //assignment to obj - null sub

    metrics.markOrder();
    const t0 = process.hrtime.bigint();
    eng.process(order);
    const t1 = process.hrtime.bigint();
    metrics.recordMatchMs(Number(t1 - t0) / 1e6);
    // convert from nanoseconds to milliseconds

      return res.status(201).json({
        id: order.id,
        filled: order.filled,
        remaining: order.qty
      });

    } catch(err) {
        logger.error({ err }, 'POST /orders failed');
        return res.status(500).json({ error: 'internal server error'});
    }
  });

    // ---- DELETE /orders/:id ----
  app.delete('/orders/:id', function (req, res) {
    try {
      const id = Number(req.params.id);
      const side = req.query.side;
      const remaining = eng.book.removeOrderById(side, id);

      if (remaining === false) {
        return res.status(404).json({ error: 'could not delete order' });
      }

      metrics.markCancel(1);
      db.cancelOrder(id, remaining);
      return res.sendStatus(204);
    } catch (err) {
      logger.error({ err}, 'DELETE /orders failed');
      return res.status(500).json({ error: 'internal server error'});
    }
  });

  // ---- GET /book?depth=N ----
  app.get('/book', function (req, res) {
    try {
      const MAX_DEPTH = 10;
      const depth = Number(req.query.depth ?? MAX_DEPTH);
      const snapshot = eng.book.getBook();
      const d = Math.max(0, Math.min(depth, MAX_DEPTH));

      function sliceLevels(levels) {
        const trimmed = levels.slice(0, d);
        const snap = [];
        for (let i = 0; i < trimmed.length; i += 1) {
          const level = trimmed[i];
          snap.push({
            price: level.price,
            orders: level.orders
          });
        }
        return snap;
      }

      return res.json({
          buys: sliceLevels(snapshot.buys),
          sells: sliceLevels(snapshot.sells)
      });

    } catch (err) {
        logger.error({ err}, 'GET /book failed');
        return res.status(500).json({ error: 'internal server error'});
    }
  });

    // ---- GET /trades ----
  app.get('/trades', function (req, res) {
    try {
      const trades = db.getRecentTrades(15);
      const recentTrades = trades.map(t => ({
        price: t.price,
        qty:   t.qty,
        buy:   { id: t.buyOrderId },
        sell:  { id: t.sellOrderId },
        ts:    t.ts,
      }));
      return res.json(recentTrades);
    } catch (err) {
      logger.error({ err }, 'GET /trades failed');
      return res.status(500).json({ error: 'internal server error' });
    }
  });

    // ---- GET /metrics ----
  app.get('/metrics', (req, res) => {

    try {
      const bestBid = eng.book.bestBid();
      const bestAsk = eng.book.bestAsk();

      const book = eng.book.getBook();

      //returns array of objects for each side where each object is a price level with orders array of order objects
      const openOrders =
      book.buys.reduce((sum, lvl) => sum + (lvl.orders?.length || 0), 0) +
      book.sells.reduce((sum, lvl) => sum + (lvl.orders?.length || 0), 0);


      return res.json(metrics.snapshot({ bestBid, bestAsk, openOrders }));

    } catch (err) {
      logger.error({ err }, 'GET /metrics failed');
      return res.status(500).json({ error: 'internal server error' });
    }
  });

  // ---- DEV-ONLY ADMIN ENDPOINTS ----
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_ADMIN === 'true') {
    app.post('/admin/clear-db', (req, res) => {
      try {
        clearAll();
        return res.sendStatus(204);
      } catch (err) {
        res.status(500).json({error: err.message});
      }
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      if (req.method !== 'GET') {
        return next();
      }
      const accept = req.headers.accept || '';
      if (!accept.includes('text/html')) {
        return next();
      }
      res.sendFile(path.join(__dirname, '../../client/dist', 'index.html'));

    });
  }

  return app;
}

if (require.main === module) {
  const app = makeApp(db);
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Server listening on ${port}`));
}

module.exports = { makeApp, buildMemory };
