import { Handler } from 'aws-lambda';
import { 
  SecretsManagerClient, 
  UpdateSecretVersionStageCommand, 
  GetSecretValueCommand,
  PutSecretValueCommand 
} from '@aws-sdk/client-secrets-manager';
import { randomBytes } from 'crypto';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

interface AuthSecret {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

interface SecretsManagerRotationEvent {
  Step: 'createSecret' | 'setSecret' | 'testSecret' | 'finishSecret';
  SecretId: string;
  Token: string;
}

/**
 * Generate a secure random client secret
 */
function generateClientSecret(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const randomBytesArray = randomBytes(length);
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars[randomBytesArray[i] % chars.length];
  }
  
  return result;
}

/**
 * Lambda handler for AWS Secrets Manager automatic rotation
 */
export const handler: Handler<SecretsManagerRotationEvent> = async (event, context) => {
  const { Step, SecretId, Token } = event;
  
  console.log(`Starting rotation step: ${Step} for secret: ${SecretId}`);
  console.log(`Version token: ${Token}`);

  try {
    switch (Step) {
      case 'createSecret':
        await createSecret(SecretId, Token);
        break;
      case 'setSecret':
        await setSecret(SecretId, Token);
        break;
      case 'testSecret':
        await testSecret(SecretId, Token);
        break;
      case 'finishSecret':
        await finishSecret(SecretId, Token);
        break;
      default:
        throw new Error(`Invalid step: ${Step}`);
    }

    console.log(`Successfully completed step: ${Step}`);
    return { statusCode: 200, message: `Step ${Step} completed successfully` };

  } catch (error) {
    console.error(`Error during step ${Step}:`, error);
    
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}`);
      console.error(`Error message: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
    }

    throw error;
  }
};

/**
 * Create a new version of the secret with a new client_secret
 */
async function createSecret(secretId: string, token: string): Promise<void> {
  console.log('Step 1: createSecret - Generating new client_secret');

  try {
    // Check if the new version already exists
    await secretsClient.send(new GetSecretValueCommand({
      SecretId: secretId,
      VersionId: token,
      VersionStage: 'AWSPENDING'
    }));
    console.log('New secret version already exists, skipping creation');
    return;
  } catch (error) {
    // Expected - new version doesn't exist yet
  }

  // Get current secret value
  const currentSecret = await secretsClient.send(new GetSecretValueCommand({
    SecretId: secretId,
    VersionStage: 'AWSCURRENT'
  }));

  if (!currentSecret.SecretString) {
    throw new Error('Current secret value not found');
  }

  const currentAuthSecret: AuthSecret = JSON.parse(currentSecret.SecretString);
  console.log(`Current client_id: ${currentAuthSecret.client_id}`);

  // Generate new client_secret
  const newClientSecret = generateClientSecret(32);
  const newAuthSecret: AuthSecret = {
    ...currentAuthSecret,
    client_secret: newClientSecret
  };

  // Create new version with AWSPENDING stage
  await secretsClient.send(new PutSecretValueCommand({
    SecretId: secretId,
    SecretString: JSON.stringify(newAuthSecret),
    ClientRequestToken: token
  }));

  console.log('Created new secret version with updated client_secret');
}

/**
 * Set the secret in the service (no external service to update for OAuth credentials)
 */
async function setSecret(secretId: string, token: string): Promise<void> {
  console.log('Step 2: setSecret - No external service to update for OAuth credentials');
  // For OAuth client credentials, there's typically no external service to update
  // The secret rotation is complete once the new version is created
}

/**
 * Test the new secret version
 */
async function testSecret(secretId: string, token: string): Promise<void> {
  console.log('Step 3: testSecret - Validating new secret format');

  const pendingSecret = await secretsClient.send(new GetSecretValueCommand({
    SecretId: secretId,
    VersionId: token,
    VersionStage: 'AWSPENDING'
  }));

  if (!pendingSecret.SecretString) {
    throw new Error('Pending secret value not found');
  }

  try {
    const authSecret: AuthSecret = JSON.parse(pendingSecret.SecretString);
    
    // Validate required fields
    if (!authSecret.client_id || !authSecret.client_secret || !authSecret.redirect_uri) {
      throw new Error('Missing required fields in secret');
    }

    // Validate client_secret format (32 characters, URL-safe)
    if (authSecret.client_secret.length !== 32) {
      throw new Error('client_secret must be 32 characters long');
    }

    if (!/^[A-Za-z0-9\-_]+$/.test(authSecret.client_secret)) {
      throw new Error('client_secret contains invalid characters');
    }

    console.log('New secret version passed validation');
  } catch (error) {
    throw new Error(`Secret validation failed: ${error}`);
  }
}

/**
 * Finish the rotation by updating version stages
 */
async function finishSecret(secretId: string, token: string): Promise<void> {
  console.log('Step 4: finishSecret - Updating version stages');

  // Move the new version from AWSPENDING to AWSCURRENT
  await secretsClient.send(new UpdateSecretVersionStageCommand({
    SecretId: secretId,
    VersionStage: 'AWSCURRENT',
    MoveToVersionId: token,
    RemoveFromVersionId: undefined // This will be determined automatically
  }));

  console.log('Successfully updated version stages - rotation complete');
}
