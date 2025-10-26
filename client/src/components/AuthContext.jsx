import React, { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";

// Axios instance for auth requests
const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: { "Content-Type": "application/json" }
});

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // auth session check

  useEffect(() => {
    api.get('/me')
      .then(res => {
        if (res.status === 200 && res.data?.user) setUser(res.data.user);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = (username, password) =>
    api.post('/login', { username, password })
      .then(res => { setUser(res.data.user); return res.data.user; });

  const register = (username, password) =>
    api.post('/registration', { username, password })
      .then(res => { setUser(res.data.user); return res.data.user; });

  const logout = () =>
    api.post('/logout').then(() => setUser(null));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}