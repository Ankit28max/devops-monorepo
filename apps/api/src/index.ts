import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import client from "prom-client";
import { prismaClient } from "db/client";

const app = express();

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// Observability: Prometheus Metrics Setup
// ----------------------------------------------------
const register = new client.Registry();

// Collect default OS & runtime metrics (CPU, Memory, Event Loop)
client.collectDefaultMetrics({ register });

// Custom metric: HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
register.registerMetric(httpRequestDuration);

// Custom metric: Total HTTP requests counter
const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests processed",
  labelNames: ["method", "route", "status_code"],
});
register.registerMetric(httpRequestsTotal);

// ----------------------------------------------------
// Middleware: Request ID & Structured JSON Logging
// ----------------------------------------------------
app.use((req, res, next) => {
  const startTime = process.hrtime();
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const diff = process.hrtime(startTime);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const durationMs = Math.round(durationSeconds * 1000);

    const route = req.route ? req.route.path : req.path;

    // Record Prometheus metrics
    httpRequestDuration.labels(req.method, String(route), String(res.statusCode)).observe(durationSeconds);
    httpRequestsTotal.labels(req.method, String(route), String(res.statusCode)).inc();

    // Standardized Structured JSON Log (SRE standard)
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? "error" : "info",
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
      })
    );
  });

  next();
});

// ----------------------------------------------------
// Inter-service WebSocket Notification Helper
// ----------------------------------------------------
const WS_BROADCAST_URL = process.env.WS_INTERNAL_URL || "http://ws:8081/broadcast";

async function notifyWebSocket(event: string, payload: unknown) {
  try {
    await fetch(WS_BROADCAST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.warn(`[ws-notify] broadcast notification failed: ${(err as Error).message}`);
  }
}

// ----------------------------------------------------
// Prometheus Metrics Scraping Endpoint
// ----------------------------------------------------
const handleMetrics = async (_req: express.Request, res: express.Response) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
};

app.get("/metrics", handleMetrics);
app.get("/api/metrics", handleMetrics);

// ----------------------------------------------------
// Health Check Endpoints
// ----------------------------------------------------
const handleHealth = async (_req: express.Request, res: express.Response) => {
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.json({ status: "degraded", database: "disconnected" });
  }
};

app.get("/health", handleHealth);
app.get("/api/health", handleHealth);

// ----------------------------------------------------
// SRE Incidents & Platform Tasks (CRUD)
// ----------------------------------------------------
// 1. List all incidents
app.get(["/incidents", "/api/incidents"], async (_req, res) => {
  try {
    const incidents = await (prismaClient as any).incident.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(incidents);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch incidents" });
  }
});

// 2. Create a new incident
app.post(["/incidents", "/api/incidents"], async (req, res) => {
  const { title, service = "api-gateway", severity = "medium" } = req.body ?? {};

  if (!title || typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    const incident = await (prismaClient as any).incident.create({
      data: {
        title: title.trim(),
        service: String(service).trim(),
        severity: String(severity).trim().toLowerCase(),
        status: "investigating",
      },
    });

    // Broadcast to all connected WebSocket clients in real-time
    notifyWebSocket("INCIDENT_CREATED", incident);

    res.status(201).json(incident);
  } catch (err) {
    res.status(500).json({ error: "Failed to create incident" });
  }
});

// 3. Update an incident (Toggle status: investigating <-> resolved)
app.patch(["/incidents/:id", "/api/incidents/:id"], async (req, res) => {
  const { id } = req.params;
  const { status } = req.body ?? {};

  try {
    const updated = await (prismaClient as any).incident.update({
      where: { id },
      data: { status: String(status || "resolved") },
    });

    // Broadcast update
    notifyWebSocket("INCIDENT_UPDATED", updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update incident" });
  }
});

// 4. Delete an incident
app.delete(["/incidents/:id", "/api/incidents/:id"], async (req, res) => {
  const { id } = req.params;

  try {
    await (prismaClient as any).incident.delete({
      where: { id },
    });

    // Broadcast deletion
    notifyWebSocket("INCIDENT_DELETED", { id });

    res.json({ id, deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete incident" });
  }
});

// ----------------------------------------------------
// Users (Legacy / Direct Authentication Test)
// ----------------------------------------------------
app.get(["/users", "/api/users"], async (_req, res) => {
  try {
    const users = await prismaClient.user.findMany({
      select: { id: true, username: true },
      orderBy: { id: "desc" },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post(["/users", "/api/users"], async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  try {
    const user = await prismaClient.user.create({
      data: { username: String(username).trim(), password: String(password) },
      select: { id: true, username: true },
    });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

const PORT = parseInt(process.env.PORT || "8080", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running on http://0.0.0.0:${PORT}`);
});
