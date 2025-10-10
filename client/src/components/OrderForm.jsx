import React, { useState, useRef } from 'react';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

const MAX_QTY = 100000;
const MAX_PRICE = 1000000;

export default function OrderForm({ onAfterSubmit }) {
  const [side, setSide] = useState('buy');
  const [type, setType] = useState('limit');
  const [price, setPrice] = useState(100);
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState('');
  const [inFlight, setInFlight] = useState(false);
  const pendingKeyRef = useRef(null);

  const priceNum = Number(price);
  const qtyNum = Number(qty);

  const submitHandler = function(e) {

    e.preventDefault();

    if(inFlight) {
      return;
    }

    setErr('');

    const req = { side, price, qty: qtyNum, type };

    if(type === 'limit') {
      req.price = priceNum;
    } else {
      req.price = null;
    }

    if (!pendingKeyRef.current) {
      pendingKeyRef.current = uuid();
    }

    req.clientOrderId = pendingKeyRef.current;
    setInFlight(true);

    axios.post('/orders', req)
      .then((res) => {
        pendingKeyRef.current = null;
        setQty(1);
      })
      .catch((err) => {
        console.error('order submission error', err);
        const status = err.response?.status

        if(status >= 400 && status < 500) {
          pendingKeyRef.current = null;
        }

        if(err.response) {
          setErr(err.response.data?.error)
        } else if(err.request) {
          setErr('Server not responding. Please try again.');
        } else {
          setErr('Unexpected client error.');
        }
      })
      .finally(() => {
        setInFlight(false)
      })
  };


  return (
    <div className="panel">
      <h3 className="section-title">Enter Order</h3>
      <form onSubmit={submitHandler} noValidate className="form-row">
        <div className="field">
          <label htmlFor="side">Side</label>
          <select id="side" className="select sm" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="type">Type</label>
          <select id="type" className="select sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="limit">Limit</option>
            <option value="market">Market</option>
          </select>
        </div>

        {type === 'limit' && (
          <div className="field">
            <label htmlFor="price">Price</label>
            <input
              id="price"
              className="input sm"
              type="number"
              min="0.01"
              max={MAX_PRICE}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 100.00"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="qty">Shares</label>
          <input
            id="qty"
            className="input sm"
            type="number"
            min="1"
            max={MAX_QTY}
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. 1"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn sm" disabled={inFlight}>
            {'Submit'}
          </button>
        </div>
      </form>
      {err && <div className="msg">{err}</div>}
    </div>
  );
}