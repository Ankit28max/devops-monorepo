const PORT = parseInt(process.env.PORT || "8081", 10);

Bun.serve({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/ws/health") {
      return new Response(JSON.stringify({ status: "ok", service: "ws" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Inter-service REST broadcast endpoint (called by Express API)
    if (req.method === "POST" && (url.pathname === "/broadcast" || url.pathname === "/ws/broadcast")) {
      try {
        const payload = await req.json();
        server.publish("incidents", JSON.stringify(payload));
        return new Response(JSON.stringify({ success: true, broadcasted: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Invalid broadcast payload" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Upgrade client connection to WebSocket
    if (server.upgrade(req)) {
      return;
    }

    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    open(ws) {
      ws.subscribe("incidents");
      ws.send(JSON.stringify({ type: "CONNECTED", message: "Connected to real-time incident stream" }));
      console.log("[ws] client connected and subscribed to 'incidents'");
    },
    message(ws, message) {
      console.log(`[ws] received message: ${message}`);
      // Echo or broadcast client events
      try {
        const parsed = JSON.parse(String(message));
        if (parsed.topic === "incidents") {
          ws.publish("incidents", String(message));
        }
      } catch {
        ws.send(JSON.stringify({ type: "ECHO", message: String(message) }));
      }
    },
    close(ws) {
      ws.unsubscribe("incidents");
      console.log("[ws] client disconnected");
    },
  },
});

console.log(`WebSocket server running on port ${PORT}`);
