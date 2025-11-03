// index.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "script-src-attr": ["'none'"],
      "img-src": ["'self'", "data:", "https:"],
      "connect-src": ["'self'", "https:"],
      "style-src": ["'self'", "https:", "'unsafe-inline'"]
    }
  },
  hsts: { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true }
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

app.get('/_ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/_debug', express.Router()
  .get('/echo', (req, res) => {
    res.json({ authorization: req.headers.authorization || '(none)', headers: req.headers });
  })
  .get('/token', (req, res) => {
    const h = req.headers.authorization || '';
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(400).json({ error: 'Missing token' });
    try {
      const decoded = require('jsonwebtoken').decode(m[1], { complete: true });
      res.json({ ok: true, header: decoded?.header, payload: decoded?.payload });
    } catch (e) {
      res.status(400).json({ error: 'Cannot decode token', detail: String(e) });
    }
  })
);

const requireAuth       = require('./middleware/requireAuth');
const { authRouter }    = require('./routes/auth');                    // { authRouter: router }
const { filesRouter }   = require('./routes/files');                   // { filesRouter: router }
const cognitoRouter     = require('./routes/cognito');                 // router
const cloudRouter       = require('./routes/cloud');                   // router
const diagRouter        = require('./routes/diag');                    // router
const { externalRouter }= require('./routes/external');                // { externalRouter: router }
const sseRouter         = require('./routes/sse');                     // router

app.use('/api/auth',     authRouter);
app.use('/api/cognito',  cognitoRouter);
app.use('/api/files',    requireAuth, filesRouter);
app.use('/api/cloud',    requireAuth, cloudRouter);
app.use('/api/diag',     diagRouter);
app.use('/api/external', externalRouter);
app.use('/api/sse',      sseRouter);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((req, res) => res.status(404).json({ error: 'not found', path: req.originalUrl }));
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
