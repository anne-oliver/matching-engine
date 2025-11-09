import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import useWebSocket from './WebSocket.jsx';

export default function Book({ poller, refreshBook }) {
  const [depth, setDepth] = useState(10);
  const [book, setBook] = useState({ buys: [], sells: [] });

  const fetchBook = (d) => {
    return axios.get('/book', { params: { depth: d}})
      .then((res) => {
        setBook({
          buys: res.data.buys,
          sells: res.data.sells
        })
      })
      .catch((err) => {
        console.error('failed to fetch book', err);
      })
  };

  const handleCancel = (orderId, side) => {
    axios.delete(`/orders/${orderId}`, { params: { side}})
      .then(() => {
        fetchBook(depth)
      })
      .catch((err) => {
        console.error('failed to delete order', err);
      })
  }

  useWebSocket((msg) => {
    if (msg.type === 'book:update') {
      fetchBook(depth);
    }
  });

  useEffect(() => {
    fetchBook(depth);
  }, [depth, refreshBook]);

  useEffect(() => {
    return poller(() => {
      return fetchBook(depth);
    })
  }, [depth, poller, refreshBook]);

const renderSide = function(title, levels, side) {

    return (
      <div>
        <div className="subhead">{title}</div>
        <table className="table">
          <thead>
            <tr>
              <th className="col-price">Price</th>
              <th className="col-shares">Shares</th>
              <th className="col-actions">Cancel</th>
            </tr>
          </thead>
          <tbody>
            {levels.length === 0 ? (
              <tr><td className="placeholder" colSpan={3}>—</td></tr>
            ) : (
              levels.map((lvl, i) => {
                const orders = Array.isArray(lvl.orders) ? lvl.orders : [];
                const totalQty = orders.reduce((sum, o) => sum + (o.qty || 0), 0);

                const mostRecent = orders[orders.length - 1];

                return (
                  <tr key={`${side}-${lvl.price}`}>
                    <td className="col-price">{lvl.price}</td>
                    <td className="col-shares">{totalQty}</td>
                    <td className="col-actions">
                      <button
                        className="btn btn-icon sm"
                        title="Cancel most recent order at this price"
                        onClick={() => handleCancel(mostRecent.id, side)}
                      >
                      x
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="section-title">Order Book</h3>
        <div className="row">
          <label className="row gap">
            <span className="placeholder">Depth</span>
            <input
              className="input sm"
              type="number"
              min="1"
              max={10}
              value={depth}
              onChange={(e) =>
                setDepth(Math.max(1, Math.min(10, Number(e.target.value))))
              }
            />
          </label>
        </div>
      </div>
      <div className="book-grid">
        {renderSide("Buys (desc)", book.buys, "buy")}
        {renderSide("Sells (asc)", book.sells, "sell")}
      </div>
    </div>
  );
}