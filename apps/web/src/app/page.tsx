"use client";

import React, { useEffect, useState, type FormEvent } from "react";

interface User {
  id: string;
  username: string;
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [health, setHealth] = useState<string>("Checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data.status === "ok" ? "Connected" : "Degraded");
    } catch {
      setHealth("Unreachable");
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    }
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (res.ok) {
        setMessage(`Created user: ${username}`);
        setUsername("");
        setPassword("");
        fetchUsers();
      } else {
        const err = await res.json();
        setMessage(err.error || "Request failed");
      }
    } catch {
      setMessage("Request failed");
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchUsers();
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Production Dashboard</h1>
        <p style={{ color: "#2563eb", fontSize: "0.9rem", fontWeight: 500 }}>
          Deployed automatically via GitHub Actions CI/CD.
        </p>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 4, padding: "0.75rem 1rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontWeight: 600 }}>API Status: </span>
          <span>{health}</span>
          <button
            onClick={fetchHealth}
            style={{ marginLeft: "1rem", padding: "0.25rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
        <a
          href="/api/metrics"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.85rem", color: "#2563eb", textDecoration: "none", fontWeight: 500 }}
        >
          View Prometheus Metrics &rarr;
        </a>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Add User</h2>
        <form onSubmit={createUser} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ padding: "0.4rem 0.6rem", flex: 1, minWidth: 120, border: "1px solid #ccc", borderRadius: 3 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: "0.4rem 0.6rem", flex: 1, minWidth: 120, border: "1px solid #ccc", borderRadius: 3 }}
          />
          <button
            type="submit"
            style={{ padding: "0.4rem 0.8rem", cursor: "pointer", border: "1px solid #ccc", borderRadius: 3 }}
          >
            Submit
          </button>
        </form>
        {message && <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#444" }}>{message}</p>}
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Users ({users.length})</h2>
          <button
            onClick={fetchUsers}
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem", cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
        {users.length === 0 ? (
          <p style={{ color: "#777", fontSize: "0.9rem" }}>No users recorded.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: "0.5rem 0" }}>Username</th>
                <th style={{ padding: "0.5rem 0" }}>ID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "0.5rem 0" }}>{u.username}</td>
                  <td style={{ padding: "0.5rem 0", fontFamily: "monospace", color: "#666" }}>{u.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
