// routes/auth.js — A1 local auth routes
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// demo users
const users = [
  { id:'u1', username:'alice', password:'alice123', role:'user' },
  { id:'u2', username:'bob',   password:'bob123',   role:'admin' }
];

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_TTL    = process.env.JWT_TTL    || '12h';

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error:'username/password required' });
  const u = users.find(x => x.username===username && x.password===password);
  if (!u) return res.status(401).json({ error:'invalid credentials' });
  const token = jwt.sign({ sub:u.id, username:u.username, role:u.role }, JWT_SECRET, { expiresIn: JWT_TTL });
  res.json({ token, user:{ id:u.id, username:u.username, role:u.role } });
});

router.get('/me', (req, res) => {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error:'Missing Bearer token' });
  try {
    const p = jwt.verify(m[1], JWT_SECRET);
    res.json({ user:{ id:p.sub, username:p.username, role:p.role } });
  } catch { res.status(401).json({ error:'Invalid/expired token' }); }
});

module.exports = { authRouter: router };
