import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const secretsManager = new SecretsManagerClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface AuthCodeData {
  authCode: string;
  clientId: string;
  expiresAt: number;
  used: boolean;
  createdAt: number;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const path = event.path;
    const method = event.httpMethod;

    // Add CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    };

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: '',
      };
    }

    if (path.includes('/oauth/authorize')) {
      const result = await handleAuthorize(event);
      return {
        ...result,
        headers: { ...result.headers, ...corsHeaders },
      };
    } else if (path.includes('/oauth/token')) {
      const result = await handleToken(event);
      return {
        ...result,
        headers: { ...result.headers, ...corsHeaders },
      };
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' }),
    };
  } catch (error) {
    console.error('OAuth error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleAuthorize(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  // Get query parameters
  const queryParams = event.queryStringParameters || {};
  const clientId = queryParams.client_id;
  const redirectUri = queryParams.redirect_uri;
  const state = queryParams.state;
  const responseType = queryParams.response_type;

  // Validate required parameters
  if (!clientId || !responseType) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'invalid_request',
        error_description: 'Missing required parameters: client_id and response_type'
      }),
    };
  }

  if (responseType !== 'code') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'unsupported_response_type',
        error_description: 'Only authorization code flow is supported'
      }),
    };
  }

  try {
    // Validate client_id against stored credentials
    const authSecret = await getAuthSecret();
    if (clientId !== authSecret.client_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'invalid_client',
          error_description: 'Invalid client_id'
        }),
      };
    }

    // Generate authorization code
    const authCode = generateAuthCode();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
    
    // Store the authorization code in DynamoDB
    await storeAuthCode({
      authCode,
      clientId,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    // If redirect_uri is provided, redirect with the code
    if (redirectUri) {
      const separator = redirectUri.includes('?') ? '&' : '?';
      const redirectUrl = `${redirectUri}${separator}code=${authCode}${state ? `&state=${state}` : ''}`;
      
      return {
        statusCode: 302,
        headers: {
          Location: redirectUrl,
        },
        body: '',
      };
    }

    // Otherwise, return the code directly (useful for testing)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        authorization_code: authCode,
        expires_in: 600, // 10 minutes
        state: state || undefined,
      }),
    };
  } catch (error) {
    console.error('Error in handleAuthorize:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'server_error',
        error_description: 'Internal server error'
      }),
    };
  }
}

async function handleToken(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let body: any = {};
  
  try {
    // Parse request body
    if (event.body) {
      const contentType = event.headers['Content-Type'] || event.headers['content-type'] || '';
      
      if (contentType.includes('application/x-www-form-urlencoded')) {
        // Parse form data
        const params = new URLSearchParams(event.body);
        body = Object.fromEntries(params.entries());
      } else {
        // Parse JSON
        body = JSON.parse(event.body);
      }
    }
  } catch (error) {
    console.error('Error parsing request body:', error);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'invalid_request',
        error_description: 'Invalid request body'
      }),
    };
  }

  const grantType = body.grant_type;
  let clientId = body.client_id;
  let clientSecret = body.client_secret;
  const code = body.code;

  // Extract client credentials from Authorization header if not in body
  if (!clientId || !clientSecret) {
    const authHeader = event.headers['Authorization'] || event.headers['authorization'];
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.substring(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        
        // Split only on the first colon to handle client secrets that contain colons
        const colonIndex = credentials.indexOf(':');
        if (colonIndex !== -1) {
          const headerClientId = credentials.substring(0, colonIndex);
          const headerClientSecret = credentials.substring(colonIndex + 1);
          
          clientId = clientId || headerClientId;
          clientSecret = clientSecret || headerClientSecret;
        }
      } catch (error) {
        console.error('Error parsing Authorization header:', error);
      }
    }
  }

  // Validate grant type
  if (grantType !== 'authorization_code') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported'
      }),
    };
  }

  // Validate required parameters
  if (!clientId || !clientSecret || !code) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'invalid_request',
        error_description: 'Missing required parameters'
      }),
    };
  }

  try {
    // Validate credentials
    const authSecret = await getAuthSecret();
    if (clientId !== authSecret.client_id || clientSecret !== authSecret.client_secret) {
      console.log('Invalid client credentials');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'invalid_client',
          error_description: 'Invalid client credentials'
        }),
      };
    }

    // Validate authorization code
    const authCodeData = await getAuthCode(code);
    if (!authCodeData) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Invalid authorization code'
        }),
      };
    }

    // Check if code is expired
    if (Date.now() > authCodeData.expiresAt) {
      await deleteAuthCode(code);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Authorization code expired'
        }),
      };
    }

    // Check if code was already used
    if (authCodeData.used) {
      await deleteAuthCode(code);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Authorization code already used'
        }),
      };
    }

    // Check if client_id matches
    if (authCodeData.clientId !== clientId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'invalid_grant',
          error_description: 'Authorization code was issued to a different client'
        }),
      };
    }

    // Mark code as used
    await markAuthCodeAsUsed(code);

    // Generate access token
    const accessToken = generateAccessToken();
    console.log('Generated access token for client:', clientId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      },
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
        scope: 'read write',
      }),
    };
  } catch (error) {
    console.error('Error in handleToken:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'server_error',
        error_description: 'Internal server error'
      }),
    };
  }
}

async function getAuthSecret() {
  const secretName = process.env.AUTH_SECRET_NAME!;
  
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await secretsManager.send(command);
  
  if (!response.SecretString) {
    throw new Error('Secret string is empty');
  }
  
  return JSON.parse(response.SecretString);
}

// DynamoDB helper functions
async function storeAuthCode(authCodeData: AuthCodeData): Promise<void> {
  const tableName = process.env.AUTH_CODES_TABLE_NAME!;
  
  const command = new PutCommand({
    TableName: tableName,
    Item: {
      ...authCodeData,
      // Convert expiresAt to seconds for DynamoDB TTL
      expiresAt: Math.floor(authCodeData.expiresAt / 1000),
    },
  });
  
  await docClient.send(command);
}

async function getAuthCode(authCode: string): Promise<AuthCodeData | null> {
  const tableName = process.env.AUTH_CODES_TABLE_NAME!;
  
  const command = new GetCommand({
    TableName: tableName,
    Key: { authCode },
  });
  
  const response = await docClient.send(command);
  
  if (!response.Item) {
    return null;
  }
  
  // Convert expiresAt back to milliseconds
  return {
    ...response.Item,
    expiresAt: response.Item.expiresAt * 1000,
  } as AuthCodeData;
}

async function deleteAuthCode(authCode: string): Promise<void> {
  const tableName = process.env.AUTH_CODES_TABLE_NAME!;
  
  const command = new DeleteCommand({
    TableName: tableName,
    Key: { authCode },
  });
  
  await docClient.send(command);
}

async function markAuthCodeAsUsed(authCode: string): Promise<void> {
  const tableName = process.env.AUTH_CODES_TABLE_NAME!;
  
  // Update the item to mark it as used
  const command = new PutCommand({
    TableName: tableName,
    Item: {
      authCode,
      used: true,
      usedAt: Date.now(),
      // Keep the TTL so it will still be cleaned up automatically
      expiresAt: Math.floor((Date.now() + (10 * 60 * 1000)) / 1000),
    },
  });
  
  await docClient.send(command);
}

function generateAuthCode(): string {
  return 'auth_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function generateAccessToken(): string {
  return 'token_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
