import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import useSharedWebSocket from './WebSocket.jsx';

export default function Metrics() {
  const [data, setData] = useState(null);

  const fetchMetrics = useCallback(() => {
    return axios.get('/metrics')
      .then((res) => setData(res.data))
      .catch((err) => console.error('metrics fetch error', err));
  }, []);

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'metrics:update') {
      fetchMetrics();
    }
  }, [fetchMetrics]);

  useSharedWebSocket(handleWsMessage);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="panel">
      <h3 className="section-title">Metrics</h3>
      {!data ? (
        <div className="placeholder">—</div>
      ) : (
        <div>
          <div className="kv">open orders: <span>{data.openOrdersTotal}</span></div>
          <div className="kv">uptime seconds : <span>{data.uptimeSec}</span></div>
          <div className="kv">qps1m: <span>{data.qps1m}</span></div>
          <div className="kv">total placed : <span>{data.ordersPlacedSession}</span></div>
          <div className="kv">total cancelled : <span>{data.cancelsSession}</span></div>
          <div className="kv">total trades : <span>{data.tradesSession}</span></div>
          <div className="kv">best bid : <span>{String(data.bestBid)}</span></div>
          <div className="kv">best ask : <span>{String(data.bestAsk)}</span></div>
          <div className="kv mt-sm">match ms p50/p95/p99 :
            <span>{data.matchMs?.p50} / {data.matchMs?.p95} / {data.matchMs?.p99}</span>
          </div>
        </div>
      )}
    </div>
  );
}