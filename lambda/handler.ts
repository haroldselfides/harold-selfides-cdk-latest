import { DynamoDB } from 'aws-sdk';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

dotenv.config();

const table = process.env.DYNAMODB_TABLE!;
const passphrase = process.env.AES_SECRET_KEY!;

// Derive a 32-byte key from the passphrase
const key = crypto.createHash('sha256').update(passphrase).digest();
const algorithm = 'aes-256-cbc';
const ivLength = 16;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// Encryption function
function encrypt(text: string): string {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Decryption function
function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

export const handler = async (event: any) => {
  const dynamo = new DynamoDB.DocumentClient();
  const method = event.httpMethod;
  const headers = event.headers || {};
  const userAgent = headers['User-Agent'] || headers['user-agent'] || 'Unknown';

  console.log("Received event:", JSON.stringify(event));
  console.log("Table name:", table);

  try {
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id || !body.comment || !body.rating) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing required fields (id, comment, rating)' }),
        };
      }

      const item = {
        id: body.id,
        rating: body.rating,
        comment: encrypt(body.comment),
        timestamp: new Date().toISOString(),
        userAgent,
      };

      await dynamo.put({
        TableName: table,
        Item: item,
      }).promise();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Feedback submitted successfully.' }),
      };
    }

    if (method === 'GET') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing id parameter' }),
        };
      }

      const result = await dynamo.get({
        TableName: table,
        Key: { id },
      }).promise();

      if (!result.Item) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Feedback not found' }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          id: result.Item.id,
          rating: result.Item.rating,
          comment: decrypt(result.Item.comment),
          timestamp: result.Item.timestamp,
          userAgent: result.Item.userAgent,
        }),
      };
    }

    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Missing id parameter' }),
        };
      }

      await dynamo.delete({
        TableName: table,
        Key: { id },
      }).promise();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Feedback deleted successfully.' }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  } catch (error: any) {
    console.error("Internal server error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message,
      }),
    };
  }
};
