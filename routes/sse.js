// routes/sse.js
const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const router = express.Router();

router.get("/events", requireAuth, (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  res.flushHeaders();

  res.write(`event: hello\ndata: ${JSON.stringify({ ts: Date.now(), user: req.auth?.sub })}\n\n`);

  const t = setInterval(() => {
    const payload = { ts: Date.now(), type: "heartbeat" };
    res.write(`event: heartbeat\ndata: ${JSON.stringify(payload)}\n\n`);
  }, 5000);

  req.on("close", () => clearInterval(t));
});
module.exports = router;
