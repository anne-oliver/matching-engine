# Matching Engine

A price–time FIFO matching engine for limit and market orders with partial fills. In-memory skip-list order book, SQLite persistence, RESTful API, and a React UI with live order book, trades, and performance metrics. Developed as a solo project to demonstrate full-stack systems design — from data structures and API design to containerized deployment and testing.

🎥 [Watch the UI demo (MP4)](https://github.com/anne-oliver/matching-engine/releases/download/v1.0.0/matching-engine-demo.mp4)

## Features

- Price–time FIFO order matching with partial fills
- Limit and market orders; cancel by order ID
- Skip list–backed order book + linked-list per price level
- SQLite persistence (orders + trades)
- Express REST API: `/orders`, `/book`, `/trades`, `/metrics`
- React UI with polling for live updates
- Deterministic workload generators & invariant checks for correctness testing
- Runtime metrics: open orders, trades, cancels, throughput, latency quantiles (p50/p95/p99)

---

## Tech Stack

- **Frontend:** React 19 · Axios · Webpack
- **Backend:** Node.js (Express, Pino) · SQLite (`better-sqlite3`)
- **Testing:** Jest + Supertest (unit, integration, end-to-end)
- **Containerization:** Docker (multi-stage build)
- **CI/CD:** GitHub Actions (lint + tests · image publish to GHCR)
- **Deployment:** AWS EC2 (Dockerized backend + React client)

---

## Architecture

- **Engine** – orchestrates matching and invokes hooks (`onRested`, `onUpdated`, `onTrade`, `onCancelled`)
- **Order Book** – skip list of price levels with linked-list FIFO queues per price
- **Database** – SQLite schema for order/trade persistence
- **API** – Express routes: `/orders`, `/book`, `/trades`, `/metrics`, `/health`
- **Metrics** – rolling QPS counter + latency window (p50/p95/p99) for match times
- **Client** – React UI components: OrderForm, Book, Trades, Metrics, AdminReset

---

## Order Book - Algorithm Time Complexities:

- Skip-list across price levels: expected O(log N) insert/remove/lookup
- Per-level FIFO queue: O(1) push/peek/pop/remove by node
- removeOrderById: expected O(log N) overall (O(1) id lookup + O(log N) level lookup/cleanup).
- OrderBook/SideBook methods are wrappers; they keep the same asymptotic bounds as underlying structure.

---

## Metrics & Workloads

The engine records match latency and throughput using high-resolution timers.
Workload scripts simulate thousands of orders per mode (`steady`, `walk-book`, `cancel-heavy`, etc.) and validate engine invariants:

- **FIFO ordering** within price levels
- **No crossed book at rest** (bestBid < bestAsk)
- **Quantity conservation** (submitted = traded + remaining)
- **Non-negative quantities and accurate cancellation semantics**

Example output (steady workload, 10k orders):

```json

{
  "mode": "steady",
  "N": 100000,
  "latency_ms": {
    "avg": 0.001,
    "p50": 0,
    "p95": 0.001,
    "p99": 0.005
  },
  "throughput_ops_sec": 1149638,
  "invariants": {
    "fifoOk": true,
    "crossedOk": true,
    "priceOrderOk": true,
    "nonNegativeOk": true,
    "quantityConservationOk": true,
    "cancelSemanticsOk": true
  },
  "depth": {
    "buys": 5,
    "sells": 5
  }
}
