// middleware/auth.js
const jwt = require('jsonwebtoken');

function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Missing Bearer token' });
  try {
    req.user = jwt.verify(m[1], process.env.JWT_SECRET || 'dev-secret');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid/expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: 'forbidden' });
}

module.exports = { authRequired, adminOnly };
