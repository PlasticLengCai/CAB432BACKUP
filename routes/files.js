const express = require('express');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto'); // replace nanoid
const { addVideo, listVideos, getVideo, upsertJob, getJob, listJobs } = require('../services/db');
const { transcodeVideo, extractThumbnails } = require('../services/transcode');

const router = express.Router();

// Upload unstructured data (video)
router.post('/upload', async (req, res) => {
  if (!req.files || !req.files.file) return res.status(400).json({ error: 'Missing file field "file"' });
  const file = req.files.file;
  const id = randomUUID(); // replace nanoid
  const ext = path.extname(file.name) || '.mp4';
  const outDir = path.join(__dirname, '..', 'storage', 'original');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${id}${ext}`);
  await file.mv(outPath);

  const video = {
    id,
    owner: req.user.sub,
    originalFilename: file.name,
    pathOriginal: outPath,
    mime: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString(),
    title: req.body.title || path.basename(file.name, ext)
  };
  addVideo(video);
  res.status(201).json({ id, message: 'Uploaded', video });
});

// List videos with extended API features: pagination, filtering, sorting
router.get('/files', (req,res)=>{
  const { page=1, limit=10, q='', sort='uploadedAt', order='desc', owner='me' } = req.query;
  const filter = {};
  if (owner === 'me') filter.owner = req.user.sub;
  if (q) filter.q = q;
  const result = listVideos(filter, { page: parseInt(page), limit: parseInt(limit), sort, order });
  res.json({ ...result, _links: { self: req.originalUrl } });
});

router.get('/files/:id', (req,res)=>{
  const v = getVideo(req.params.id);
  if (!v || v.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

router.get('/files/:id/download', (req,res)=>{
  const v = getVideo(req.params.id);
  if (!v || v.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  const variant = req.query.variant || 'original';
  let filePath = v.pathOriginal;
  if (variant !== 'original') {
    const outDir = path.join(__dirname, '..', 'storage', 'transcoded');
    const base = path.basename(v.pathOriginal, path.extname(v.pathOriginal));
    const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(name => name.startsWith(base) && name.includes(variant)) : [];
    if (files[0]) filePath = path.join(outDir, files[0]);
  }
  return res.download(filePath);
});

// Synchronous transcode (blocks request) — good for load testing
router.post('/transcode/sync', async (req, res) => {
  const { id, format='mp4', resolution='1280x720', crf=18, preset='veryslow', extraFilters='' } = req.body || {};
  const v = getVideo(id);
  if (!v || v.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  try {
    const out = await transcodeVideo(v.pathOriginal, { format, resolution, crf, preset, extraFilters, outputSuffix: Date.now().toString(36) });
    return res.json({ message: 'done', output: out });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Asynchronous transcode — returns a job id you can poll
router.post('/transcode', async (req, res) => {
  const { id, format='mp4', resolution='1280x720', crf=18, preset='veryslow', extraFilters='' } = req.body || {};
  const v = getVideo(id);
  if (!v || v.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });

  const job = {
    id: `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`,
    videoId: id,
    owner: req.user.sub,
    params: { format, resolution, crf, preset, extraFilters },
    status: 'queued',
    startedAt: new Date().toISOString()
  };
  upsertJob(job);

  (async () => {
    try {
      job.status = 'running';
      upsertJob(job);
      const output = await transcodeVideo(v.pathOriginal, { format, resolution, crf, preset, extraFilters });
      job.status = 'completed';
      job.outputPath = output;
      job.finishedAt = new Date().toISOString();
      upsertJob(job);
    } catch (e) {
      job.status = 'failed';
      job.error = e.message;
      job.finishedAt = new Date().toISOString();
      upsertJob(job);
    }
  })();

  res.status(202).json({ jobId: job.id, status: job.status });
});

router.get('/jobs', (req,res)=>{
  const jobs = listJobs(req.user.sub);
  res.json(jobs);
});

router.get('/jobs/:id', (req,res)=>{
  const j = getJob(req.params.id);
  if (!j || j.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  res.json(j);
});

// Generate thumbnails (additional data type)
router.post('/thumbnails', async (req,res)=>{
  const { id, everyN=10 } = req.body || {};
  const v = getVideo(id);
  if (!v || v.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  try {
    const dir = await extractThumbnails(v.pathOriginal, parseInt(everyN));
    res.json({ dir });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// New: List thumbnails for a given video
router.get('/files/:id/thumbnails', (req, res) => {
  const v = getVideo(req.params.id);
  if (!v || v.owner !== req.user.sub) return res.status(404).json({ error: 'Not found' });

  const baseName = path.basename(v.pathOriginal, path.extname(v.pathOriginal));
  const dir = path.join(__dirname, '..', 'storage', 'thumbnails', baseName);

  if (!fs.existsSync(dir)) {
    return res.json({ items: [] });
  }

  const files = fs.readdirSync(dir)
    .filter(name => /^thumb_\d+\.jpg$/i.test(name))
    .sort();

  const items = files.map(name => ({
    file: name,
    url: `/thumbnails/${baseName}/${name}`
  }));

  res.json({ items });
});

module.exports = { filesRouter: router };
