#!/bin/bash

# Generate OpenAPI Schema with Actual API Gateway URL
# This script creates a deployment-ready schema file that's not tracked in git

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_SCHEMA="$PROJECT_DIR/src/openapi/shopify-schema.yaml"
OUTPUT_SCHEMA="$PROJECT_DIR/shopify-schema-deployed.yaml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔧 Generating Deployment-Ready OpenAPI Schema${NC}"
echo ""

# Check if template exists
if [ ! -f "$TEMPLATE_SCHEMA" ]; then
    echo -e "${RED}❌ Template schema not found: $TEMPLATE_SCHEMA${NC}"
    exit 1
fi

# Get API Gateway URL from AWS CloudFormation directly
echo -e "${YELLOW}📋 Getting API Gateway URL from CloudFormation stack...${NC}"
STACK_NAME="CdkShopifyStack"
API_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text 2>/dev/null || echo "")

# If still empty, prompt user
if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo -e "${YELLOW}⚠️  Could not automatically detect API Gateway URL${NC}"
    echo -e "${BLUE}Please enter your API Gateway URL (e.g., https://abc123.execute-api.us-east-1.amazonaws.com/prod):${NC}"
    read -r API_URL
fi

# Validate URL format
if [[ ! "$API_URL" =~ ^https://.*\.execute-api\..* ]]; then
    echo -e "${RED}❌ Invalid API Gateway URL format: $API_URL${NC}"
    echo -e "${BLUE}Expected format: https://abc123.execute-api.region.amazonaws.com/prod${NC}"
    exit 1
fi

# Remove trailing slash if present
API_URL="${API_URL%/}"

echo -e "${GREEN}✅ Using API Gateway URL: $API_URL${NC}"
echo ""

# Get OAuth credentials
echo -e "${YELLOW}🔐 Getting OAuth credentials from AWS Secrets Manager...${NC}"
SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "QBusiness-shopify-plugin/auth" --query SecretString --output text 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$SECRET_JSON" ]; then
    echo -e "${RED}❌ Failed to get OAuth credentials from AWS Secrets Manager${NC}"
    echo -e "${BLUE}Make sure you have deployed the CDK stack and have proper AWS credentials${NC}"
    exit 1
fi

CLIENT_ID=$(echo "$SECRET_JSON" | jq -r '.client_id')
REDIRECT_URI=$(echo "$SECRET_JSON" | jq -r '.redirect_uri')

echo -e "${GREEN}✅ Client ID: $CLIENT_ID${NC}"
echo -e "${GREEN}✅ Redirect URI: $REDIRECT_URI${NC}"
echo ""

# Generate the updated schema
echo -e "${YELLOW}📝 Generating updated OpenAPI schema...${NC}"

# Use sed to replace the placeholder values
sed -e "s|https://api.example.com|$API_URL|g" \
    -e "s|https://your-api-gateway-url/prod/oauth/authorize|$API_URL/oauth/authorize|g" \
    -e "s|https://your-api-gateway-url/prod/oauth/token|$API_URL/oauth/token|g" \
    "$TEMPLATE_SCHEMA" > "$OUTPUT_SCHEMA"

# Verify the file was created
if [ ! -f "$OUTPUT_SCHEMA" ]; then
    echo -e "${RED}❌ Failed to create output schema file${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Schema generated successfully: $OUTPUT_SCHEMA${NC}"
echo ""

# Add to .gitignore if not already there
GITIGNORE_FILE="$PROJECT_DIR/.gitignore"
if [ -f "$GITIGNORE_FILE" ]; then
    if ! grep -q "shopify-schema-deployed.yaml" "$GITIGNORE_FILE"; then
        echo "" >> "$GITIGNORE_FILE"
        echo "# Generated deployment schema (contains actual URLs)" >> "$GITIGNORE_FILE"
        echo "shopify-schema-deployed.yaml" >> "$GITIGNORE_FILE"
        echo -e "${GREEN}✅ Added to .gitignore${NC}"
    else
        echo -e "${BLUE}ℹ️  Already in .gitignore${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No .gitignore found, creating one...${NC}"
    cat > "$GITIGNORE_FILE" << EOF
# Generated deployment schema (contains actual URLs)
shopify-schema-deployed.yaml

# CDK outputs
cdk-outputs.json

# Node modules
node_modules/

# Build outputs
lib/
*.js
*.d.ts
!jest.config.js

# Credentials
shopify-credentials.json
EOF
    echo -e "${GREEN}✅ Created .gitignore${NC}"
fi

echo ""
echo -e "${BLUE}📋 Summary:${NC}"
echo -e "${GREEN}✅ Generated deployment schema: $(basename "$OUTPUT_SCHEMA")${NC}"
echo -e "${GREEN}✅ File excluded from git tracking${NC}"
echo -e "${GREEN}✅ Ready for Amazon Q Business configuration${NC}"
echo ""
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo -e "1. Upload ${YELLOW}$(basename "$OUTPUT_SCHEMA")${NC} to Amazon Q Business plugin configuration"
echo -e "2. Use these OAuth credentials in Amazon Q Business:"
echo -e "   ${BLUE}Client ID:${NC} $CLIENT_ID"
echo -e "   ${BLUE}Authorization URL:${NC} $API_URL/oauth/authorize"
echo -e "   ${BLUE}Token URL:${NC} $API_URL/oauth/token"
echo -e "   ${BLUE}Redirect URI:${NC} $REDIRECT_URI"
echo ""
echo -e "${GREEN}🎉 Schema generation complete!${NC}"
