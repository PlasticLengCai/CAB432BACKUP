// services/secrets.js 
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const SECRET_ID = process.env.SECRET_WEBHOOK || "/A2-80/WEBHOOK_SECRET";

const SECRET_KEY = process.env.WEBHOOK_SECRET_KEY || "mysecret";

const FALLBACK_PLAIN = process.env.WEBHOOK_SECRET_PLAIN || "";

const CACHE_TTL_MS = Number(process.env.SECRETS_CACHE_TTL_MS || 60_000);

const sm = new SecretsManagerClient({ region: REGION });
const _cache = new Map();

async function readSecretRaw(id = SECRET_ID) {
  if (!id) throw new Error("SecretId is empty");
  const now = Date.now();
  const hit = _cache.get(id);
  if (hit && now - hit.time < CACHE_TTL_MS) return hit.value;

  const out = await sm.send(new GetSecretValueCommand({ SecretId: id })); 
  const raw = out.SecretString || "";
  _cache.set(id, { value: raw, time: now });
  return raw;
}


async function getSecretObject(id = SECRET_ID) {
  try {
    const raw = await readSecretRaw(id);
    if (!raw) return {};
    if (raw[0] !== "{") return { value: raw };
    return JSON.parse(raw)
  } catch (e) {
    if (FALLBACK_PLAIN) return { value: FALLBACK_PLAIN };
    throw e;
  }
}


async function getWebhookSecret() {
  const obj = await getSecretObject();
  if (typeof obj.value === "string" && obj.value.length > 0) return obj.value;
  const keyed = obj && obj[SECRET_KEY];
  if (typeof keyed === "string" && keyed.length > 0) return keyed;
  const firstStr = obj && Object.values(obj).find(v => typeof v === "string" && v.length > 0);
  if (firstStr) return firstStr;
  if (FALLBACK_PLAIN) return FALLBACK_PLAIN;
  throw new Error("Secret is empty or invalid shape");
}

module.exports = { getSecretObject, getWebhookSecret };