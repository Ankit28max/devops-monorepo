import express from "express";
import cors from "cors";
import { prismaClient } from "db/client";

const app = express();

app.use(cors());
app.use(express.json());

const handleHealth = async (_req: express.Request, res: express.Response) => {
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.json({ status: "degraded", database: "disconnected" });
  }
};

// Health checks
app.get("/health", handleHealth);
app.get("/api/health", handleHealth);

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
