// services/queue.js
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
const SQS_URL = process.env.SQS_URL;
if (!SQS_URL) console.warn('[SQS] WARN: env SQS_URL not set.');

const sqs = new SQSClient({ region: REGION });

exports.enqueuePostUploadTask = async (payload) => {
  if (!SQS_URL) throw new Error('SQS_URL not set');
  const body = JSON.stringify(payload);
  const input = {
    QueueUrl: SQS_URL,
    MessageBody: body,
  };
  await sqs.send(new SendMessageCommand(input));
  console.log('[SQS] enqueued:', payload.type || 'unknown', payload.key);
  return { ok: true };
};

exports.receiveOne = async () => {
  if (!SQS_URL) throw new Error('SQS_URL not set');
  const out = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: SQS_URL,
    MaxNumberOfMessages: 1,
    WaitTimeSeconds: 20,
    VisibilityTimeout: 120
  }));

  const m = (out.Messages || [])[0];
  if (!m) return null;

  let body = {};
  try {
    body = JSON.parse(m.Body || '{}');
  } catch (e) {
    console.warn('[SQS] JSON parse error:', e);
  }

  return { receipt: m.ReceiptHandle, body };
};


exports.deleteByReceipt = async (receipt) => {
  if (!SQS_URL) throw new Error('SQS_URL not set');
  if (!receipt) return;
  await sqs.send(new DeleteMessageCommand({ QueueUrl: SQS_URL, ReceiptHandle: receipt }));
  console.log('[SQS] deleted message:', receipt);
};
