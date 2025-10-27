import React from "react";
import { createRoot } from "react-dom/client";
import AuthProvider, { useAuth } from "./components/AuthContext.jsx";
import App from "./components/App.jsx";
import Login from "./components/Login.jsx";
import './styles.css';

const Root = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="placeholder">Loading...</div>;
  }
  return user ? <App /> : <Login />;
}

const container = document.createElement("div");
container.setAttribute("id", "root");
document.body.appendChild(container);

const root = createRoot(container);
root.render(
  <AuthProvider>
    <Root />
  </AuthProvider>
);