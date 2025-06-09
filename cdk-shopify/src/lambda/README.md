# Shopify Lambda Functions

This directory contains Lambda functions for integrating with Shopify's API.

## Authentication Method

These Lambda functions use the **Admin API Access Token** authentication method, which is recommended for development stores and simplifies the authentication process.

## Configuration

The Lambda functions expect the following environment variables:

- `SHOPIFY_SHOP_NAME`: Your Shopify store's myshopify.com domain (e.g., `your-store.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN`: Your Admin API Access Token

## Lambda Functions

### shopify-handler.ts

A simple handler that provides basic Shopify operations:
- Get products
- Get orders
- Get customers
- Create product

### shopify-plugin-handler.ts

A more comprehensive handler designed for the Amazon Q Business Shopify plugin, providing:
- Product operations (get, create, update)
- Order operations (get)
- Customer operations (get)
- Inventory operations (get, update)

## Testing

You can test these functions locally using the provided test scripts:
- `test-admin-token.js`: Tests basic API connectivity
- `test-lambda-admin-token.js`: Simulates Lambda invocations with different operations

## Deployment

When deploying these functions with CDK, make sure to:
1. Set the environment variables with your Shopify credentials
2. Configure appropriate IAM permissions
3. Set reasonable timeout values (Shopify API calls may take time)

## Security Best Practices

- Store your Shopify credentials in AWS Secrets Manager or Parameter Store
- Retrieve the credentials at runtime in your Lambda function
- Use the minimum required API scopes for your access token
- **Rotate your access tokens periodically** following the [official Shopify client credential rotation guide](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials)

### ⚠️ Critical: Manual Credential Rotation Required

**IMPORTANT**: Shopify access tokens cannot be automatically rotated and must be manually updated by administrators. This is a critical security requirement.

**When to rotate**: Quarterly, when credentials may be compromised, before team member departures, or as part of security incident response.

**How to rotate**: Follow the [official Shopify 6-step rotation process](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials) to ensure zero-downtime credential rotation.

## Troubleshooting

If you encounter issues:
1. Verify your Admin API Access Token is valid
2. Check that your app has the necessary API scopes
3. Ensure your development store is accessible
4. Check Lambda logs for detailed error messages
