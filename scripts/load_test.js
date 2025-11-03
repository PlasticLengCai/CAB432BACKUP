
/**
 * Load testing script: logs in, then hammers /api/transcode/sync
 * Usage:
 *   BASE_URL=http://localhost:3000 USERNAME=alice PASSWORD=alice123 FILE_ID=<id> CONCURRENCY=8 ROUNDS=10 node scripts/load_test.js
 * Aim: keep CPU >80% for ~5 minutes by choosing large enough CONCURRENCY*ROUNDS.
 */
const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.USERNAME || 'alice';
const PASSWORD = process.env.PASSWORD || 'alice123';
const FILE_ID = process.env.FILE_ID || '';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '4', 10);
const ROUNDS = parseInt(process.env.ROUNDS || '10', 10);

async function main() {
  if (!FILE_ID) {
    console.error('Set FILE_ID to an uploaded video id.');
    process.exit(1);
  }
  const loginResp = await axios.post(`${BASE_URL}/api/auth/login`, { username: USERNAME, password: PASSWORD });
  const token = loginResp.data.token;
  const headers = { Authorization: `Bearer ${token}` };

  console.log(`Load testing against ${BASE_URL} with CONCURRENCY=${CONCURRENCY} ROUNDS=${ROUNDS}`);
  const tasks = [];
  for (let r=0; r<ROUNDS; r++) {
    tasks.push(runBatch(headers));
  }
  await Promise.all(tasks);
  console.log('Done. Check CPU graph in AWS console or run htop within the container/VM.');
}

async function runBatch(headers) {
  const jobs = [];
  for (let i=0; i<CONCURRENCY; i++) {
    jobs.push(
      axios.post(`${BASE_URL}/api/transcode/sync`, {
        id: FILE_ID, resolution: '1280x720', format: 'mp4'
      }, { headers })
      .then(resp => process.stdout.write('.'))
      .catch(err => process.stdout.write('E'))
    );
  }
  await Promise.all(jobs);
}

main().catch(e => { console.error(e.message); process.exit(1); });
