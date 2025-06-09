# CDK Shopify Plugin Infrastructure

This directory contains the AWS CDK infrastructure code for the Amazon Q Business Shopify Integration Plugin.

## Directory Structure

```
cdk-shopify/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
├── src/                    # Source code
│   ├── lambda/            # Lambda function code
│   │   ├── auth/          # Authentication authorizer
│   │   └── shopify-plugin-handler.ts
│   └── openapi/           # OpenAPI schema
├── scripts/               # Utility scripts
├── tests/                 # Test files and test events
├── docs/                  # Additional documentation
├── assets/                # Images and other assets
└── generated-diagrams/    # Generated architecture diagrams
```

## Prerequisites

- AWS CLI configured with appropriate permissions
- Node.js 18.x or later
- AWS CDK CLI installed globally: `npm install -g aws-cdk`
- Shopify store with Admin API access

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Shopify credentials:**
   ```bash
   cp shopify-credentials.example.json shopify-credentials.json
   # Edit shopify-credentials.json with your actual Shopify credentials
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Deploy the infrastructure:**
   ```bash
   npx cdk deploy
   ```

## Available Scripts

- `npm run build` - Compile TypeScript code
- `npm run watch` - Watch for changes and recompile
- `npm run test` - Run Jest tests
- `npm run cdk` - Run CDK commands

## Configuration

### Shopify Credentials

Create `shopify-credentials.json` from the example file and fill in your Shopify store details:

```json
{
  "SHOPIFY_SHOP_NAME": "your-shop-name.myshopify.com",
  "SHOPIFY_ACCESS_TOKEN": "your-shopify-admin-api-access-token"
}
```

### Authentication

The API uses OAuth2-compatible credentials stored in AWS Secrets Manager. After deployment, retrieve your credentials using the AWS CLI:

```bash
aws secretsmanager get-secret-value --secret-id "QBusiness-shopify-plugin/auth" --query SecretString --output text | jq '.'
```

## Security

- Shopify credentials are stored securely in AWS Secrets Manager
- API endpoints require authentication via Lambda authorizer
- All sensitive files are excluded from version control

### Automatic Secret Rotation

The system automatically rotates the OAuth2 `client_secret` in `QBusiness-shopify-plugin/auth` every 90 days using AWS Secrets Manager's built-in rotation scheduler. This provides:

- **Zero-downtime rotation** with automatic version management
- **Built-in retry logic** and error handling
- **Version rollback capability** if issues occur
- **Compliance** with security best practices

**Manual rotation trigger:**
```bash
aws secretsmanager rotate-secret --secret-id QBusiness-shopify-plugin/auth
```

For detailed information, see [SECRET_ROTATION.md](docs/SECRET_ROTATION.md).

### Shopify Credentials Management

⚠️ **IMPORTANT**: Unlike the OAuth2 client_secret which rotates automatically, **Shopify credentials require manual updates** and should be rotated periodically as a security best practice.

**Recommended Update Schedule:**
- **Shopify Access Token**: Every 90-180 days or when team members leave
- **When to update**: Security incidents, staff changes, or compliance requirements
- **Process**: Manual update in AWS Secrets Manager (not automatic)

**To update Shopify credentials:**

**⚠️ Important**: Follow the official Shopify client credential rotation process to avoid downtime. For complete details, see: [Shopify Client Credential Rotation Guide](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials)

**For this AWS integration specifically:**

1. **Generate new credentials in Shopify Admin:**
   - Go to your Shopify Admin → Apps → Develop apps
   - Follow the [official 6-step rotation process](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials)
   - Copy the new Admin API access token immediately (shown only once)

2. **Update AWS Secrets Manager:**
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "shopify/credential" \
     --secret-string '{
       "SHOPIFY_SHOP_NAME": "your-shop-name.myshopify.com",
       "SHOPIFY_ACCESS_TOKEN": "your-new-access-token"
     }'
   ```

3. **Verify the update:**
   ```bash
   aws secretsmanager get-secret-value \
     --secret-id "shopify/credential" \
     --query SecretString --output text | jq '.'
   ```

4. **Test API functionality** to ensure the new credentials work properly.

**📖 Full Documentation**: Always refer to the [official Shopify documentation](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials) for the complete rotation procedure to ensure zero-downtime rotation.

**Security Best Practices:**
- 🔄 **Rotate Shopify credentials every 90-180 days**
- 🔒 **Never commit credentials to version control**
- 📝 **Document credential updates with timestamps**
- 🚨 **Immediately rotate if credentials are compromised**
- 👥 **Update when team members with access leave**
- 📊 **Monitor API calls for unusual activity**

> **Note**: The automatic rotation only applies to the OAuth2 client_secret used for API authentication. Shopify store credentials (shop name and access token) must be manually managed and updated in AWS Secrets Manager when needed.

## Deployment Outputs

After deployment, note these important outputs:
- **ApiUrl**: Your API Gateway endpoint URL
- **AuthSecretArn**: ARN of the authentication secret
- **AuthSecretName**: Name of the authentication secret for easy reference

## Troubleshooting

1. **Missing credentials**: Ensure `shopify-credentials.json` exists and contains valid credentials
2. **Authentication errors**: Use `npm run get:auth` to retrieve current credentials
3. **API errors**: Check CloudWatch Logs for Lambda function errors
4. **CDK deployment issues**: Ensure AWS CLI is configured with sufficient permissions

For more detailed information, see the main project README.
