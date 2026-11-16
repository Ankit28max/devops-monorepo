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
// Application Business Logic
// ----------------------------------------------------
// List all users
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

// Create a user
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
