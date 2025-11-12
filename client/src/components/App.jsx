import React, { useEffect, useCallback, useState, useRef } from 'react';
import axios from 'axios';
import OrderForm from './OrderForm.jsx';
import Book from './Book.jsx';
import Trades from './Trades.jsx';
import Metrics from './Metrics.jsx';
import { useAuth } from './AuthContext.jsx';

export default function App() {
  const { logout } = useAuth();

  const handleAdminReset = () => {
    axios.post('/admin/clear-db')
      .catch((err) => console.error('admin reset error', err));
  };

  const handleLogout = () => {
    logout()
      .catch((err) => {
        console.error('logout failed', err)
      });
  };

  const isDev = process.env.NODE_ENV !== 'production';

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
          <OrderForm />
          {isDev && <Metrics />}
        </div>
        <div className="col">
          <Book />
          <Trades />
        </div>
      </div>
    </div>
  );
}