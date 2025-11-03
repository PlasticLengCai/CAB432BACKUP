// routes/diag.js
const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { getPublicApiBase } = require("../services/params");
const router = express.Router();

router.get("/param/public-base", requireAuth, async (req, res) => {
  const v = await getPublicApiBase();
  res.json({ name: "A2-80/PUBLIC_API_BASE", value: v });
});
module.exports = router;