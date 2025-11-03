// services/dynamo.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { fromNodeProviderChain } = require('@aws-sdk/credential-provider-node');

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-2';
const TABLE = process.env.DDB_TABLE;

if (!TABLE) {
  console.warn('[DDB] WARN: env DDB_TABLE is not set. DynamoDB access will fail without it.');
}

const base = new DynamoDBClient({
  region: REGION,
});

const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
  unmarshallOptions: { wrapNumbers: false },
});

exports.saveItem = async (a, b, c) => {
  const item = (c && a && b) ? { ...c, 'qut-username': a, 'videoid': b } : a;
  if (!item || !item['qut-username'] || !item['videoid']) {
    throw new Error("Item must contain 'qut-username' and 'videoid'.");
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return { ok: true };
};

exports.listItems = async (qutUsername, limit = 20, cursor = null) => {
  if (!qutUsername) throw new Error('qutUsername is required');
  const params = {
    TableName: TABLE,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'qut-username' },
    ExpressionAttributeValues: { ':pk': qutUsername },
    Limit: limit,
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : undefined,
  };
  const out = await ddb.send(new QueryCommand(params));
  const next = out.LastEvaluatedKey ? Buffer.from(JSON.stringify(out.LastEvaluatedKey)).toString('base64') : null;
  return { items: out.Items || [], next };
};

exports.removeItem = async (qutUsername, videoid) => {
  if (!qutUsername || !videoid) throw new Error('qutUsername and videoid are required');
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { 'qut-username': qutUsername, 'videoid': videoid },
  }));
  return { ok: true };
};
