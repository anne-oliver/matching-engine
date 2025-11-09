import React, { useEffect, useState } from 'react';
import axios from 'axios';
import useWebSocket from './WebSocket.jsx';

export default function Trades({ poller, refreshTrades }) {
  const [trades, setTrades] = useState([]);

useEffect(() => {
    return poller(() => {
      return axios.get('/trades')
        .then((res) => {
          setTrades(res.data.slice(-15));
        })
        .catch((err) => {
          console.error('trades polling error', err);
        })
    })
  }, [poller, refreshTrades])


  const list = Array.isArray(trades) ? trades.slice() : [];
  const timestamp = (ts) => ts ? new Date(ts).toLocaleTimeString() : '—';

  // useWebSocket((msg) => {
  //   if (msg.type === 'trade:new') {
  //     setTrades((prev) => [...prev.slice(-15), msg.payload]);
  //   }
  // });


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