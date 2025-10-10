class ListNode {
  constructor(order) {
    this.order = order;
    this.prev = null;
    this.next = null;
  }
}

class LevelQueue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  push(order) {
    const node = new ListNode(order);
    if (!this.tail) {
      this.head = this.tail = node;
    } else {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    }
    this.length++;
    return node;
  }

  peek() {
    return this.head?.order;
  }

  shift() {
    if (!this.head) {
      return undefined;
    }
    const node = this.head;
    this.head = node.next;
    if (this.head) {
      this.head.prev = null;
    } else {
      this.tail = null;
    }
    this.length--;
    return node.order;
  }

  removeNode(node) {
    if (!node) {
      return;
    }
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    this.length--;
  }
}

class SkipListNode {
  constructor(price, levelQueue, level = 1) {
    this.price = price;
    this.queue = levelQueue;
    this.forward = new Array(level).fill(null);
  }
}

class PriceLevels {
  constructor(isBid) {
    this.isBid = isBid;
    this.MAX_LEVEL = 16;
    this.P = 0.5;
    this.head = new SkipListNode(null, null, this.MAX_LEVEL);
    this.levels = 1;
    this.size = 0;
  }

  #less(a, b) {
    return this.isBid ? a > b : a < b;
  }

  #randomLevel() {
    let lvl = 1;
    while (Math.random() < this.P && lvl < this.MAX_LEVEL) {
      lvl++;
    }
    return lvl;
  }

  #findUpdate(price) {
    const update = new Array(this.MAX_LEVEL).fill(null);
    let x = this.head;
    for (let lvl = this.levels - 1; lvl >= 0; lvl--) {
      while (x.forward[lvl] && this.#less(x.forward[lvl].price, price)) {
        x = x.forward[lvl];
      }
      update[lvl] = x;
    }
    const candidate = x.forward[0];
    return { update, candidate };
  }

  getQueue(price) {
    let x = this.head;
    for (let lvl = this.levels - 1; lvl >= 0; lvl--) {
      while (x.forward[lvl] && this.#less(x.forward[lvl].price, price)) {
        x = x.forward[lvl];
      }
    }
    x = x.forward[0];
    return (x && x.price === price) ? x.queue : undefined;
  }

  #upsertLevel(price) {
    const { update, candidate } = this.#findUpdate(price);
    if (candidate && candidate.price === price) {
      return candidate;
    }

    const lvl = this.#randomLevel();
    if (lvl > this.levels) {
      for (let i = this.levels; i < lvl; i++) {
        update[i] = this.head;
      }
      this.levels = lvl;
    }

    const node = new SkipListNode(price, new LevelQueue(), lvl);
    for (let i = 0; i < lvl; i++) {
      node.forward[i] = update[i].forward[i];
      update[i].forward[i] = node;
    }
    this.size++;
    return node;
  }

  #removeLevel(price) {
    const { update, candidate } = this.#findUpdate(price);
    if (!candidate || candidate.price !== price) {
      return false;
    }
    for (let i = this.levels - 1; i >= 0; i--) {
      if (update[i].forward[i] === candidate) {
        update[i].forward[i] = candidate.forward[i];
      }
    }
    while (this.levels > 1 && !this.head.forward[this.levels - 1]) {
      this.levels--;
    }

    this.size--;
    return true;
  }

  add(order) {
    const levelNode = this.#upsertLevel(order.price);
    return levelNode.queue.push(order);
  }

  bestPrice() {
    return this.head.forward[0]?.price;
  }

  bestQueue() {
    return this.head.forward[0]?.queue;
  }

  hasLiquidity() {
    return this.size > 0;
  }

  popIfEmpty(price) {
    const q = this.getQueue(price);
    if (q && q.length === 0) {
      this.#removeLevel(price);
    }
  }

  forEach(fn) {
    let x = this.head.forward[0];
    while (x) {
      fn(x.price, x.queue);
      x = x.forward[0];
    }
  }
}

class SideBook {
  constructor({ isBid }) {
    this.isBid = isBid;
    this.levels = new PriceLevels(isBid);
  }
  add(order) { return this.levels.add(order); }
  bestPrice() { return this.levels.bestPrice(); }
  bestQueue() { return this.levels.bestQueue(); }
  hasLiquidity() { return this.levels.hasLiquidity(); }
  popIfEmpty(price) { this.levels.popIfEmpty(price); }
  getQueue(price) { return this.levels.getQueue(price); }
  forEachLevel(fn) { this.levels.forEach(fn); }
}

class OrderBook {
  constructor() {
    this.bids = new SideBook({ isBid: true });
    this.asks = new SideBook({ isBid: false });
    this.idIndex = new Map();
  }

  #sideOf(side) {
    if (side === 'buy') {
      return this.bids;
    }
    if (side === 'sell') {
      return this.asks;
    }

    throw new Error('invalid side: ' + side);
  }

  addOrder(order) {
    const sb = this.#sideOf(order.side);
    const node = sb.add(order);
    this.idIndex.set(order.id, { side: order.side, price: order.price, node });
  }

  removeOrderById(side, id) {
    const meta = this.idIndex.get(id);
    if (!meta || meta.side !== side) {
      return false;
    }
    const sb = this.#sideOf(side);
    const q = sb.getQueue(meta.price);
    if (!q) {
      return false;
    }

    let remaining = meta.node.order.qty;

    q.removeNode(meta.node);
    this.idIndex.delete(id);
    sb.popIfEmpty(meta.price);

    return remaining;
  }

  bestPrice(side) {
    return this.#sideOf(side).bestPrice();
  }

  peekBest(side) {
    const sb = this.#sideOf(side);
    const q = sb.bestQueue();
    return q ? q.peek() : undefined;
  }

  popBest(side) {
    const sb = this.#sideOf(side);
    const price = sb.bestPrice();
    if (price === undefined) {
      return undefined;
    }
    const q = sb.bestQueue();
    if (!q) {
      return undefined;
    }
    const head = q.shift();
    if (!head) {
      return undefined;
    }
    this.idIndex.delete(head.id);
    sb.popIfEmpty(price);
    return head;
  }

  getBook() {
    const toObj = (sb) => {
      const out = [];
      sb.forEachLevel((price, q) => {
        const orders = [];
        for (let node = q.head; node; node = node.next) {
          orders.push({ id: node.order.id, qty: node.order.qty, ts: node.order.ts });
        }
        out.push({ price, orders });
      });
      return out;
    };
    return {
      buys: toObj(this.bids),
      sells: toObj(this.asks)
    };
  }

  bestBid() { return this.bids.bestPrice(); }
  bestAsk() { return this.asks.bestPrice(); }
  crossed() {
    return this.bids.hasLiquidity() && this.asks.hasLiquidity()
      && this.bestBid() >= this.bestAsk();
  }
}

module.exports = { OrderBook };