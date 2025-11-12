import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import useSharedWebSocket from './WebSocket.jsx';

export default function Trades() {
  const [trades, setTrades] = useState([]);

  const list = Array.isArray(trades) ? trades.slice() : [];
  const timestamp = (ts) => ts ? new Date(ts).toLocaleTimeString() : '—';

  const fetchTrades = useCallback(() => {
    return axios.get('/trades')
      .then(res => setTrades(res.data))
      .catch(err => console.error('trades fetch error', err));
  }, []);

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'trades:update') {
      fetchTrades();
    }
  }, [fetchTrades]);

  useSharedWebSocket(handleWsMessage);

  useEffect(() => {
    fetchTrades(); // initial load
  }, [fetchTrades]);

  return (
    <div className="panel">
      <h3 className="section-title">Recent Trades</h3>
      <table className="table">
        <thead>
          <tr><th>Px</th><th>Qty</th><th>Buy Id</th><th>Sell Id</th><th>Timestamp</th></tr>
        </thead>
        <tbody>
          { list.length === 0 ? (
            <tr><td className="placeholder"colSpan={5}>No trades yet</td></tr>
          ) : list.map((t, i) => (
            <tr key={i}>
              <td className="num">{t.price}</td>
              <td className="num">{t.qty}</td>
              <td className="num">{t.buy?.id ?? '—' }</td>
              <td className="num">{t.sell?.id ?? '—'}</td>
              <td className="num">{timestamp(t.ts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};