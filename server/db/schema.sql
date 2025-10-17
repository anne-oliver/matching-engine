CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  price REAL,
  qty INTEGER NOT NULL,
  filled INTEGER,
  status TEXT NOT NULL CHECK (status IN ('open','partial','filled','cancelled')),
  ts BIGINT NOT NULL,
  clientOrderId TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  buyOrderId INTEGER NOT NULL,
  sellOrderId INTEGER NOT NULL,
  ts BIGINT NOT NULL,
  FOREIGN KEY (buyOrderId) REFERENCES orders(id),
  FOREIGN KEY (sellOrderId) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
)