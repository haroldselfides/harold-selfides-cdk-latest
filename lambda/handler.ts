import { DynamoDB } from 'aws-sdk'; 
import * as dotenv from 'dotenv';

dotenv.config();

const table = process.env.DYNAMODB_TABLE!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

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
        comment: body.comment, // No encryption
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
          comment: result.Item.comment, // No decryption
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