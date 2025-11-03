// services/cache.js
const memjs = require("memjs");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const ssm = new SSMClient({ region: process.env.AWS_REGION || "ap-southeast-2" });
let mc;

async function getEndpoint() {
  const out = await ssm.send(new GetParameterCommand({ Name: "A2-80/MEMCACHED_ENDPOINT", WithDecryption: false }));
  return out.Parameter?.Value; // host:port
}
async function client() {
  if (mc) return mc;
  mc = memjs.Client.create(await getEndpoint());
  return mc;
}

exports.cacheFetch = async (key, ttlSec, loader) => {
  const c = await client();
  const got = await c.get(key);
  if (got?.value) return JSON.parse(got.value.toString());
  const val = await loader();
  await c.set(key, Buffer.from(JSON.stringify(val)), { expires: ttlSec });
  return val;
};
