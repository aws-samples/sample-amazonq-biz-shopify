#!/usr/bin/env python3
"""
Shopify Integration Architecture Diagram Generator

This script generates architecture diagrams for the Shopify integration with Amazon Q Business.
It uses the diagrams package to create visual representations of the AWS services and their interactions.

Requirements:
- diagrams package: pip install diagrams
- graphviz: https://graphviz.org/download/

Usage:
python generate_diagram.py
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.security import SecretsManager
from diagrams.aws.network import APIGateway
from diagrams.aws.management import CloudwatchLogs
from diagrams.aws.database import DynamodbTable as DynamoDB
from diagrams.custom import Custom

# Generate the complete architecture diagram
with Diagram(
    "Amazon Q Business Shopify Plugin - Complete Architecture",
    show=False,
    direction="LR",
    filename="shopify-plugin-complete-architecture",
    outformat=["png"],
):
    # External components
    amazon_q = Custom("Amazon Q Business\nClient", "../assets/amazon-q-icon_gradient_lockup.png")
    shopify = Custom("Shopify Admin API\n(External Service)", "../assets/shopify.png")
    
    with Cluster("AWS Cloud Infrastructure"):
        # API Gateway
        api = APIGateway("API Gateway\n(REST API)\n- /oauth/authorize\n- /oauth/token\n- /products\n- /orders\n- /customers\n- /inventory\n- /locations")
        
        with Cluster("Authentication & Authorization Layer"):
            # OAuth Lambda
            oauth_lambda = Lambda("OAuth Handler\nLambda\n(/oauth/*)")
            
            # Token Authorizer Lambda
            authorizer_lambda = Lambda("Token Authorizer\nLambda\n(Bearer Token\nValidation)")
            
            # OAuth Credentials Secret
            auth_secrets = SecretsManager("OAuth Credentials\nSecret\n(client_id, client_secret,\nredirect_uri)")
            
            # DynamoDB for auth codes
            auth_codes_table = DynamoDB("OAuth Authorization\nCodes Table\n(TTL enabled)")
        
        with Cluster("Core Application Layer"):
            # Main Shopify Plugin Lambda
            main_lambda = Lambda("Shopify Plugin\nHandler Lambda\n(All API Operations)")
            
            # Shopify API Credentials
            shopify_secrets = SecretsManager("Shopify API\nCredentials Secret\n(shop_name, access_token)")
        
        with Cluster("Monitoring & Logging"):
            # CloudWatch Logs
            logs = CloudwatchLogs("CloudWatch Logs\n(All Lambda logs)")
    
    # OAuth Flow (Steps 1-3)
    amazon_q >> Edge(label="1. OAuth Authorization\nRequest", color="blue", style="bold") >> api
    api >> Edge(label="OAuth Endpoints", color="blue") >> oauth_lambda
    oauth_lambda >> Edge(label="Read OAuth\nCredentials", color="blue") >> auth_secrets
    oauth_lambda >> Edge(label="Store Auth Code\n(with TTL)", color="blue") >> auth_codes_table
    oauth_lambda >> Edge(label="2. Authorization Code\n& Access Token", color="blue", style="bold") >> api
    api >> Edge(label="3. OAuth Response", color="blue", style="bold") >> amazon_q
    
    # API Request Flow (Steps 4-7)
    amazon_q >> Edge(label="4. API Request\n(Bearer Token)", color="green", style="bold") >> api
    api >> Edge(label="5. Token Validation", color="green") >> authorizer_lambda
    authorizer_lambda >> Edge(label="Validate Token\nFormat & Credentials", color="green") >> auth_secrets
    authorizer_lambda >> Edge(label="6. Allow/Deny\nPolicy", color="green") >> api
    
    # Authorized Request Processing (Steps 7-9)
    api >> Edge(label="7. Authorized Request\n(if token valid)", color="orange", style="bold") >> main_lambda
    main_lambda >> Edge(label="8. Fetch Shopify\nCredentials", color="orange") >> shopify_secrets
    main_lambda >> Edge(label="9. Shopify API\nCalls (REST)", color="orange", style="bold") >> shopify
    
    # Logging connections
    main_lambda >> Edge(label="Application Logs", color="gray", style="dashed") >> logs
    oauth_lambda >> Edge(label="OAuth Logs", color="gray", style="dashed") >> logs
    authorizer_lambda >> Edge(label="Auth Logs", color="gray", style="dashed") >> logs

# Generate a detailed OAuth flow sequence diagram
with Diagram(
    "OAuth 2.0 Authorization Code Flow - Detailed Sequence",
    show=False,
    direction="TB",
    filename="oauth-flow-detailed-sequence",
    outformat=["png"],
):
    
    with Cluster("Client Application"):
        qbusiness = Custom("Amazon Q Business", "../assets/amazon-q-icon_gradient_lockup.png")
    
    with Cluster("Authorization Server (AWS API Gateway + Lambda)"):
        auth_endpoint = APIGateway("/oauth/authorize\nEndpoint")
        token_endpoint = APIGateway("/oauth/token\nEndpoint")
        oauth_handler = Lambda("OAuth Handler\nLambda")
        auth_secret = SecretsManager("OAuth Credentials\n(client_id, client_secret)")
        auth_codes_db = DynamoDB("Authorization Codes\nTable (DynamoDB)")
    
    with Cluster("Resource Server (AWS)"):
        api_gateway = APIGateway("Protected API\nEndpoints")
        authorizer = Lambda("Token Authorizer\nLambda")
        resource_lambda = Lambda("Shopify Plugin\nHandler Lambda")
    
    # OAuth Flow Steps with detailed sequence
    qbusiness >> Edge(label="1. Authorization Request\n(client_id, redirect_uri, state)", color="blue") >> auth_endpoint
    auth_endpoint >> oauth_handler
    oauth_handler >> auth_secret
    oauth_handler >> Edge(label="Generate & Store\nAuth Code", color="blue") >> auth_codes_db
    oauth_handler >> Edge(label="2. Authorization Code\n(via redirect or direct)", color="blue") >> qbusiness
    
    qbusiness >> Edge(label="3. Token Request\n(code, client_id, client_secret)", color="green") >> token_endpoint
    token_endpoint >> oauth_handler
    oauth_handler >> Edge(label="Validate Auth Code", color="green") >> auth_codes_db
    oauth_handler >> auth_secret
    oauth_handler >> Edge(label="4. Access Token\n(Bearer token)", color="green") >> qbusiness
    
    qbusiness >> Edge(label="5. API Request\n(Bearer token)", color="orange") >> api_gateway
    api_gateway >> authorizer
    authorizer >> auth_secret
    authorizer >> Edge(label="Allow/Deny Policy", color="orange") >> api_gateway
    api_gateway >> Edge(label="6. Protected Resource\nAccess", color="orange") >> resource_lambda

# Generate a detailed API operations diagram
with Diagram(
    "Shopify Plugin API Operations Overview",
    show=False,
    direction="TB",
    filename="shopify-api-operations",
    outformat=["png"],
):
    
    with Cluster("Amazon Q Business Integration"):
        qbusiness_client = Custom("Amazon Q Business", "../assets/amazon-q-icon_gradient_lockup.png")
    
    with Cluster("AWS API Gateway Endpoints"):
        with Cluster("Authentication Endpoints"):
            oauth_auth = APIGateway("/oauth/authorize")
            oauth_token = APIGateway("/oauth/token")
        
        with Cluster("Shopify Data Endpoints"):
            products_api = APIGateway("/products\n/products/{id}\n(GET, POST, PUT)")
            orders_api = APIGateway("/orders\n/orders/{id}\n(GET)")
            customers_api = APIGateway("/customers\n/customers/{id}\n(GET)")
            inventory_api = APIGateway("/inventory\n/inventory/{id}\n(GET, PUT)")
            locations_api = APIGateway("/locations\n/locations/{id}\n(GET)")
    
    with Cluster("AWS Lambda Functions"):
        oauth_lambda = Lambda("OAuth Handler")
        auth_lambda = Lambda("Token Authorizer")
        main_lambda = Lambda("Shopify Plugin Handler")
    
    with Cluster("External Shopify API"):
        shopify_api = Custom("Shopify Admin API\n- Products API\n- Orders API\n- Customers API\n- Inventory API\n- Locations API", "../assets/shopify.png")
    
    with Cluster("AWS Storage & Security"):
        secrets = SecretsManager("Credentials\nSecrets")
        dynamo = DynamoDB("Auth Codes\nTable")
        logs = CloudwatchLogs("CloudWatch\nLogs")
    
    # Client connections to OAuth
    qbusiness_client >> Edge(label="OAuth Flow", color="blue") >> oauth_auth
    qbusiness_client >> Edge(label="Token Exchange", color="blue") >> oauth_token
    
    # Client connections to API endpoints
    qbusiness_client >> Edge(label="Product Queries", color="green") >> products_api
    qbusiness_client >> Edge(label="Order Queries", color="green") >> orders_api
    qbusiness_client >> Edge(label="Customer Queries", color="green") >> customers_api
    qbusiness_client >> Edge(label="Inventory Management", color="green") >> inventory_api
    qbusiness_client >> Edge(label="Location Queries", color="green") >> locations_api
    
    # Lambda connections
    oauth_auth >> oauth_lambda
    oauth_token >> oauth_lambda
    products_api >> Edge(label="Authorized", color="orange") >> main_lambda
    orders_api >> Edge(label="Authorized", color="orange") >> main_lambda
    customers_api >> Edge(label="Authorized", color="orange") >> main_lambda
    inventory_api >> Edge(label="Authorized", color="orange") >> main_lambda
    locations_api >> Edge(label="Authorized", color="orange") >> main_lambda
    
    # Lambda to Shopify API
    main_lambda >> Edge(label="REST API Calls", color="red") >> shopify_api
    
    # Infrastructure connections
    oauth_lambda >> dynamo
    oauth_lambda >> secrets
    auth_lambda >> secrets
    main_lambda >> secrets
    [oauth_lambda, auth_lambda, main_lambda] >> logs

if __name__ == "__main__":
    print("Architecture diagrams generated successfully:")
    print("- shopify-plugin-complete-architecture.png")
    print("- oauth-flow-detailed-sequence.png") 
    print("- shopify-api-operations.png")
