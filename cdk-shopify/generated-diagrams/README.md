# Shopify Integration Architecture Diagrams

This directory contains architecture diagrams for the Shopify integration with Amazon Q Business, showcasing the complete AWS infrastructure and OAuth 2.0 implementation.

## Diagram Overview

The diagrams illustrate a comprehensive serverless architecture with the following key components:

### AWS Infrastructure
1. **API Gateway**: REST API with multiple endpoints for OAuth and Shopify operations
2. **Lambda Functions**: 
   - OAuth Handler Lambda (handles /oauth/authorize and /oauth/token)
   - Token Authorizer Lambda (validates Bearer tokens)
   - Shopify Plugin Handler Lambda (processes all Shopify API operations)
3. **Secrets Manager**: Securely stores OAuth credentials and Shopify API credentials
4. **DynamoDB**: Stores OAuth authorization codes with TTL for automatic cleanup
5. **CloudWatch Logs**: Centralized logging for all Lambda functions

### External Integrations
- **Amazon Q Business**: The client application that consumes the API
- **Shopify Admin API**: External service providing e-commerce data

## Generated Diagrams

### 1. Complete Architecture (`shopify-plugin-complete-architecture.png`)
- **Purpose**: Shows the overall system architecture with all AWS services and their interactions
- **Key Features**:
  - OAuth 2.0 authorization flow (steps 1-3)
  - API request validation flow (steps 4-6)
  - Authorized request processing (steps 7-9)
  - Logging and monitoring connections
- **Direction**: Left-to-right layout for clear flow visualization

### 2. OAuth Flow Detailed Sequence (`oauth-flow-detailed-sequence.png`)
- **Purpose**: Detailed sequence diagram of the OAuth 2.0 authorization code flow
- **Key Features**:
  - Step-by-step OAuth process
  - Authorization code generation and storage in DynamoDB
  - Token exchange and validation
  - Protected resource access
- **Direction**: Top-to-bottom layout for sequence clarity

### 3. API Operations Overview (`shopify-api-operations.png`)
- **Purpose**: Shows all available API endpoints and their relationships
- **Key Features**:
  - Authentication endpoints (/oauth/authorize, /oauth/token)
  - Shopify data endpoints (products, orders, customers, inventory, locations)
  - Lambda function mappings
  - External Shopify API integration
- **Direction**: Top-to-bottom layout for operational overview

## API Endpoints

The architecture supports the following endpoint categories:

### Authentication Endpoints
- `GET/POST /oauth/authorize` - OAuth authorization endpoint
- `POST /oauth/token` - OAuth token exchange endpoint

### Shopify Data Endpoints (all require Bearer token authorization)
- `GET /products` - List products with filtering options
- `POST /products` - Create new products
- `GET /products/{id}` - Get specific product details
- `PUT /products/{id}` - Update product information
- `GET /orders` - List orders with filtering options
- `GET /orders/{id}` - Get specific order details
- `GET /customers` - List customers
- `GET /customers/{id}` - Get specific customer details
- `GET /inventory` - Get inventory levels
- `PUT /inventory/{id}` - Update inventory levels
- `GET /locations` - List store locations
- `GET /locations/{id}` - Get specific location details

## Security Features

1. **OAuth 2.0 Implementation**: Full authorization code flow with client credentials
2. **Bearer Token Authentication**: All API endpoints (except OAuth) require valid Bearer tokens
3. **AWS Secrets Manager**: Secure credential storage for both OAuth and Shopify credentials
4. **DynamoDB TTL**: Automatic cleanup of expired authorization codes
5. **API Gateway Authorizer**: Custom Lambda authorizer for token validation
6. **CloudWatch Logging**: Comprehensive logging for security monitoring

## Generating the Diagrams

The diagrams are generated using the Python `diagrams` package. To regenerate all diagrams:

1. **Prerequisites**:
   ```bash
   # Activate virtual environment
   source ../../.venv/bin/activate
   
   # Ensure required packages are installed
   pip install -r requirements.txt
   
   # Also ensure graphviz is installed on your system
   # macOS: brew install graphviz
   # Ubuntu: apt-get install graphviz
   ```

2. **Generate diagrams**:
   ```bash
   python generate_diagram.py
   ```

3. **Output**: Three PNG files will be generated in the current directory

## Files in this Directory

- `shopify-plugin-complete-architecture.png` - Complete system architecture diagram
- `oauth-flow-detailed-sequence.png` - Detailed OAuth 2.0 flow sequence
- `shopify-api-operations.png` - API operations and endpoint overview
- `generate_diagram.py` - Python script to generate all diagrams
- `requirements.txt` - Python dependencies for diagram generation
- `README.md` - This documentation file

## Legacy Diagrams

The following diagrams are from earlier versions and may not reflect the current architecture:
- `shopify-integration-architecture.png` - Original architecture diagram
- `shopify-plugin-oauth-architecture.png` - Original OAuth architecture
- `oauth-flow-detailed.png` - Original OAuth flow diagram

## Custom Icons

The diagrams use custom icons for:
- **Amazon Q Business**: `../assets/amazon-q-icon_gradient_lockup.png`
- **Shopify**: `../assets/shopify.png`

Make sure these files are present in the assets directory when regenerating diagrams.

## Architecture Notes

- **Serverless Design**: All compute is handled by AWS Lambda for cost efficiency and scalability
- **Microservices Pattern**: Separate Lambda functions for OAuth, authorization, and business logic
- **Security by Design**: Multiple layers of security including OAuth 2.0, token validation, and AWS IAM
- **Monitoring Ready**: CloudWatch integration for comprehensive observability
- **Cost Optimized**: Pay-per-use model with DynamoDB on-demand billing and Lambda execution-based pricing
