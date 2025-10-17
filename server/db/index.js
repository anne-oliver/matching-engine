const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function applySchema(db) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  if(fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }
}

function open({ filename=':memory:'} = {}) {

  const dir = path.dirname(filename);
  if(filename !== ':memory:' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true});
  }

  const db = new Database(filename); //create connection
  db.pragma('foreign_keys = ON'); //for better-sqlite must turn on
  applySchema(db); //read the schema sql file

  const insertOrder = db.prepare(`
    INSERT INTO orders (side, price, qty, filled, status, ts, clientOrderId)
    VALUES (@side, @price, @qty, @filled, @status, @ts, @clientOrderId)
  `);
  const setStatus = db.prepare(`UPDATE orders SET status = ?, qty = ? WHERE id = ?`);
  const updateRemaining = db.prepare(`UPDATE orders SET qty = ?, filled = ?, status = ? WHERE id = ?`);
  const insertTrade = db.prepare(`
    INSERT INTO trades (price, qty, buyOrderId, sellOrderId, ts)
    VALUES (@price, @qty, @buyId, @sellId, @ts)
  `);
  const getOpenOrders = db.prepare(`SELECT * FROM orders WHERE status IN ('open', 'partial') AND qty > 0`);
  const recentTrades = db.prepare(`SELECT * FROM trades ORDER BY ts DESC, id DESC LIMIT ?`);
  const clearTrades = db.prepare('DELETE FROM trades');
  const clearOrders = db.prepare(`DELETE FROM orders`);
  const resetIdx = db.prepare(`DELETE FROM sqlite_sequence WHERE name IN ('orders','trades')`);
  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, created_at)
    VALUES (@username, @password_hash, @created_at)
  `);
  const getUserByUsername = db.prepare(`
    SELECT * FROM users WHERE username = ?
  `);

  return {
    //readiness check
    raw: db,
    // auth: users
    createUser({ username, password_hash, created_at }) {
      const info = insertUser.run({ username, password_hash, created_at });
      return Number(info.lastInsertRowid);
    },
    findUserByUsername(username) {
      return getUserByUsername.get(username) || null;
    },
    //insert order and return numeric id
    insertOrder(o) {
      const info = insertOrder.run({
        side: o.side,
        price: o.price,
        qty: o.qty,
        filled: o.filled,
        status: o.status ?? 'open',
        ts: o.ts,
        clientOrderId: o.clientOrderId
      })
      return Number(info.lastInsertRowid);
    },
    updateOrderRemaining(id, remaining, filled) {
      const status = remaining === 0 ? 'filled' : 'partial';
      updateRemaining.run(remaining, filled, status, id);
    },
    cancelOrder(id, remaining) {
      setStatus.run('cancelled', remaining, id);
    },
    recordTrade({ price, qty, buyId, sellId, ts}) {
      insertTrade.run({ price, qty, buyId, sellId, ts });
    },
    getRecentTrades(limit = 15) {
      return recentTrades.all(limit);
    },
    getOpenOrders() {
      return getOpenOrders.all();
    },
    clear() {
      resetIdx.run();
      clearTrades.run();
      clearOrders.run();
    },
    close() {
      db.close();
    }
  }

}

module.exports = { open };