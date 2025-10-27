import React, { useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr("");
    const action = isRegister ? register : login;
    action(username, password)
      .catch(err => {
      const msg = err.response?.data?.error || "Authentication failed";
      setErr(msg);
    });
  };

  return (
    <div className="panel form-col">
      <h3 className="section-title">{isRegister ? "Register" : "Login"}</h3>
      <form onSubmit={handleSubmit}>
        <label>Username</label>
        <input className="input" value={username} onChange={e => setUsername(e.target.value)} />
        <label>Password</label>
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <div className="actions">
          <button className="btn" type="submit">{isRegister ? "Sign Up" : "Sign In"}</button>
          <button className="btn" type="button" onClick={() => setIsRegister(r => !r)}>
            {isRegister ? "Have an account?" : "Create account"}
          </button>
        </div>
      </form>
      {err && <div className="msg">{err}</div>}
    </div>
  );
}