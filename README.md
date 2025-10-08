# Matching Engine

A price-time FIFO matching engine for limit and market orders with partial fills. In-memory skip-list order book, SQLite persistence, RESTful API, and a React UI with live book/trades/metrics.

## Features

- Price–time FIFO order matching with partial fills
- Limit and market orders, cancel by order ID
- Skip list-backed order book + linked-list per price
- SQLite persistence (orders + trades)
- Express REST API with /orders, /book, /trades, /metrics endpoints
- React UI with polling
- Admin reset endpoint for dev
- Deterministic workloads & fuzz tests
- Runtime metrics: open orders, trades, cancels, throughput, latency quantiles

## Tech Stack

- Frontend: React 19, Axios, Webpack
- Backend: Node.js (Express, Pino), SQLite (better-sqlite3)
- Testing: Jest + Supertest (unit, integration, end-to-end)
- Containerization: Docker (multi-stage build)
- CI: GitHub Actions (lint + tests; image publish to GHCR)
- Deployment: AWS EC2 (Dockerized backend + React client)

## Architecture

- Engine - orchestrates matching, invokes hooks (rest, update, trade, cancel)
- Order Book - skip list of price levels, linked-list queues per price
- Database - SQLite schema + persistence
- API - Express routes: /orders, /book, /trades, /metrics, health/version
- Metrics - latency ring buffer, rolling QPS, counters
- Client - React UI components: Book, Trades, Metrics, OrderForm, admin reset

## Algorithm Time Complexity:

- Skip-list across price levels (expected O(log N) level insert/remove)
- FIFO linked list - per-level queue at a single price (O(1) push/peek/pop/remove node)
- idIndex gives O(1) removeOrderById via an id→node index

## Demo

🎥 [Watch the UI demo (MP4)](https://github.com/anne-oliver/matching-engine/releases/download/v1.0.0/matching-engine-demo.mp4)

A 2-minute walkthrough of the order book, trades, and metrics in the React UI.

## License
This project is open-source under the [MIT License](./LICENSE).
