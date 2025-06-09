import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as fs from 'fs';

export class CdkShopifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Load credentials from file for development
    let shopifyShopName = '';
    let shopifyAccessToken = '';
    
    try {
      const credentialsPath = path.join(__dirname, '../shopify-credentials.json');
      if (fs.existsSync(credentialsPath)) {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        shopifyShopName = credentials.SHOPIFY_SHOP_NAME || '';
        shopifyAccessToken = credentials.SHOPIFY_ACCESS_TOKEN || '';
        console.log(`Loaded credentials for shop: ${shopifyShopName}`);
      } else {
        console.warn('shopify-credentials.json not found. Please copy shopify-credentials.example.json to shopify-credentials.json and fill in your credentials.');
        console.warn('Using placeholder values for deployment. Update the secret in AWS Secrets Manager after deployment.');
        shopifyShopName = 'your-shop-name.myshopify.com';
        shopifyAccessToken = 'your-shopify-admin-api-access-token';
      }
    } catch (error) {
      console.warn('Could not load credentials from file:', error);
      console.warn('Using placeholder values for deployment. Update the secret in AWS Secrets Manager after deployment.');
      shopifyShopName = 'your-shop-name.myshopify.com';
      shopifyAccessToken = 'your-shopify-admin-api-access-token';
    }

    // Create a secret for Shopify credentials
    const shopifySecret = new secretsmanager.Secret(this, 'ShopifyCredential', {
      secretName: 'shopify/credential',
      description: 'Shopify API credentials for Amazon Q Business plugin',
      secretObjectValue: {
        SHOPIFY_SHOP_NAME: cdk.SecretValue.unsafePlainText(shopifyShopName),
        SHOPIFY_ACCESS_TOKEN: cdk.SecretValue.unsafePlainText(shopifyAccessToken),
      },
    });

    // Create a secret for API authentication credentials (OAuth2 format for Amazon Q Business)
    const authSecret = new secretsmanager.Secret(this, 'ApiAuthCredentials', {
      secretName: 'QBusiness-shopify-plugin/auth',
      description: 'OAuth2 credentials for Shopify Plugin API - Amazon Q Business format',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ 
          client_id: 'QBusiness-shopify-plugin',
          redirect_uri: 'https://oauth.example.com/callback'
        }),
        generateStringKey: 'client_secret',
        excludeCharacters: '"@/\\\'',
        passwordLength: 32,
      },
    });

    // Create DynamoDB table for OAuth authorization codes
    const authCodesTable = new dynamodb.Table(this, 'OAuthAuthorizationCodes', {
      tableName: 'shopify-plugin-oauth-codes',
      partitionKey: {
        name: 'authCode',
        type: dynamodb.AttributeType.STRING,
      },
      // TTL attribute for automatic cleanup of expired codes
      timeToLiveAttribute: 'expiresAt',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change to RETAIN for production
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false, // Enable for production if needed
      },
    });

    // Create custom IAM policy for Shopify Lambda function
    const shopifyLambdaPolicy = new iam.ManagedPolicy(this, 'ShopifyLambdaPolicy', {
      managedPolicyName: 'ShopifyPluginLambdaExecutionPolicy',
      description: 'Custom policy for Shopify Plugin Lambda function with minimal required permissions',
      statements: [
        // CloudWatch Logs permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/CdkShopifyStack-ShopifyPluginLambdaFunction*`
          ]
        }),
        // Secrets Manager permissions - specific to shopify secret only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue'
          ],
          resources: [shopifySecret.secretArn]
        })
      ]
    });

    // Create custom IAM role for Shopify Lambda function
    const shopifyLambdaRole = new iam.Role(this, 'ShopifyLambdaRole', {
      roleName: 'ShopifyPluginLambdaExecutionRole',
      description: 'Custom execution role for Shopify Plugin Lambda function',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [shopifyLambdaPolicy]
    });

    // Create the Shopify Lambda function using NodejsFunction to properly bundle dependencies
    const shopifyLambda = new nodejs.NodejsFunction(this, 'ShopifyPluginLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/shopify-plugin-handler.ts'),
      handler: 'handler',
      role: shopifyLambdaRole,
      environment: {
        // Remove hardcoded values - Lambda should read from Secrets Manager
        SHOPIFY_SECRET_ARN: shopifySecret.secretArn,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      bundling: {
        externalModules: [],
        nodeModules: ['shopify-api-node', 'aws-sdk'],
        minify: false,
        sourceMap: true,
      },
    });

    // Create custom IAM policy for API Authorizer Lambda function
    const authorizerLambdaPolicy = new iam.ManagedPolicy(this, 'AuthorizerLambdaPolicy', {
      managedPolicyName: 'ApiAuthorizerLambdaExecutionPolicy',
      description: 'Custom policy for API Authorizer Lambda function with minimal required permissions',
      statements: [
        // CloudWatch Logs permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/CdkShopifyStack-ApiAuthorizerFunction*`
          ]
        }),
        // Secrets Manager permissions - specific to auth secret only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue'
          ],
          resources: [authSecret.secretArn]
        })
      ]
    });

    // Create custom IAM role for API Authorizer Lambda function
    const authorizerLambdaRole = new iam.Role(this, 'AuthorizerLambdaRole', {
      roleName: 'ApiAuthorizerLambdaExecutionRole',
      description: 'Custom execution role for API Authorizer Lambda function',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [authorizerLambdaPolicy]
    });

    // Create the Lambda authorizer function
    const authorizerLambda = new nodejs.NodejsFunction(this, 'ApiAuthorizerFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/auth/authorizer.ts'),
      handler: 'handler',
      role: authorizerLambdaRole,
      environment: {
        AUTH_SECRET_NAME: authSecret.secretName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: {
        externalModules: [],
        nodeModules: ['@aws-sdk/client-secrets-manager'],
        minify: false,
        sourceMap: true,
      },
    });

    // Create the API Gateway authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'ApiAuthorizer', {
      handler: authorizerLambda,
      identitySource: 'method.request.header.Authorization',
      authorizerName: 'ShopifyPluginAuthorizer',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Create IAM role for API Gateway CloudWatch logging
    const apiGatewayCloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchLogsRole', {
      roleName: `ApiGatewayCloudWatchLogsRole-${this.region}`,
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
      ]
    });

    // Set the CloudWatch Logs role for API Gateway at account level
    new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn
    });

    // Create CloudWatch Log Group for API Gateway access logs
    const apiLogGroup = new logs.LogGroup(this, 'ApiGatewayAccessLogs', {
      logGroupName: '/aws/apigateway/shopify-plugin-api',
      retention: logs.RetentionDays.ONE_WEEK, // Adjust retention as needed
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - change to RETAIN for production
    });

    // Create an API Gateway REST API with enhanced security
    const api = new apigateway.RestApi(this, 'ShopifyPluginApi', {
      restApiName: 'Shopify Plugin API',
      description: 'API for Amazon Q Business Shopify plugin',
      deployOptions: {
        stageName: 'prod',
        // Enable access logging
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        // Enable CloudWatch logging for all methods
        methodOptions: {
          '/*/*': {
            dataTraceEnabled: true,
            loggingLevel: apigateway.MethodLoggingLevel.INFO,
            metricsEnabled: true,
          }
        }
      },
      // Enable CORS
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      }
    });

    // Create request validator for API Gateway
    const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
      restApi: api,
      validateRequestBody: true,
      validateRequestParameters: true,
      requestValidatorName: 'ShopifyPluginRequestValidator',
    });

    // Create custom IAM policy for OAuth Lambda function
    const oauthLambdaPolicy = new iam.ManagedPolicy(this, 'OAuthLambdaPolicy', {
      managedPolicyName: 'OAuthLambdaExecutionPolicy',
      description: 'Custom policy for OAuth Lambda function with minimal required permissions',
      statements: [
        // CloudWatch Logs permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/CdkShopifyStack-OAuthLambdaFunction*`
          ]
        }),
        // Secrets Manager permissions - specific to auth secret only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue'
          ],
          resources: [authSecret.secretArn]
        }),
        // DynamoDB permissions - specific to OAuth codes table only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:DeleteItem',
            'dynamodb:UpdateItem',
            'dynamodb:Query',
            'dynamodb:Scan'
          ],
          resources: [authCodesTable.tableArn]
        })
      ]
    });

    // Create custom IAM role for OAuth Lambda function
    const oauthLambdaRole = new iam.Role(this, 'OAuthLambdaRole', {
      roleName: 'OAuthLambdaExecutionRole',
      description: 'Custom execution role for OAuth Lambda function',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [oauthLambdaPolicy]
    });

    // Create OAuth Lambda function
    const oauthLambda = new nodejs.NodejsFunction(this, 'OAuthLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/auth/oauth.ts'),
      handler: 'handler',
      role: oauthLambdaRole,
      environment: {
        AUTH_SECRET_NAME: authSecret.secretName,
        AUTH_CODES_TABLE_NAME: authCodesTable.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      bundling: {
        externalModules: [],
        nodeModules: ['@aws-sdk/client-secrets-manager', '@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
        minify: false,
        sourceMap: true,
      },
    });

    // Create custom IAM policy for Secret Rotation Lambda function
    const secretRotationLambdaPolicy = new iam.ManagedPolicy(this, 'SecretRotationLambdaPolicy', {
      managedPolicyName: 'SecretRotationLambdaExecutionPolicy',
      description: 'Custom policy for Secret Rotation Lambda function with minimal required permissions',
      statements: [
        // CloudWatch Logs permissions
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents'
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/CdkShopifyStack-SecretRotationLambdaFunction*`
          ]
        }),
        // Secrets Manager permissions for rotation - comprehensive permissions needed
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
            'secretsmanager:PutSecretValue',
            'secretsmanager:UpdateSecretVersionStage'
          ],
          resources: [authSecret.secretArn]
        })
      ]
    });

    // Create custom IAM role for Secret Rotation Lambda function
    const secretRotationLambdaRole = new iam.Role(this, 'SecretRotationLambdaRole', {
      roleName: 'SecretRotationLambdaExecutionRole',
      description: 'Custom execution role for Secret Rotation Lambda function',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [secretRotationLambdaPolicy]
    });

    // Create Secret Rotation Lambda function
    const secretRotationLambda = new nodejs.NodejsFunction(this, 'SecretRotationLambdaFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda/auth/secret-rotation.ts'),
      handler: 'handler',
      role: secretRotationLambdaRole,
      environment: {
        AUTH_SECRET_NAME: authSecret.secretName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: [],
        nodeModules: ['@aws-sdk/client-secrets-manager'],
        minify: false,
        sourceMap: true,
      },
    });

    // Configure automatic rotation using AWS Secrets Manager's built-in scheduler
    const rotationSchedule = new secretsmanager.RotationSchedule(this, 'AuthSecretRotationSchedule', {
      secret: authSecret,
      rotationLambda: secretRotationLambda,
      automaticallyAfter: cdk.Duration.days(90), // Rotate every 90 days
    });

    // Create API resources and methods
    const productsResource = api.root.addResource('products');
    const productResource = productsResource.addResource('{productId}');
    const ordersResource = api.root.addResource('orders');
    const orderResource = ordersResource.addResource('{orderId}');
    const customersResource = api.root.addResource('customers');
    const customerResource = customersResource.addResource('{customerId}');
    const inventoryResource = api.root.addResource('inventory');
    const inventoryItemResource = inventoryResource.addResource('{inventoryItemId}');
    const locationsResource = api.root.addResource('locations');
    const locationResource = locationsResource.addResource('{locationId}');

    // Create OAuth endpoints
    const oauthResource = api.root.addResource('oauth');
    const authorizeResource = oauthResource.addResource('authorize');
    const tokenResource = oauthResource.addResource('token');

    // Add methods to resources with authorization
    const lambdaIntegration = new apigateway.LambdaIntegration(shopifyLambda);
    const oauthIntegration = new apigateway.LambdaIntegration(oauthLambda);

    // OAuth endpoints (these don't need authorization since they handle auth)
    authorizeResource.addMethod('GET', oauthIntegration);
    authorizeResource.addMethod('POST', oauthIntegration);
    tokenResource.addMethod('POST', oauthIntegration);

    // Products endpoints
    productsResource.addMethod('GET', lambdaIntegration, { authorizer });  // getProducts
    productsResource.addMethod('POST', lambdaIntegration, { authorizer }); // createProduct
    productResource.addMethod('GET', lambdaIntegration, { authorizer });   // getProductById
    productResource.addMethod('PUT', lambdaIntegration, { authorizer });   // updateProduct

    // Orders endpoints
    ordersResource.addMethod('GET', lambdaIntegration, { authorizer });    // getOrders
    orderResource.addMethod('GET', lambdaIntegration, { authorizer });     // getOrderById

    // Customers endpoints
    customersResource.addMethod('GET', lambdaIntegration, { authorizer });  // getCustomers
    customerResource.addMethod('GET', lambdaIntegration, { authorizer });   // getCustomerById

    // Inventory endpoints
    inventoryResource.addMethod('GET', lambdaIntegration, { authorizer });  // getInventoryLevels
    inventoryItemResource.addMethod('PUT', lambdaIntegration, { authorizer }); // updateInventoryLevel
    
    // Locations endpoints
    locationsResource.addMethod('GET', lambdaIntegration, { authorizer });    // getLocations
    locationResource.addMethod('GET', lambdaIntegration, { authorizer });     // getLocationById

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'URL of the Shopify Plugin API',
    });

    // Output the Lambda function ARN
    new cdk.CfnOutput(this, 'ShopifyLambdaArn', {
      value: shopifyLambda.functionArn,
      description: 'The ARN of the Shopify Lambda function',
    });

    // Output the auth secret ARN for retrieving credentials
    new cdk.CfnOutput(this, 'AuthSecretArn', {
      value: authSecret.secretArn,
      description: 'ARN of the secret containing API authentication credentials',
    });

    // Output the auth secret name for easy reference
    new cdk.CfnOutput(this, 'AuthSecretName', {
      value: authSecret.secretName,
      description: 'Name of the secret containing API authentication credentials',
    });

    // Output the DynamoDB table name
    new cdk.CfnOutput(this, 'AuthCodesTableName', {
      value: authCodesTable.tableName,
      description: 'Name of the DynamoDB table storing OAuth authorization codes',
    });

    // Output the secret rotation Lambda function ARN
    new cdk.CfnOutput(this, 'SecretRotationLambdaArn', {
      value: secretRotationLambda.functionArn,
      description: 'ARN of the Lambda function that rotates the client_secret every 90 days',
    });

  }
}
