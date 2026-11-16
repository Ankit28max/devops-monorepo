"use client";

import React, { useEffect, useState, useRef, type FormEvent } from "react";

interface Incident {
  id: string;
  title: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "investigating" | "resolved";
  createdAt: string;
}

interface User {
  id: string;
  username: string;
}

export default function Home() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [apiHealth, setApiHealth] = useState<string>("Checking...");
  const [wsStatus, setWsStatus] = useState<"connected" | "connecting" | "disconnected">("connecting");

  // Incident form
  const [title, setTitle] = useState("");
  const [service, setService] = useState("api-gateway");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("high");
  const [submitting, setSubmitting] = useState(false);

  // User form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userMsg, setUserMsg] = useState("");

  const wsRef = useRef<WebSocket | null>(null);

  // ----------------------------------------------------
  // 1. Initial REST Data Fetch
  // ----------------------------------------------------
  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setApiHealth(data.status === "ok" ? "Healthy (DB Connected)" : "Degraded");
    } catch {
      setApiHealth("Unreachable");
    }
  };

  const fetchIncidents = async () => {
    try {
      const res = await fetch("/api/incidents");
      const data = await res.json();
      if (Array.isArray(data)) setIncidents(data);
    } catch {
      setIncidents([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch {
      setUsers([]);
    }
  };

  // ----------------------------------------------------
  // 2. Real-time WebSocket Subscription
  // ----------------------------------------------------
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout;

    const connectWebSocket = () => {
      if (typeof window === "undefined") return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsStatus("connected");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.event === "INCIDENT_CREATED" && data.payload) {
              setIncidents((prev) => [data.payload, ...prev.filter((i) => i.id !== data.payload.id)]);
            } else if (data.event === "INCIDENT_UPDATED" && data.payload) {
              setIncidents((prev) =>
                prev.map((i) => (i.id === data.payload.id ? data.payload : i))
              );
            } else if (data.event === "INCIDENT_DELETED" && data.payload?.id) {
              setIncidents((prev) => prev.filter((i) => i.id !== data.payload.id));
            }
          } catch {
            // Ignore non-json control messages
          }
        };

        ws.onclose = () => {
          setWsStatus("disconnected");
          reconnectTimer = setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setWsStatus("disconnected");
        reconnectTimer = setTimeout(connectWebSocket, 3000);
      }
    };

    fetchHealth();
    fetchIncidents();
    fetchUsers();
    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ----------------------------------------------------
  // 3. Incident Actions (CRUD)
  // ----------------------------------------------------
  const handleCreateIncident = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), service, severity }),
      });

      if (res.ok) {
        setTitle("");
        fetchIncidents();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (incident: Incident) => {
    const nextStatus = incident.status === "investigating" ? "resolved" : "investigating";
    try {
      await fetch(`/api/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchIncidents();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleDeleteIncident = async (id: string) => {
    try {
      await fetch(`/api/incidents/${id}`, { method: "DELETE" });
      fetchIncidents();
    } catch (err) {
      console.error("Failed to delete incident", err);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (res.ok) {
        setUserMsg(`Added user ${username}`);
        setUsername("");
        setPassword("");
        fetchUsers();
      } else {
        const err = await res.json();
        setUserMsg(err.error || "Failed to create");
      }
    } catch {
      setUserMsg("Request failed");
    }
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case "critical":
        return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
      case "high":
        return { background: "#ffedd5", color: "#9a3412", border: "1px solid #fed7aa" };
      case "medium":
        return { background: "#fef9c3", color: "#854d0e", border: "1px solid #fef08a" };
      default:
        return { background: "#e0f2fe", color: "#075985", border: "1px solid #bae6fd" };
    }
  };

  return (
    <main style={{ maxWidth: 840, margin: "2rem auto", padding: "0 1.25rem", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
      {/* Platform Header */}
      <header style={{ marginBottom: "2rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
              Acko Platform & SRE Incident Board
            </h1>
            <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.9rem" }}>
              Event-driven distributed system integrating Next.js, Express REST API, Bun WebSocket & PostgreSQL.
            </p>
          </div>

          <a
            href="/api/metrics"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: "0.85rem",
              color: "#2563eb",
              textDecoration: "none",
              fontWeight: 600,
              padding: "0.4rem 0.8rem",
              borderRadius: "6px",
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
            }}
          >
            Prometheus Metrics &rarr;
          </a>
        </div>

        {/* Live Service Status Badges */}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", background: "#f8fafc", padding: "0.35rem 0.75rem", borderRadius: "999px", border: "1px solid #e2e8f0" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: apiHealth.includes("Healthy") ? "#16a34a" : "#dc2626" }} />
            <span>API: <strong>{apiHealth}</strong></span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", background: "#f8fafc", padding: "0.35rem 0.75rem", borderRadius: "999px", border: "1px solid #e2e8f0" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: wsStatus === "connected" ? "#16a34a" : wsStatus === "connecting" ? "#eab308" : "#dc2626",
              }}
            />
            <span>
              WebSocket:{" "}
              <strong>{wsStatus === "connected" ? "Live Connected" : wsStatus === "connecting" ? "Connecting..." : "Disconnected"}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Report Incident Form */}
      <section style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0 0 0.75rem" }}>Trigger / Log New Incident</h2>
        <form onSubmit={handleCreateIncident} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <input
            placeholder="e.g. Payment Gateway 504 Gateway Timeout Spike"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ flex: "2 1 240px", padding: "0.5rem 0.75rem", fontSize: "0.9rem", border: "1px solid #cbd5e1", borderRadius: "6px" }}
          />

          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{ flex: "1 1 140px", padding: "0.5rem 0.75rem", fontSize: "0.9rem", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff" }}
          >
            <option value="api-gateway">api-gateway</option>
            <option value="policy-issuance">policy-issuance</option>
            <option value="claims-engine">claims-engine</option>
            <option value="billing-worker">billing-worker</option>
            <option value="database-cluster">database-cluster</option>
          </select>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as any)}
            style={{ flex: "1 1 110px", padding: "0.5rem 0.75rem", fontSize: "0.9rem", border: "1px solid #cbd5e1", borderRadius: "6px", background: "#fff" }}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "0.5rem 1.1rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              background: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Broadcasting..." : "Broadcast Incident"}
          </button>
        </form>
      </section>

      {/* Live Incidents List */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>
            Active Platform Incidents ({incidents.length})
          </h2>
          <button
            onClick={fetchIncidents}
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem", border: "1px solid #cbd5e1", borderRadius: "4px", background: "#fff", cursor: "pointer" }}
          >
            Sync List
          </button>
        </div>

        {incidents.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b" }}>
            No active incidents. Submit one above to broadcast across all connected clients in real-time.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {incidents.map((incident) => {
              const sevBadge = getSeverityStyle(incident.severity);
              const isResolved = incident.status === "resolved";

              return (
                <div
                  key={incident.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    padding: "0.9rem 1rem",
                    background: isResolved ? "#fafafa" : "#fff",
                    borderRadius: "8px",
                    border: `1px solid ${isResolved ? "#e2e8f0" : "#cbd5e1"}`,
                    boxShadow: isResolved ? "none" : "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        ...sevBadge,
                      }}
                    >
                      {incident.severity}
                    </span>

                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.95rem",
                          textDecoration: isResolved ? "line-through" : "none",
                          color: isResolved ? "#94a3b8" : "#0f172a",
                        }}
                      >
                        {incident.title}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" }}>
                        service: <code>{incident.service}</code> •{" "}
                        {new Date(incident.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      onClick={() => handleToggleStatus(incident)}
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        padding: "0.35rem 0.75rem",
                        borderRadius: "5px",
                        border: "1px solid #cbd5e1",
                        background: isResolved ? "#f1f5f9" : "#dcfce7",
                        color: isResolved ? "#475569" : "#166534",
                        cursor: "pointer",
                      }}
                    >
                      {isResolved ? "Reopen" : "Mark Resolved"}
                    </button>

                    <button
                      onClick={() => handleDeleteIncident(incident.id)}
                      style={{
                        fontSize: "0.8rem",
                        padding: "0.35rem 0.6rem",
                        borderRadius: "5px",
                        border: "1px solid #fee2e2",
                        background: "#fff",
                        color: "#dc2626",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Users Section (Database Verification) */}
      <section style={{ borderTop: "1px solid #e2e8f0", paddingTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0 0 0.5rem" }}>User Management (Prisma DB Test)</h2>
        <form onSubmit={handleCreateUser} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ padding: "0.4rem 0.6rem", flex: 1, minWidth: 120, border: "1px solid #ccc", borderRadius: 4 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: "0.4rem 0.6rem", flex: 1, minWidth: 120, border: "1px solid #ccc", borderRadius: 4 }}
          />
          <button
            type="submit"
            style={{ padding: "0.4rem 0.8rem", cursor: "pointer", border: "1px solid #ccc", borderRadius: 4, background: "#f8fafc" }}
          >
            Add User
          </button>
        </form>
        {userMsg && <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0.25rem 0 0.75rem" }}>{userMsg}</p>}

        <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
          Registered users in PostgreSQL: <strong>{users.length}</strong>
        </div>
      </section>
    </main>
  );
}
