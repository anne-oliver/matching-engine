class Order {
  constructor(id = null, side, type, price, qty, filled = 0, ts, clientOrderId) {
    this.id = id,
    this.side = side;
    this.type = type;
    this.price = price;
    this.qty = qty;
    this.filled = filled,
    this.ts = ts;
    this.clientOrderId = clientOrderId
  }
}

module.exports = { Order };