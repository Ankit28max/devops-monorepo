import { prismaClient } from "db/client";

const PORT = parseInt(process.env.PORT || "8081", 10);

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "ws" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (server.upgrade(req)) {
      return;
    }
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    message(ws, message) {
      console.log(`[ws] received: ${message}`);
      const suffix = Math.random().toString(36).substring(2, 8);
      prismaClient.user
        .create({
          data: {
            username: `ws-user-${suffix}`,
            password: "ws-generated-password",
          },
        })
        .catch((err) => {
          console.error("[ws] db error:", err);
        });

      ws.send(`echo: ${message}`);
    },
  },
});

console.log(`WebSocket server listening on port ${PORT}`);
