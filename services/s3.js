// services/s3.js
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
const BUCKET = process.env.S3_BUCKET;

if (!BUCKET) {
  console.warn('[S3] WARN: env S3_BUCKET is not set. Presign will fail without it.');
}

// NOTE: 默认提供链；如需强制 SSO，可在此注入 fromSSO({ profile })
const s3 = new S3Client({ region: REGION });

/**
 * 旧版：仅返回 URL（仍保留兼容）
 */
exports.getUploadUrl = async (key, contentType, expiresIn = 900) => {
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return url;
};


exports.getUploadUrlWithHeaders = async (key, contentType, expiresIn = 900, extraHeaders = {}) => {
  const ct = contentType || 'application/octet-stream';
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: ct,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  const requiredHeaders = { 'Content-Type': ct, ...extraHeaders };
  return { url, requiredHeaders };
};


exports.getDownloadUrl = async (key, expiresIn = 300, opts = {}) => {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: opts.responseContentDisposition,
    ResponseContentType: opts.responseContentType,
  });
  return await getSignedUrl(s3, cmd, { expiresIn });
};


exports.deleteObject = async (key) => {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3.send(cmd);
};
