import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Initialize Secrets Manager client
const secretsManager = new SecretsManagerClient({ region: process.env.AWS_REGION });

interface AuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

// Cache for auth secret to reduce Secrets Manager calls
let cachedSecret: AuthCredentials | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
  context: Context
): Promise<APIGatewayAuthorizerResult> => {
  try {
    // Get the Authorization header from the request
    const authToken = event.authorizationToken;
    
    if (!authToken || !authToken.startsWith('Bearer ')) {
      throw new Error('Unauthorized');
    }
    
    const token = authToken.substring(7); // Remove 'Bearer ' prefix
    
    // Validate the Bearer token format
    if (!token.startsWith('token_') || token.length < 15) {
      throw new Error('Unauthorized');
    }
    
    // Get the secret (with caching)
    const secret = await getSecret();
    
    // Generate allow policy with wildcard resource
    const methodArn = event.methodArn;
    const resourceParts = methodArn.split('/');
    const baseResource = resourceParts.slice(0, 2).join('/');
    const wildcardResource = `${baseResource}/*`;
    
    return generatePolicy(secret.client_id, 'Allow', wildcardResource);
    
  } catch (error) {
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

async function getSecret(): Promise<AuthCredentials> {
  // Check cache first
  if (cachedSecret && Date.now() < cacheExpiry) {
    return cachedSecret;
  }
  
  const secretName = process.env.AUTH_SECRET_NAME;
  if (!secretName) {
    throw new Error('Configuration error');
  }
  
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManager.send(command);
    
    if (response.SecretString) {
      cachedSecret = JSON.parse(response.SecretString) as AuthCredentials;
    } else if (response.SecretBinary) {
      const binaryData = Buffer.from(response.SecretBinary);
      cachedSecret = JSON.parse(binaryData.toString('utf-8')) as AuthCredentials;
    } else {
      throw new Error('Secret value not found');
    }
    
    // Set cache expiry
    cacheExpiry = Date.now() + CACHE_TTL;
    
    return cachedSecret;
  } catch (error) {
    throw error;
  }
}

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context: {
      username: principalId,
      authTime: new Date().toISOString(),
    },
  };
}
