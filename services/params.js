// services/params.js
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const REGION = process.env.AWS_REGION || "ap-southeast-2";
const ssm = new SSMClient({ region: REGION });

let cache = { value: null, loadedAt: 0 };

async function getPublicApiBase() {
  const now = Date.now();
  if (cache.value && now - cache.loadedAt < 60_000) return cache.value; // 60s cache
  const out = await ssm.send(new GetParameterCommand({
    Name: "A2-80/PUBLIC_API_BASE", WithDecryption: false
  }));
  const val = out.Parameter?.Value || "";
  cache = { value: val, loadedAt: now };
  return val;
}

module.exports = {
  getPublicApiBase
};
