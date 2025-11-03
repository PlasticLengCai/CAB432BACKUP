// worker.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const execFileAsync = promisify(execFile);

const {
  S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { saveItem } = require('./services/dynamo.js');
const { receiveOne, deleteByReceipt } = require('./services/queue.js');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
const BUCKET = process.env.S3_BUCKET;
const DDB_TABLE = process.env.DDB_TABLE;

if (!BUCKET) console.warn('[Worker] WARN: S3_BUCKET not set.');
if (!process.env.SQS_QUEUE_URL) console.warn('[Worker] WARN: SQS_QUEUE_URL not set.');
if (!DDB_TABLE) console.warn('[Worker] INFO: DDB_TABLE not set, will skip saving to DynamoDB.');

const s3 = new S3Client({ region: REGION });

async function downloadToTmp(s3Key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const tmp = path.join('/tmp', path.basename(s3Key));
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmp, buf);
  return tmp;
}

async function uploadToS3(localPath, outKey, contentType) {
  const body = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: outKey,
    Body: body,
    ContentType: contentType || 'application/octet-stream'
  }));
}

async function headObject(key) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    return null;
  }
}

async function ffprobeJson(localPath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      localPath
    ]);
    return JSON.parse(stdout);
  } catch (e) {
    console.warn('[ffprobe] failed:', e?.message || e);
    return null;
  }
}

async function ffmpegThumb(localPath, outPath, atSec = 1) {
  await execFileAsync('ffmpeg', [
    '-ss', String(atSec),
    '-i', localPath,
    '-frames:v', '1',
    '-q:v', '2',
    '-y', outPath
  ]);
  return outPath;
}

async function ffmpegPreview(localPath, outPath, sec = 10, width = 720) {
  await execFileAsync('ffmpeg', [
    '-i', localPath,
    '-t', String(sec),
    '-vf', `scale=${width}:-2`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y', outPath
  ]);
  return outPath;
}

function extractUsernameFromKey(inputKey) {
  const m = inputKey.match(/^uploads\/([^/]+)\//i);
  return m ? m[1] : null;
}

async function handleInspect(job, local, inputKey) {
  const meta = await ffprobeJson(local);
  let basic = await headObject(inputKey);
  basic = basic ? { size: basic.ContentLength, contentType: basic.ContentType, etag: basic.ETag } : null;

  if (DDB_TABLE && saveItem) {
    await saveItem({
      'qut-username': job['qut-username'] || extractUsernameFromKey(inputKey) || 'unknown',
      'videoid': job.videoid || path.basename(inputKey),
      inputKey,
      status: 'DONE',
      meta, basic,
      updatedAt: new Date().toISOString()
    });
  }

  console.log('[worker/inspect] done:', { videoid: job.videoid, inputKey });
}

async function handleThumb(job, local, inputKey) {
  const at = Number(job?.options?.thumbAt ?? 1);

  const username = job['qut-username'] || extractUsernameFromKey(inputKey) || 'unknown';
  const baseNoExt = path.basename(inputKey).replace(/\.[^.]+$/, '');
  const outLocal = path.join('/tmp', `${baseNoExt}_thumb.jpg`);
  const outKey = inputKey
    .replace(/^uploads\//i, `thumbnails/${username}/`)
    .replace(/^thumbnails\/[^/]+\//i, `thumbnails/${username}/`)
    .replace(/[^/]+$/i, `${baseNoExt}_thumb.jpg`);

  await ffmpegThumb(local, outLocal, at);
  await uploadToS3(outLocal, outKey, 'image/jpeg');

  if (DDB_TABLE && saveItem) {
    await saveItem({
      'qut-username': username,
      'videoid': job.videoid || baseNoExt,
      inputKey,
      thumbKey: outKey,
      status: 'DONE',
      updatedAt: new Date().toISOString()
    });
  }

  console.log('[worker/thumb] done:', { videoid: job.videoid, outKey });
}

async function handlePreview(job, local, inputKey) {
  const sec = Number(job?.options?.previewSec ?? 10);
  const width = Number(job?.options?.width ?? 720);

  const username = job['qut-username'] || extractUsernameFromKey(inputKey) || 'unknown';
  const baseNoExt = path.basename(inputKey).replace(/\.[^.]+$/, '');
  const outLocal = path.join('/tmp', `${baseNoExt}_preview.mp4`);
  const outKey = inputKey
    .replace(/^uploads\//i, `previews/${username}/`)
    .replace(/^previews\/[^/]+\//i, `previews/${username}/`)
    .replace(/[^/]+$/i, `${baseNoExt}_preview.mp4`);

  await ffmpegPreview(local, outLocal, sec, width);
  await uploadToS3(outLocal, outKey, 'video/mp4');

  if (DDB_TABLE && saveItem) {
    await saveItem({
      'qut-username': username,
      'videoid': job.videoid || baseNoExt,
      inputKey,
      previewKey: outKey,
      status: 'DONE',
      updatedAt: new Date().toISOString()
    });
  }

  console.log('[worker/preview] done:', { videoid: job.videoid, outKey });
}

async function handleOne(job) {
  const type = (job?.type || 'inspect').toLowerCase();
  const inputKey = job?.key;
  if (!inputKey) throw new Error('job.key missing');

  const local = await downloadToTmp(inputKey);

  if (type === 'inspect') {
    await handleInspect(job, local, inputKey);
  } else if (type === 'thumb') {
    await handleThumb(job, local, inputKey);
  } else if (type === 'preview') {
    await handlePreview(job, local, inputKey);
  } else {
    throw new Error(`unknown job.type: ${type}`);
  }
}

async function loop() {
  console.log('[worker] started…');
  while (true) {
    try {
      const msg = await receiveOne();
      if (!msg) continue;
      try {
        await handleOne(msg.body);
        await deleteByReceipt(msg.receipt);
      } catch (e) {
        console.error('[worker] job failed:', e?.stack || e);
      }
    } catch (e) {
      console.error('[worker] loop error:', e?.stack || e);
    }
  }
}

loop().catch(err => {
  console.error(err);
  process.exit(1);
});
