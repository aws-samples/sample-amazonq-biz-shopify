# Complete Setup Guide

This guide walks you through setting up the Amazon Q Business Shopify Integration Plugin from start to finish.

## Prerequisites

Before you begin, ensure you have:

- **AWS Account**: With permissions to create Lambda functions, API Gateway, DynamoDB, Secrets Manager, and CloudWatch resources
- **Shopify Store**: Either a live store or development store with admin access
- **Amazon Q Business**: Admin access to configure plugins
- **Development Environment**:
  - Node.js 18.x or later
  - AWS CLI configured with your credentials
  - Git

## Part 1: Development Environment Setup

### 1.1 Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd sample-amazonq-biz-shopify

# Navigate to the CDK directory
cd cdk-shopify

# Install dependencies
npm install

# Install AWS CDK globally if you haven't already
npm install -g aws-cdk
```

### 1.2 Verify AWS Configuration

```bash
# Check AWS configuration
aws sts get-caller-identity

# Bootstrap CDK if this is your first time using CDK in this account/region
npx cdk bootstrap
```

## Part 2: Shopify Store Configuration

### 2.1 Create a Shopify Custom App

Follow these steps to create API credentials for your Shopify store:

1. **Access Your Shopify Admin**
   - Log in to your Shopify admin dashboard
   - Go to **Settings** → **Apps and sales channels**

2. **Enable Custom App Development**
   - Click **"Develop apps for your store"**
   - If prompted, click **"Allow custom app development"**

3. **Create a New Custom App**
   - Click **"Create an app"**
   - Enter app name: `Amazon Q Business Integration`
   - Click **"Create app"**

### 2.2 Configure API Permissions

1. **Configure Admin API Access**
   - In your new app, click **"Configure Admin API scopes"**
   - Enable the following permissions:
     - `read_products` - Read product information
     - `write_products` - Create and update products
     - `read_orders` - Read order information
     - `read_customers` - Read customer information
     - `read_inventory` - Read inventory levels
     - `write_inventory` - Update inventory levels
     - `read_locations` - Read store locations

2. **Save Configuration**
   - Click **"Save"** to apply the permissions

### 2.3 Install and Generate Credentials

1. **Install the App**
   - Click **"Install app"** to install it to your store
   - Review and confirm the permissions

2. **Generate Access Token**
   - After installation, you'll see the **"Admin API access token"**
   - Copy this token (it will only be shown once)
   - Also note your **shop domain** (e.g., `your-shop.myshopify.com`)

### 2.4 Configure Local Credentials

```bash
# Create credentials file from template
cp shopify-credentials.example.json shopify-credentials.json

# Edit the file with your actual credentials
# Use your preferred text editor
nano shopify-credentials.json
```

Update the file with your actual values:
```json
{
  "SHOPIFY_SHOP_NAME": "your-actual-shop.myshopify.com",
  "SHOPIFY_ACCESS_TOKEN": "shpat_your-actual-access-token"
}
```

## Part 3: AWS Infrastructure Deployment

### 3.1 Build and Deploy

```bash
# Build the TypeScript code
npm run build

# Deploy the CDK stack
npx cdk deploy

# Confirm deployment when prompted
```

The deployment will create:
- API Gateway with OAuth and Shopify endpoints
- Three Lambda functions (OAuth handler, authorizer, main handler)
- DynamoDB table for OAuth codes
- Secrets Manager secrets for credentials
- CloudWatch log groups

### 3.2 Note Deployment Outputs

After successful deployment, save these important values:
- **ApiUrl**: Your API Gateway endpoint URL
- **AuthSecretName**: Name of the authentication secret
- **AuthSecretArn**: ARN of the authentication secret

Example output:
```
Outputs:
CdkShopifyStack.ApiUrl = https://abcd1234.execute-api.us-east-1.amazonaws.com/prod/
CdkShopifyStack.AuthSecretName = QBusiness-shopify-plugin/auth
CdkShopifyStack.AuthSecretArn = arn:aws:secretsmanager:us-east-1:123456789:secret:QBusiness-shopify-plugin/auth-AbCdEf
```

### 3.3 Retrieve Authentication Credentials

After deployment, retrieve the OAuth credentials from AWS Secrets Manager:

```bash
# Get the secret ARN from deployment outputs, then retrieve the secret
aws secretsmanager get-secret-value --secret-id "QBusiness-shopify-plugin/auth" --query SecretString --output text | jq '.'
```

This will output something like:
```json
{
  "client_id": "QBusiness-shopify-plugin",
  "client_secret": "generated-secret-value",
  "redirect_uri": "https://oauth.example.com/callback"
}
```

**Save these credentials** - you'll need them for Amazon Q Business configuration.

## Part 4: Testing Your Deployment

### 4.1 Test API Authentication

```bash
# Test OAuth endpoints
npm run test:auth https://your-api-url/prod
```

Expected output:
```
✓ OAuth authorize endpoint accessible
✓ OAuth token endpoint accessible
✓ Authentication flow working
```

### 4.2 Test Shopify Integration

```bash
# Test API endpoints
npm run test:api https://your-api-url/prod
```

Expected output:
```
✓ Products endpoint working
✓ Orders endpoint working
✓ Customers endpoint working
✓ Shopify integration successful
```

## Part 5: Amazon Q Business Plugin Configuration

### 5.1 Access Amazon Q Business Admin

1. Log in to the AWS Console
2. Navigate to Amazon Q Business
3. Go to your Q Business application
4. Navigate to **Plugins** section

### 5.2 Create Custom Plugin

1. **Create New Plugin**
   - Click **"Add plugin"**
   - Select **"Custom plugin"**
   - Enter plugin name: `Shopify Integration`

2. **Upload OpenAPI Schema**
   - Upload the file: `cdk-shopify/src/openapi/shopify-schema.yaml`
   - Or copy the schema content directly

3. **Configure Base URL**
   - Enter your API Gateway URL from deployment outputs
   - Example: `https://abcd1234.execute-api.us-east-1.amazonaws.com/prod`

### 5.3 Configure Authentication

1. **Authentication Type**: Select **OAuth 2.0**

2. **OAuth Configuration**:
   - **Authorization URL**: `{your-api-url}/oauth/authorize`
   - **Token URL**: `{your-api-url}/oauth/token`
   - **Client ID**: From your authentication credentials
   - **Client Secret**: From your authentication credentials
   - **Scopes**: `read write`

3. **Test Authentication**
   - Use the test function to verify the OAuth flow
   - Ensure you can obtain an access token

### 5.4 Activate Plugin

1. **Test Plugin Operations**
   - Test a few operations like "Get Products"
   - Verify responses are returning Shopify data

2. **Activate Plugin**
   - Once testing is successful, activate the plugin
   - It will now be available to all Q Business users

## Part 6: User Training and Testing

### 6.1 Example Queries for Testing

Share these example queries with your team:

**Product Queries:**
- "Show me our top 5 products"
- "How many t-shirts do we have in stock?"
- "Create a new product called 'Summer Hat' priced at $29.99"

**Order Queries:**
- "Show me orders from the last week"
- "How many unfulfilled orders do we have?"
- "What's our total sales this month?"

**Customer Queries:**
- "Who are our top customers by spending?"
- "Show me customer details for john@example.com"

**Inventory Queries:**
- "Which products are low on inventory?"
- "Update stock for 'Blue T-Shirt' to 50 units"

### 6.2 Monitor Usage

- Check CloudWatch Logs for API usage
- Monitor Lambda function metrics
- Review Q Business conversation logs

## Troubleshooting

### Common Issues and Solutions

**Issue: CDK Deployment Fails**
- Solution: Check AWS credentials and permissions
- Verify CDK is bootstrapped: `npx cdk bootstrap`

**Issue: Shopify API Authentication Fails**
- Solution: Verify credentials in `shopify-credentials.json`
- Ensure the custom app is installed in your Shopify store
- Check that all required API scopes are enabled

**Issue: Amazon Q Business Can't Connect**
- Solution: Verify API Gateway URL is correct
- Test OAuth flow manually with the test scripts
- Ensure authentication credentials are properly configured

**Issue: Some Operations Don't Work**
- Solution: Check CloudWatch Logs for specific error messages
- Verify Shopify API permissions for the failing operations
- Ensure the OpenAPI schema matches the implementation

### Getting Additional Help

1. **Check CloudWatch Logs**:
   - Navigate to CloudWatch in AWS Console
   - Look for log groups starting with `/aws/lambda/CdkShopifyStack`

2. **Use Test Scripts**:
   - Run `npm run test:auth` and `npm run test:api` to isolate issues

3. **Verify Shopify Store**:
   - Test API calls directly in Shopify admin
   - Ensure your store has sample data for testing

## Next Steps

After successful setup:

1. **Create User Documentation**: Document common queries for your team
2. **Set Up Monitoring**: Configure CloudWatch alarms for error rates
3. **Plan Maintenance**: Schedule regular credential rotation
4. **Explore Advanced Features**: Consider adding more Shopify operations
5. **Scale Usage**: Monitor costs and optimize based on usage patterns

## Security Best Practices

- **Manually rotate Shopify access tokens** (see Manual Credential Rotation section below)
- Monitor API usage for unusual patterns
- Keep AWS credentials secure and rotate regularly
- Review CloudWatch Logs for security events
- Implement cost monitoring and budgets

## ⚠️ Manual Credential Rotation

### Critical Security Notice: Shopify Credentials

**The Shopify access tokens MUST be rotated manually** as they cannot be automatically rotated like other AWS secrets. This is a critical security requirement that must be performed by administrators.

### When to Rotate Shopify Credentials

- **Quarterly**: As part of regular security maintenance
- **Immediately**: If credentials are suspected to be compromised
- **Before team member departures**: When personnel with access leave
- **After security incidents**: As part of incident response procedures

### How to Rotate Shopify Credentials

**⚠️ Important**: Follow the official Shopify client credential rotation process to avoid downtime. For complete details, see the official documentation: [Shopify Client Credential Rotation Guide](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials)

**Official Shopify 6-Step Rotation Process:**
1. **Create a new client secret** in Partner Dashboard
2. **Configure webhooks** to accept both old and new secrets temporarily
3. **Configure OAuth** to use the new client secret
4. **Generate a new refresh token** from Partner Dashboard
5. **Request new access tokens** using the refresh token
6. **Revoke the old client secret** once all tokens are updated

**For this AWS integration specifically:**

1. **Generate New Shopify Access Token**:
   - Log in to your Shopify admin dashboard
   - Go to **Settings** → **Apps and sales channels**
   - Find your **Amazon Q Business Integration** app
   - Click **"App settings"**
   - Follow the [official 6-step rotation process](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials)
   - **Important**: Copy the new token immediately (it will only be shown once)

2. **Update AWS Secrets Manager**:
   ```bash
   # Update the Shopify credentials in AWS Secrets Manager
   aws secretsmanager update-secret \
     --secret-id "shopify/credential" \
     --secret-string '{"SHOPIFY_SHOP_NAME":"your-shop.myshopify.com","SHOPIFY_ACCESS_TOKEN":"your-new-access-token"}'
   ```

3. **Verify the Update**:
   ```bash
   # Confirm the secret was updated successfully
   aws secretsmanager get-secret-value \
     --secret-id "shopify/credential" \
     --query SecretString --output text | jq '.'
   ```

4. **Test Integration After Rotation**:
   ```bash
   # Test API endpoints with new credentials
   npm run test:api https://your-api-url/prod
   ```

**📖 Full Documentation**: Always refer to the [official Shopify documentation](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials) for the complete rotation procedure to ensure zero-downtime rotation.

### Setting Up Rotation Reminders

Consider setting up calendar reminders or AWS CloudWatch Events to ensure regular credential rotation:

```bash
# Example: Create a CloudWatch Event to remind you quarterly
aws events put-rule \
  --name "shopify-credential-rotation-reminder" \
  --schedule-expression "rate(90 days)" \
  --description "Reminder to rotate Shopify credentials"
```

### Security Monitoring

After credential rotation, monitor for:
- Successful API calls in CloudWatch Logs
- No authentication errors in the plugin
- Normal operation of Amazon Q Business integration

## Maintenance Schedule

**Monthly:**
- Review CloudWatch metrics and costs
- Check for AWS service updates
- Verify plugin is working correctly
- Monitor for unusual API usage patterns

**Quarterly:**
- **🔑 MANUALLY rotate Shopify access tokens** (Critical Security Task - Cannot be automated)
- Review and update API permissions in Shopify
- Update Node.js dependencies and redeploy if needed
- Review and optimize CloudWatch Log retention settings

**Annually:**
- Review overall architecture for optimizations
- Update documentation based on usage patterns
- Consider new Shopify API features for integration
- Conduct security audit of all components
- Review and update disaster recovery procedures
