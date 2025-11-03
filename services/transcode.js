
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Run a CPU-heavy transcode with optional filters.
 * @param {string} inputPath
 * @param {object} options - { format, resolution, crf, preset, extraFilters, outputSuffix }
 * @returns {Promise<string>} output path
 */
function transcodeVideo(inputPath, options = {}) {
  const { format='mp4', resolution='1280x720', crf=18, preset='veryslow', extraFilters='', outputSuffix='' } = options;
  const outDir = path.join(__dirname, '..', 'storage', 'transcoded');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(inputPath, path.extname(inputPath));
  const safeSuffix = outputSuffix ? `_${outputSuffix}` : '';
  const outPath = path.join(outDir, `${base}_${resolution}_${format}${safeSuffix}.${format}`);

  const filters = [];
  // scale keeps aspect ratio (width set, height -2)
  const [w, h] = resolution.toLowerCase().split('x');
  if (w && h) {
    const ww = parseInt(w, 10);
    const hh = parseInt(h, 10);
    if (!isNaN(ww) && !isNaN(hh)) filters.push(`scale=${ww}:${hh}:flags=lanczos`);
  }
  // Add CPU-heavy filters to ensure sustained load
  filters.push('hqdn3d=1.5:1.5:6:6');
  filters.push('unsharp=5:5:1.0:5:5:0.0');
  if (extraFilters) filters.push(extraFilters);

  return new Promise((resolve, reject)=>{
    let command = ffmpeg(inputPath)
      .videoCodec('libx264')
      .format(format)
      .outputOptions([
        `-preset ${preset}`,
        `-crf ${crf}`,
        '-movflags +faststart',
        '-an' // drop audio to keep CPU focused on video
      ])
      .outputOptions([`-vf ${filters.join(',')}`])
      .on('start', cmd=> console.log('ffmpeg start:', cmd))
      .on('progress', prog=> process.stdout.write(`\rTranscoding ${Math.round(prog.percent||0)}%`))
      .on('end', ()=> { console.log('\nffmpeg done.'); resolve(outPath); })
      .on('error', err=> reject(err))
      .save(outPath);
  });
}

/**
 * Extract thumbnails every N seconds.
 */
function extractThumbnails(inputPath, everyN=10) {
  const outDir = path.join(__dirname, '..', 'storage', 'thumbnails', path.basename(inputPath, path.extname(inputPath)));
  fs.mkdirSync(outDir, { recursive: true });
  const pattern = path.join(outDir, 'thumb_%04d.jpg');
  return new Promise((resolve, reject)=>{
    ffmpeg(inputPath)
      .outputOptions([`-vf fps=1/${everyN}`])
      .on('end', ()=> resolve(outDir))
      .on('error', err=> reject(err))
      .save(pattern);
  });
}

module.exports = { transcodeVideo, extractThumbnails };
