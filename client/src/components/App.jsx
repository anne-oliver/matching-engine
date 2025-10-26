import React, { useEffect, useCallback, useState, useRef } from 'react';
import axios from 'axios';
import OrderForm from './OrderForm.jsx';
import Book from './Book.jsx';
import Trades from './Trades.jsx';
import Metrics from './Metrics.jsx';
import { useAuth } from './AuthContext.jsx';

export default function App() {
  const { logout } = useAuth();
  const [bookRefresh, setBookRefresh] = useState(false);
  const [tradesRefresh, setTradesRefresh] = useState(false);
  const [metricsRefresh, setMetricsRefresh] = useState(false);
  const pollMs = 1000;

  const handleAdminReset = () => {
    axios.post('/admin/clear-db')
      .then(() => {
        refreshBookHandler();
        refreshTradesHandler();
        refreshMetricsHandler();
      })
      .catch((err) => {
        console.error('admin reset error', err);
      })
  };

  const handleLogout = () => {
    logout()
      .catch((err) => {
        console.error('logout failed', err)
      });
  };

  const refreshBookHandler = () => setBookRefresh((b) => !b);
  const refreshTradesHandler = () => setTradesRefresh((b) => !b);
  const refreshMetricsHandler = () => setMetricsRefresh((b) => !b);

  const poller = useCallback((fn) => {
    let cancelled = false;
    let timerId = null;

    const loop = () => {

      if(cancelled) {
        return;
      }

      fn()
        .then(() => {
          if(cancelled) {
            return;
          }
          timerId = setTimeout(loop, pollMs);
        })
        .catch((err) => {
          console.error(err);
        });
    }

    loop();

    return () => {
      cancelled = true;

      if(timerId) {
        clearTimeout(timerId);
      }
    }

  }, [pollMs]);


  return (
    <div>
      <div className="toolbar">
        <button className="btn sm" onClick={handleAdminReset}>
          Reset (Clear DB)
        </button>
        <button className="btn sm logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
      <div className="app-shell">
        <div className="col">
          <OrderForm onAfterSubmit={refreshBookHandler} />
          <Metrics poller={poller} refreshMetrics={refreshMetricsHandler} />
        </div>

        <div className="col">
          <Book poller={poller} refreshBook={bookRefresh} />
          <Trades poller={poller} refreshTrades={tradesRefresh}/>
        </div>
      </div>
    </div>
  );
}