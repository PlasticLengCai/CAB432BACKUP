// routes/cognito.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const REGION = process.env.AWS_REGION;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || null;

if (!REGION || !CLIENT_ID) {
  console.warn('[Cognito] Missing AWS_REGION or COGNITO_CLIENT_ID in environment.');
}

let svc = null;
try {
  const mod = require('../services/cognito');
  svc = mod?.default || mod;
} catch (_) {
}

// --------- helpers ----------
function makeSecretHash(username) {
  if (!CLIENT_SECRET) return undefined;
  const h = crypto.createHmac('sha256', CLIENT_SECRET);
  h.update(username + CLIENT_ID);
  return h.digest('base64');
}

async function getSdk() {
  const m = await import('@aws-sdk/client-cognito-identity-provider');
  const { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } = m;
  const client = new CognitoIdentityProviderClient({ region: REGION });
  return { client, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand };
}

function normalizeTokens(out) {
  const a = out || {};
  const ar = a.AuthenticationResult || a.authResult || {};
  const id  = a.idToken || a.IdToken || a.id_token || ar.IdToken || ar.idToken || ar.id_token;
  const at  = a.accessToken || a.AccessToken || a.access_token || ar.AccessToken || ar.accessToken || ar.access_token;
  const rt  = a.refreshToken || a.RefreshToken || a.refresh_token || ar.RefreshToken || ar.refreshToken || ar.refresh_token;
  const exp = a.expiresIn || a.ExpiresIn || ar.ExpiresIn || ar.expiresIn;
  return { idToken: id, accessToken: at, refreshToken: rt, expiresIn: exp };
}

function ok(res, data) { return res.json(data); }
function bad(res, err) { 
  const msg = err?.message || err?.toString?.() || 'request failed';
  return res.status(400).json({ error: msg });
}

router.post('/signup', async (req, res) => {
  try {
    const { username, password, email, displayName, givenName, familyName, phoneNumber } = req.body || {};
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'username/password/email required' });
    }

    const attrs = [
      { Name: 'email', Value: email },
      { Name: 'name', Value: displayName || username }
    ];
    if (givenName)   attrs.push({ Name: 'given_name', Value: givenName });
    if (familyName)  attrs.push({ Name: 'family_name', Value: familyName });
    if (phoneNumber) attrs.push({ Name: 'phone_number', Value: phoneNumber });

    if (svc?.signUp) {
      const maybe = await svc.signUp(username, password, email, displayName, { givenName, familyName, phoneNumber });
      return ok(res, maybe || { ok: true });
    }

    const { client, SignUpCommand } = await getSdk();
    const params = {
      ClientId: CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: attrs
    };
    const sh = makeSecretHash(username);
    if (sh) params.SecretHash = sh;

    await client.send(new SignUpCommand(params));
    return ok(res, { ok: true });
  } catch (e) { return bad(res, e); }
});

router.post('/confirm', async (req, res) => {
  try {
    const { username, code } = req.body || {};
    if (!username || !code) {
      return res.status(400).json({ error: 'username/code required' });
    }

    if (svc?.confirm) {
      const maybe = await svc.confirm(username, code);
      return ok(res, maybe || { ok: true });
    }

    const { client, ConfirmSignUpCommand } = await getSdk();
    const params = { ClientId: CLIENT_ID, Username: username, ConfirmationCode: code };
    const sh = makeSecretHash(username);
    if (sh) params.SecretHash = sh;

    await client.send(new ConfirmSignUpCommand(params));
    return ok(res, { ok: true });
  } catch (e) { return bad(res, e); }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username/password required' });
    }

    if (svc?.login) {
      const raw = await svc.login(username, password);
      const tokens = normalizeTokens(raw);
      if (!tokens.idToken && !tokens.accessToken) {
        return res.status(400).json({ error: 'Login succeeded but no tokens returned from provider' });
      }
      return ok(res, tokens);
    }

    const { client, InitiateAuthCommand } = await getSdk();
    const params = {
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: username, PASSWORD: password }
    };
    const sh = makeSecretHash(username);
    if (sh) params.AuthParameters.SECRET_HASH = sh;

    const raw = await client.send(new InitiateAuthCommand(params));
    const tokens = normalizeTokens(raw);
    if (!tokens.idToken && !tokens.accessToken) {
      return res.status(400).json({ error: 'Login succeeded but no tokens returned from Cognito' });
    }
    return ok(res, tokens);
  } catch (e) { return bad(res, e); }
});

module.exports = router;
