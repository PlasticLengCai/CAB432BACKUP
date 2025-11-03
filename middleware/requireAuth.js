// middleware/requireAuth.js
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const REGION       = process.env.AWS_REGION || "ap-southeast-2";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID    = process.env.COGNITO_CLIENT_ID || "";
const STRICT_ISSUER= (process.env.STRICT_ISSUER || "true").toLowerCase() !== "false";
const DEBUG_AUTH   = (process.env.DEBUG_AUTH || "0") === "1";

const EXPECTED_ISSUER = (REGION && USER_POOL_ID)
  ? `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`
  : null;

console.log("[AUTH_BOOT]", {
  REGION, POOL: USER_POOL_ID, CLIENT: CLIENT_ID, DEBUG_AUTH
});

const idVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse:   "id",
  clientId:   CLIENT_ID || undefined,
});
const accessVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse:   "access",
});

function decodePayload(token) {
  try {
    const [, p] = token.split(".");
    const json = Buffer.from(p, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch { return null; }
}

module.exports = async function requireAuth(req, res, next) {
  try {
    if (req.method === "OPTIONS") return next();

    console.log("[AUTH_CALL] path=", req.path);
    const hdr = req.headers.authorization || "";
    console.log("[AUTH_HEAD]", hdr.slice(0, 60) + (hdr.length > 60 ? "..." : ""));

    const [scheme, token] = hdr.split(" ");
    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ error: "Missing Bearer token", code: "NO_BEARER" });
    }

    const payload = decodePayload(token);
    if (DEBUG_AUTH && payload) {
      console.log("[AUTH_PAYLOAD]",
        "use=", payload.token_use,
        "iss=", payload.iss,
        "aud=", payload.aud,
        "client_id=", payload.client_id,
        "exp=", payload.exp,
        "now=", Math.floor(Date.now()/1000)
      );
    }
    if (DEBUG_AUTH && !payload) {
      console.error("[AUTH_PAYLOAD_ERR] cannot decode JWT payload (malformed?)");
    }

    if (STRICT_ISSUER && EXPECTED_ISSUER && payload?.iss && payload.iss !== EXPECTED_ISSUER) {
      return res.status(401).json({
        error: "Issuer mismatch", code: "ISS_MISMATCH",
        expected: EXPECTED_ISSUER, got: payload.iss
      });
    }

    let verified, tokenType;
    try {
      verified = await idVerifier.verify(token, { clockTolerance: 30 });
      tokenType = "id";
      if (CLIENT_ID && verified.aud && verified.aud !== CLIENT_ID) {
        return res.status(401).json({
          error: "Audience mismatch", code: "AUD_MISMATCH",
          expected: CLIENT_ID, got: verified.aud
        });
      }
    } catch (e1) {
      try {
        verified = await accessVerifier.verify(token, { clockTolerance: 30 });
        tokenType = "access";
      } catch (e2) {
        console.error("[AUTH_VERIFY_FAIL]", e1?.message || e1, "|", e2?.message || e2);
        return res.status(401).json({ error: "Invalid/expired token", code: "VERIFY_FAIL" });
      }
    }

    req.jwt = verified;
    req.jwtType = tokenType;
    req.user = { sub: verified.sub, username: verified["cognito:username"] || verified.username || "" };

    return next();
  } catch (e) {
    console.error("[AUTH_UNHANDLED]", e?.message || e);
    return res.status(401).json({ error: "Invalid/expired token", code: "UNHANDLED" });
  }
};
