
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const defaultData = {
  videos: [],   // { id, owner, originalFilename, pathOriginal, mime, size, uploadedAt, title }
  jobs: []      // { id, videoId, owner, params, status, startedAt, finishedAt, outputPath, error }
};

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function addVideo(video) {
  const db = readDb();
  db.videos.push(video);
  writeDb(db);
  return video;
}

function listVideos(filter = {}, { page=1, limit=10, sort='uploadedAt', order='desc' } = {}) {
  const db = readDb();
  let items = db.videos.filter(v => {
    if (filter.owner && v.owner !== filter.owner) return false;
    if (filter.q) {
      const q = filter.q.toLowerCase();
      const hit = (v.title||'').toLowerCase().includes(q) || (v.originalFilename||'').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
  items.sort((a,b)=> {
    const av = a[sort]; const bv = b[sort];
    if (av === bv) return 0;
    const cmp = (av > bv) ? 1 : -1;
    return order === 'desc' ? -cmp : cmp;
  });
  const total = items.length;
  const start = (page-1) * limit;
  const end = start + limit;
  const pageItems = items.slice(start, end);
  return { total, page, limit, items: pageItems };
}

function getVideo(id) {
  const db = readDb();
  return db.videos.find(v => v.id === id);
}

function upsertJob(job) {
  const db = readDb();
  const idx = db.jobs.findIndex(j => j.id === job.id);
  if (idx >= 0) db.jobs[idx] = job; else db.jobs.push(job);
  writeDb(db);
  return job;
}

function getJob(id) {
  const db = readDb();
  return db.jobs.find(j => j.id === id);
}

function listJobs(owner) {
  const db = readDb();
  return db.jobs.filter(j => j.owner === owner);
}

module.exports = {
  ensureDb,
  addVideo,
  listVideos,
  getVideo,
  upsertJob,
  getJob,
  listJobs,
  DB_PATH
};
