import Shopify from 'shopify-api-node';
import * as AWS from 'aws-sdk';

export interface ShopifyConfig {
  shopName: string;
  accessToken: string;
}

export const handler = async (event: any): Promise<any> => {
  try {
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    // Get Shopify credentials from environment variables
    let shopifyConfig: ShopifyConfig = {
      shopName: process.env.SHOPIFY_SHOP_NAME || '',
      accessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
    };
    
    console.log('Initial config from env vars:', {
      shopName: shopifyConfig.shopName,
      accessTokenPresent: shopifyConfig.accessToken ? 'Yes (token hidden)' : 'No'
    });
    
    // If credentials are not in environment variables, try to get them from AWS Secrets Manager
    if ((!shopifyConfig.shopName || !shopifyConfig.accessToken) && process.env.SHOPIFY_SECRET_ARN) {
      try {
        console.log('Attempting to retrieve credentials from Secrets Manager');
        const secretsManager = new AWS.SecretsManager();
        const secretData = await secretsManager.getSecretValue({ SecretId: process.env.SHOPIFY_SECRET_ARN }).promise();
        
        if (secretData.SecretString) {
          console.log('Secret retrieved successfully');
          const secret = JSON.parse(secretData.SecretString);
          shopifyConfig = {
            shopName: secret.SHOPIFY_SHOP_NAME || shopifyConfig.shopName,
            accessToken: secret.SHOPIFY_ACCESS_TOKEN || shopifyConfig.accessToken,
          };
          console.log('Updated config from secrets:', {
            shopName: shopifyConfig.shopName,
            accessTokenPresent: shopifyConfig.accessToken ? 'Yes (token hidden)' : 'No'
          });
        } else {
          console.warn('Secret retrieved but no SecretString found');
        }
      } catch (secretError) {
        console.error('Error retrieving secret:', secretError);
      }
    }
    
    // Validate credentials
    if (!shopifyConfig.shopName || !shopifyConfig.accessToken) {
      console.error('Missing required Shopify credentials');
      throw new Error('Missing required Shopify credentials. Please set SHOPIFY_SHOP_NAME and SHOPIFY_ACCESS_TOKEN environment variables or configure a secret.');
    }
    
    console.log(`Initializing Shopify client for shop: ${shopifyConfig.shopName}`);
    
    // Initialize Shopify client with Admin API Access Token
    const shopify = new Shopify({
      shopName: shopifyConfig.shopName,
      accessToken: shopifyConfig.accessToken,
      autoLimit: true
    });
    
    // Extract operation from the event
    const { operation, parameters } = extractOperationAndParameters(event);
    console.log(`Operation: ${operation}`, 'Parameters:', parameters);
    
    // Process the operation
    let result;
    console.log(`Executing operation: ${operation}`);
    
    switch (operation) {
      case 'getProducts':
        result = await getProducts(shopify, parameters);
        break;
      case 'getProductById':
        result = await getProductById(shopify, parameters);
        break;
      case 'createProduct':
        result = await createProduct(shopify, parameters);
        break;
      case 'updateProduct':
        result = await updateProduct(shopify, parameters);
        break;
      case 'getOrders':
        result = await getOrders(shopify, parameters);
        break;
      case 'getOrderById':
        result = await getOrderById(shopify, parameters);
        break;
      case 'getCustomers':
        result = await getCustomers(shopify, parameters);
        break;
      case 'getCustomerById':
        result = await getCustomerById(shopify, parameters);
        break;
      case 'getInventoryLevels':
        result = await getInventoryLevels(shopify, parameters);
        break;
      case 'updateInventoryLevel':
        result = await updateInventoryLevel(shopify, parameters);
        break;
      case 'getLocations':
        result = await getLocations(shopify, parameters);
        break;
      case 'getLocationById':
        result = await getLocationById(shopify, parameters);
        break;
      default:
        console.error(`Unsupported operation: ${operation}`);
        throw new Error(`Unsupported operation: ${operation}`);
    }
    
    console.log(`Operation ${operation} completed successfully`);
    
    // For large responses, log a summary instead of the full result
    if (result && typeof result === 'object') {
      if (Array.isArray(result)) {
        console.log(`Result: Array with ${result.length} items`);
      } else if ('products' in result && Array.isArray(result.products)) {
        console.log(`Result: ${result.products.length} products returned`);
      } else if ('orders' in result && Array.isArray(result.orders)) {
        console.log(`Result: ${result.orders.length} orders returned`);
      } else if ('customers' in result && Array.isArray(result.customers)) {
        console.log(`Result: ${result.customers.length} customers returned`);
      } else {
        console.log('Result: Object returned successfully');
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error: any) {
    console.error('Error:', error);
    console.error('Stack trace:', error.stack);
    
    // Provide more detailed error information for specific error types
    let errorMessage = error.message;
    let errorDetails = null;
    
    if (error.response && error.response.body) {
      console.error('Shopify API error response:', error.response.body);
      errorDetails = error.response.body;
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error executing Shopify operation',
        error: errorMessage,
        details: errorDetails
      })
    };
  }
};

// Helper function to extract operation and parameters from the event
function extractOperationAndParameters(event: any): { operation: string; parameters: any } {
  console.log('Extracting operation and parameters from event');
  
  // If the event comes directly from API Gateway
  if (event.httpMethod && event.path) {
    console.log(`API Gateway event detected: ${event.httpMethod} ${event.path}`);
    
    // Map path and method to operation
    const path = event.path || '';
    const method = event.httpMethod || 'GET';
    
    // Extract operation based on path and method
    if (path === '/products' && method === 'GET') {
      return {
        operation: 'getProducts',
        parameters: event.queryStringParameters || {}
      };
    } else if (path.match(/^\/products\/[^\/]+$/) && method === 'GET') {
      // Extract product ID from path
      const productId = path.split('/').pop();
      return {
        operation: 'getProductById',
        parameters: { 
          productId,
          ...event.queryStringParameters 
        }
      };
    } else if (path === '/orders' && method === 'GET') {
      return {
        operation: 'getOrders',
        parameters: event.queryStringParameters || {}
      };
    } else if (path.match(/^\/orders\/[^\/]+$/) && method === 'GET') {
      // Extract order ID from path
      const orderId = path.split('/').pop();
      return {
        operation: 'getOrderById',
        parameters: { 
          orderId,
          ...event.queryStringParameters 
        }
      };
    } else if (path === '/customers' && method === 'GET') {
      console.log('Detected getCustomers operation from API Gateway');
      return {
        operation: 'getCustomers',
        parameters: event.queryStringParameters || {}
      };
    } else if (path.match(/^\/customers\/[^\/]+$/) && method === 'GET') {
      // Extract customer ID from path
      const customerId = path.split('/').pop();
      return {
        operation: 'getCustomerById',
        parameters: { 
          customerId,
          ...event.queryStringParameters 
        }
      };
    } else if (path === '/inventory' && method === 'GET') {
      return {
        operation: 'getInventoryLevels',
        parameters: event.queryStringParameters || {}
      };
    } else if (path.match(/^\/inventory\/[^\/]+$/) && method === 'PUT') {
      // Extract inventory item ID from path
      const inventoryItemId = path.split('/').pop();
      // For PUT requests, parameters might be in the body
      const bodyParams = event.body ? JSON.parse(event.body) : {};
      return {
        operation: 'updateInventoryLevel',
        parameters: { 
          inventoryItemId,
          ...bodyParams,
          ...event.queryStringParameters 
        }
      };
    } else if (path === '/locations' && method === 'GET') {
      return {
        operation: 'getLocations',
        parameters: event.queryStringParameters || {}
      };
    } else if (path.match(/^\/locations\/[^\/]+$/) && method === 'GET') {
      // Extract location ID from path
      const locationId = path.split('/').pop();
      return {
        operation: 'getLocationById',
        parameters: { 
          locationId,
          ...event.queryStringParameters 
        }
      };
    } else if (path === '/products' && method === 'POST') {
      // Create product
      const bodyParams = event.body ? JSON.parse(event.body) : {};
      return {
        operation: 'createProduct',
        parameters: bodyParams
      };
    } else if (path.match(/^\/products\/[^\/]+$/) && method === 'PUT') {
      // Update product
      const productId = path.split('/').pop();
      const bodyParams = event.body ? JSON.parse(event.body) : {};
      return {
        operation: 'updateProduct',
        parameters: {
          productId,
          ...bodyParams
        }
      };
    }
    
    // If no specific mapping is found, try to infer operation from path
    const pathParts = path.split('/').filter((p: string) => p);
    if (pathParts.length > 0) {
      const resource = pathParts[0];
      if (resource === 'products') {
        return {
          operation: method === 'POST' ? 'createProduct' : 'getProducts',
          parameters: method === 'POST' ? 
            (event.body ? JSON.parse(event.body) : {}) : 
            (event.queryStringParameters || {})
        };
      } else if (resource === 'orders') {
        return {
          operation: 'getOrders',
          parameters: event.queryStringParameters || {}
        };
      } else if (resource === 'customers') {
        return {
          operation: 'getCustomers',
          parameters: event.queryStringParameters || {}
        };
      } else if (resource === 'inventory') {
        return {
          operation: 'getInventoryLevels',
          parameters: event.queryStringParameters || {}
        };
      } else if (resource === 'locations') {
        return {
          operation: 'getLocations',
          parameters: event.queryStringParameters || {}
        };
      }
    }
    
    console.log('Could not determine operation from API Gateway event, using default');
  }
  
  // If the event comes from Amazon Q Business
  if (event.operation) {
    console.log('Event contains operation field, likely from Amazon Q Business');
    return {
      operation: event.operation,
      parameters: event.parameters || {}
    };
  }
  
  // Default fallback
  console.log('Using default fallback for operation extraction');
  return {
    operation: event.operation || 'getProducts',
    parameters: event.parameters || event.queryStringParameters || {}
  };
}

// Operation implementations
async function getProducts(shopify: any, parameters: any) {
  console.log('getProducts called with parameters:', parameters);
  
  const { limit = 5, collection, productType, vendor, status } = parameters;
  
  // Parse limit as integer and ensure it's a valid number
  const parsedLimit = parseInt(limit);
  const validLimit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
  
  const query: any = { limit: validLimit };
  
  if (collection) {
    console.log(`Filtering by collection: ${collection}`);
    // In a real implementation, you might need to first get the collection ID
    // and then filter products by that collection
  }
  
  if (productType) {
    console.log(`Filtering by product type: ${productType}`);
    query.product_type = productType;
  }
  
  if (vendor) {
    console.log(`Filtering by vendor: ${vendor}`);
    query.vendor = vendor;
  }
  
  if (status) {
    console.log(`Filtering by status: ${status}`);
    query.status = status;
  }
  
  console.log('Executing Shopify API call with query:', query);
  const products = await shopify.product.list(query);
  console.log(`Retrieved ${products.length} products from Shopify`);
  
  // Transform to match the schema
  return {
    products: products.map((p: any) => ({
      id: p.id.toString(),
      title: p.title,
      description: p.body_html,
      productType: p.product_type,
      vendor: p.vendor,
      price: p.variants[0]?.price || 0,
      compareAtPrice: p.variants[0]?.compare_at_price || null,
      tags: p.tags,
      status: p.status,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      inventoryQuantity: p.variants[0]?.inventory_quantity || 0,
      imageUrl: p.images[0]?.src || ''
    })),
    count: products.length
  };
}

async function getProductById(shopify: any, parameters: any) {
  const { productId } = parameters;
  console.log(`getProductById called for product ID: ${productId}`);
  
  if (!productId) {
    console.error('Product ID is required but was not provided');
    throw new Error('Product ID is required');
  }
  
  console.log(`Fetching product with ID: ${productId}`);
  const product = await shopify.product.get(productId);
  console.log(`Retrieved product: ${product.title} (ID: ${product.id})`);
  
  return {
    id: product.id.toString(),
    title: product.title,
    description: product.body_html,
    productType: product.product_type,
    vendor: product.vendor,
    price: product.variants[0]?.price || 0,
    compareAtPrice: product.variants[0]?.compare_at_price || null,
    tags: product.tags,
    status: product.status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    inventoryQuantity: product.variants[0]?.inventory_quantity || 0,
    imageUrl: product.images[0]?.src || ''
  };
}

async function createProduct(shopify: any, parameters: any) {
  console.log('createProduct called with parameters:', parameters);
  
  const { title, description, productType, vendor, price, compareAtPrice, tags, status, inventoryQuantity, imageUrl } = parameters;
  
  if (!title || !price) {
    console.error('Title and price are required but one or both were not provided');
    throw new Error('Title and price are required');
  }
  
  const productData: any = {
    title,
    body_html: description,
    product_type: productType,
    vendor,
    status: status || 'active',
    tags
  };
  
  // Add variant with price
  productData.variants = [{
    price: parseFloat(price).toString(),
    compare_at_price: compareAtPrice ? parseFloat(compareAtPrice).toString() : null,
    inventory_management: 'shopify',
    inventory_quantity: inventoryQuantity ? parseInt(inventoryQuantity) : 0
  }];
  
  // Add image if provided
  if (imageUrl) {
    console.log(`Adding product image with URL: ${imageUrl}`);
    productData.images = [{
      src: imageUrl,
      position: 1 // Make it the main image
    }];
  }
  
  console.log('Creating product with data:', JSON.stringify(productData, null, 2));
  const product = await shopify.product.create(productData);
  console.log(`Product created successfully with ID: ${product.id}`);
  
  // If inventory quantity is specified, ensure it's set correctly using inventory API
  if (inventoryQuantity && product.variants && product.variants.length > 0) {
    const variantId = product.variants[0].id;
    const inventoryItemId = product.variants[0].inventory_item_id;
    
    if (inventoryItemId) {
      try {
        // Get the location ID (use the first available location)
        const locations = await shopify.location.list({ limit: 1 });
        if (locations && locations.length > 0) {
          const locationId = locations[0].id;
          
          // Set inventory level
          console.log(`Setting initial inventory for item ${inventoryItemId} at location ${locationId} to ${inventoryQuantity} units`);
          
          // Connect inventory item to location
          await shopify.inventoryLevel.connect({
            inventory_item_id: inventoryItemId,
            location_id: locationId
          });
          
          // Set inventory level
          await shopify.inventoryLevel.set({
            inventory_item_id: inventoryItemId,
            location_id: locationId,
            available: parseInt(inventoryQuantity)
          });
          console.log(`Initial inventory level set successfully to ${inventoryQuantity}`);
        }
      } catch (error) {
        console.error('Error setting initial inventory level:', error);
      }
    }
  }
  
  return {
    id: product.id.toString(),
    title: product.title,
    description: product.body_html,
    productType: product.product_type,
    vendor: product.vendor,
    price: product.variants[0]?.price || 0,
    compareAtPrice: product.variants[0]?.compare_at_price || null,
    tags: product.tags,
    status: product.status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    inventoryQuantity: product.variants[0]?.inventory_quantity || 0,
    imageUrl: product.images[0]?.src || ''
  };
}

async function updateProduct(shopify: any, parameters: any) {
  console.log('updateProduct called with parameters:', parameters);
  
  const { productId, title, description, productType, vendor, price, compareAtPrice, tags, status, inventoryQuantity, imageUrl } = parameters;
  
  if (!productId) {
    console.error('Product ID is required but was not provided');
    throw new Error('Product ID is required');
  }
  
  const productData: any = {};
  
  if (title !== undefined) productData.title = title;
  if (description !== undefined) productData.body_html = description;
  if (productType !== undefined) productData.product_type = productType;
  if (vendor !== undefined) productData.vendor = vendor;
  if (status !== undefined) productData.status = status;
  if (tags !== undefined) productData.tags = tags;
  
  // Handle image URL update
  if (imageUrl !== undefined) {
    console.log(`Updating product image with URL: ${imageUrl}`);
    productData.images = [{
      src: imageUrl,
      position: 1 // Make it the main image
    }];
  }
  
  console.log(`Updating product ${productId} with data:`, JSON.stringify(productData, null, 2));
  
  // If price or inventory is being updated, we need to update the variant
  if (price !== undefined || compareAtPrice !== undefined || inventoryQuantity !== undefined) {
    console.log('Price or inventory updates detected, fetching variant information');
    // Get the product first to get the variant ID
    const existingProduct = await shopify.product.get(productId);
    const variantId = existingProduct.variants[0]?.id;
    
    if (variantId) {
      const variantData: any = {};
      
      if (price !== undefined) {
        // Ensure price is treated as a decimal/float
        variantData.price = parseFloat(price).toString();
      }
      
      if (compareAtPrice !== undefined) {
        // Ensure compareAtPrice is treated as a decimal/float
        variantData.compare_at_price = parseFloat(compareAtPrice).toString();
      }
      
      if (inventoryQuantity !== undefined) {
        // For inventory updates, we need to use the inventory_item_id
        const inventoryItemId = existingProduct.variants[0].inventory_item_id;
        
        if (inventoryItemId) {
          // Get the location ID (use the first available location)
          const locations = await shopify.location.list({ limit: 1 });
          if (locations && locations.length > 0) {
            const locationId = locations[0].id;
            
            // Update inventory level directly
            console.log(`Updating inventory for item ${inventoryItemId} at location ${locationId} to ${inventoryQuantity} units`);
            
            try {
              // Check if inventory level exists
              const inventoryLevels = await shopify.inventoryLevel.list({
                inventory_item_ids: inventoryItemId,
                location_ids: locationId
              });
              
              if (inventoryLevels.length > 0) {
                // Update existing inventory level
                await shopify.inventoryLevel.set({
                  inventory_item_id: inventoryItemId,
                  location_id: locationId,
                  available: parseInt(inventoryQuantity)
                });
                console.log(`Inventory level updated successfully to ${inventoryQuantity}`);
              } else {
                // Connect and set inventory level
                await shopify.inventoryLevel.connect({
                  inventory_item_id: inventoryItemId,
                  location_id: locationId
                });
                
                await shopify.inventoryLevel.set({
                  inventory_item_id: inventoryItemId,
                  location_id: locationId,
                  available: parseInt(inventoryQuantity)
                });
                console.log(`Inventory level set successfully to ${inventoryQuantity}`);
              }
            } catch (error) {
              console.error('Error updating inventory level:', error);
            }
          }
        }
        
        // Also update the variant's inventory_quantity for consistency
        variantData.inventory_quantity = parseInt(inventoryQuantity);
      }
      
      if (Object.keys(variantData).length > 0) {
        console.log(`Updating variant ${variantId} with data:`, JSON.stringify(variantData, null, 2));
        await shopify.productVariant.update(variantId, variantData);
        console.log(`Variant ${variantId} updated successfully`);
      }
    } else {
      console.warn('No variant found for product, skipping variant update');
    }
  }
  
  // Only call product update if there are product-level changes
  let product;
  if (Object.keys(productData).length > 0) {
    product = await shopify.product.update(productId, productData);
    console.log(`Product ${productId} updated successfully`);
  } else {
    // If we're only updating variant data, get the product to return
    product = await shopify.product.get(productId);
    console.log(`Product ${productId} updated successfully`);
  }
  console.log(`Product ${productId} updated successfully`);
  
  return {
    id: product.id.toString(),
    title: product.title,
    description: product.body_html,
    productType: product.product_type,
    vendor: product.vendor,
    price: product.variants[0]?.price || 0,
    compareAtPrice: product.variants[0]?.compare_at_price || null,
    tags: product.tags,
    status: product.status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    inventoryQuantity: product.variants[0]?.inventory_quantity || 0,
    imageUrl: product.images[0]?.src || ''
  };
}

async function getOrders(shopify: any, parameters: any) {
  console.log('getOrders called with parameters:', parameters);
  
  const { 
    limit = 5, 
    status, 
    financialStatus, 
    createdAtMin, 
    createdAtMax,
    processedAtMin,
    processedAtMax,
    updatedAtMin,
    updatedAtMax,
    sinceId,
    fields,
    customer,
    email,
    tag
  } = parameters;
  
  // Parse limit as integer and ensure it's a valid number
  const parsedLimit = parseInt(limit);
  const validLimit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
  
  const query: any = { limit: validLimit };
  
  if (status && status !== 'any') {
    console.log(`Filtering by fulfillment status: ${status}`);
    query.fulfillment_status = status;
  }
  
  if (financialStatus && financialStatus !== 'any') {
    console.log(`Filtering by financial status: ${financialStatus}`);
    query.financial_status = financialStatus;
  }
  
  if (createdAtMin) {
    console.log(`Filtering by created at min: ${createdAtMin}`);
    query.created_at_min = createdAtMin;
  }
  
  if (createdAtMax) {
    console.log(`Filtering by created at max: ${createdAtMax}`);
    query.created_at_max = createdAtMax;
  }
  
  if (processedAtMin) {
    console.log(`Filtering by processed at min: ${processedAtMin}`);
    query.processed_at_min = processedAtMin;
  }
  
  if (processedAtMax) {
    console.log(`Filtering by processed at max: ${processedAtMax}`);
    query.processed_at_max = processedAtMax;
  }
  
  if (updatedAtMin) {
    console.log(`Filtering by updated at min: ${updatedAtMin}`);
    query.updated_at_min = updatedAtMin;
  }
  
  if (updatedAtMax) {
    console.log(`Filtering by updated at max: ${updatedAtMax}`);
    query.updated_at_max = updatedAtMax;
  }
  
  if (sinceId) {
    console.log(`Filtering by since ID: ${sinceId}`);
    query.since_id = sinceId;
  }
  
  if (fields) {
    console.log(`Requesting specific fields: ${fields}`);
    query.fields = fields;
  }
  
  if (customer) {
    console.log(`Filtering by customer: ${customer}`);
    // This might need to be adjusted based on how Shopify API expects customer filtering
    query.customer = customer;
  }
  
  if (email) {
    console.log(`Filtering by email: ${email}`);
    query.email = email;
  }
  
  if (tag) {
    console.log(`Filtering by tag: ${tag}`);
    query.tag = tag;
  }
  
  console.log('Executing Shopify API call with query:', query);
  const orders = await shopify.order.list(query);
  console.log(`Retrieved ${orders.length} orders from Shopify`);
  
  // Transform to match the schema with enhanced information
  return {
    orders: orders.map((o: any) => ({
      id: o.id.toString(),
      orderNumber: o.name,
      email: o.email,
      phone: o.phone,
      financialStatus: o.financial_status,
      fulfillmentStatus: o.fulfillment_status || 'unfulfilled',
      totalPrice: parseFloat(o.total_price),
      subtotalPrice: parseFloat(o.subtotal_price),
      totalTax: parseFloat(o.total_tax),
      totalShipping: parseFloat(o.total_shipping_price_set?.shop_money?.amount || 0),
      totalDiscounts: parseFloat(o.total_discounts || 0),
      currency: o.currency || 'USD',
      processedAt: o.processed_at,
      cancelledAt: o.cancelled_at,
      cancelReason: o.cancel_reason,
      tags: o.tags ? o.tags.split(',').map((tag: string) => tag.trim()) : [],
      note: o.note,
      customer: o.customer ? {
        id: o.customer.id.toString(),
        firstName: o.customer.first_name,
        lastName: o.customer.last_name,
        email: o.customer.email,
        phone: o.customer.phone,
        ordersCount: o.customer.orders_count,
        totalSpent: parseFloat(o.customer.total_spent || 0)
      } : null,
      billingAddress: o.billing_address ? {
        name: o.billing_address.name,
        address1: o.billing_address.address1,
        address2: o.billing_address.address2,
        city: o.billing_address.city,
        province: o.billing_address.province,
        provinceCode: o.billing_address.province_code,
        country: o.billing_address.country,
        countryCode: o.billing_address.country_code,
        zip: o.billing_address.zip,
        phone: o.billing_address.phone
      } : null,
      shippingAddress: o.shipping_address ? {
        name: o.shipping_address.name,
        address1: o.shipping_address.address1,
        address2: o.shipping_address.address2,
        city: o.shipping_address.city,
        province: o.shipping_address.province,
        provinceCode: o.shipping_address.province_code,
        country: o.shipping_address.country,
        countryCode: o.shipping_address.country_code,
        zip: o.shipping_address.zip,
        phone: o.shipping_address.phone
      } : null,
      lineItems: o.line_items.map((item: any) => ({
        id: item.id.toString(),
        title: item.title,
        variantId: item.variant_id ? item.variant_id.toString() : null,
        productId: item.product_id ? item.product_id.toString() : null,
        sku: item.sku || '',
        quantity: item.quantity,
        price: parseFloat(item.price),
        totalPrice: parseFloat(item.price) * item.quantity,
        taxable: item.taxable,
        fulfillmentStatus: item.fulfillment_status || 'unfulfilled',
        vendor: item.vendor,
        properties: item.properties || [],
        requiresShipping: item.requires_shipping
      })),
      fulfillments: o.fulfillments ? o.fulfillments.map((f: any) => ({
        id: f.id.toString(),
        status: f.status,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        trackingCompany: f.tracking_company,
        trackingNumber: f.tracking_number,
        trackingUrl: f.tracking_url
      })) : [],
      refunds: o.refunds ? o.refunds.map((r: any) => ({
        id: r.id.toString(),
        createdAt: r.created_at,
        note: r.note,
        amount: parseFloat(r.transactions[0]?.amount || 0),
        refundLineItems: r.refund_line_items ? r.refund_line_items.map((rli: any) => ({
          id: rli.id.toString(),
          lineItemId: rli.line_item_id.toString(),
          quantity: rli.quantity,
          amount: parseFloat(rli.subtotal)
        })) : []
      })) : [],
      transactions: o.transactions ? o.transactions.map((t: any) => ({
        id: t.id.toString(),
        amount: parseFloat(t.amount),
        kind: t.kind,
        status: t.status,
        createdAt: t.created_at,
        gateway: t.gateway,
        paymentDetails: t.payment_details ? {
          creditCardNumber: t.payment_details.credit_card_number,
          creditCardCompany: t.payment_details.credit_card_company
        } : null
      })) : [],
      discountCodes: o.discount_codes || [],
      shippingLines: o.shipping_lines ? o.shipping_lines.map((sl: any) => ({
        id: sl.id.toString(),
        title: sl.title,
        price: parseFloat(sl.price),
        code: sl.code,
        source: sl.source
      })) : [],
      createdAt: o.created_at,
      updatedAt: o.updated_at
    })),
    count: orders.length,
    summary: {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price), 0),
      averageOrderValue: orders.length > 0 
        ? orders.reduce((sum: number, o: any) => sum + parseFloat(o.total_price), 0) / orders.length 
        : 0,
      fulfillmentStatuses: orders.reduce((acc: any, o: any) => {
        const status = o.fulfillment_status || 'unfulfilled';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}),
      financialStatuses: orders.reduce((acc: any, o: any) => {
        const status = o.financial_status;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {})
    }
  };
}

async function getOrderById(shopify: any, parameters: any) {
  const { orderId } = parameters;
  console.log(`getOrderById called for order ID: ${orderId}`);
  
  if (!orderId) {
    console.error('Order ID is required but was not provided');
    throw new Error('Order ID is required');
  }
  
  console.log(`Fetching order with ID: ${orderId}`);
  const order = await shopify.order.get(orderId);
  console.log(`Retrieved order: ${order.name} (ID: ${order.id})`);
  
  return {
    id: order.id.toString(),
    orderNumber: order.name,
    email: order.email,
    phone: order.phone,
    financialStatus: order.financial_status,
    fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
    totalPrice: parseFloat(order.total_price),
    subtotalPrice: parseFloat(order.subtotal_price),
    totalTax: parseFloat(order.total_tax),
    totalShipping: parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0),
    totalDiscounts: parseFloat(order.total_discounts || 0),
    currency: order.currency || 'USD',
    processedAt: order.processed_at,
    cancelledAt: order.cancelled_at,
    cancelReason: order.cancel_reason,
    tags: order.tags ? order.tags.split(',').map((tag: string) => tag.trim()) : [],
    note: order.note,
    customer: order.customer ? {
      id: order.customer.id.toString(),
      firstName: order.customer.first_name,
      lastName: order.customer.last_name,
      email: order.customer.email,
      phone: order.customer.phone,
      ordersCount: order.customer.orders_count,
      totalSpent: parseFloat(order.customer.total_spent || 0)
    } : null,
    billingAddress: order.billing_address ? {
      name: order.billing_address.name,
      address1: order.billing_address.address1,
      address2: order.billing_address.address2,
      city: order.billing_address.city,
      province: order.billing_address.province,
      provinceCode: order.billing_address.province_code,
      country: order.billing_address.country,
      countryCode: order.billing_address.country_code,
      zip: order.billing_address.zip,
      phone: order.billing_address.phone
    } : null,
    shippingAddress: order.shipping_address ? {
      name: order.shipping_address.name,
      address1: order.shipping_address.address1,
      address2: order.shipping_address.address2,
      city: order.shipping_address.city,
      province: order.shipping_address.province,
      provinceCode: order.shipping_address.province_code,
      country: order.shipping_address.country,
      countryCode: order.shipping_address.country_code,
      zip: order.shipping_address.zip,
      phone: order.shipping_address.phone
    } : null,
    lineItems: order.line_items.map((item: any) => ({
      id: item.id.toString(),
      title: item.title,
      variantId: item.variant_id ? item.variant_id.toString() : null,
      productId: item.product_id ? item.product_id.toString() : null,
      sku: item.sku || '',
      quantity: item.quantity,
      price: parseFloat(item.price),
      totalPrice: parseFloat(item.price) * item.quantity,
      taxable: item.taxable,
      fulfillmentStatus: item.fulfillment_status || 'unfulfilled',
      vendor: item.vendor,
      properties: item.properties || [],
      requiresShipping: item.requires_shipping
    })),
    fulfillments: order.fulfillments ? order.fulfillments.map((f: any) => ({
      id: f.id.toString(),
      status: f.status,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
      trackingCompany: f.tracking_company,
      trackingNumber: f.tracking_number,
      trackingUrl: f.tracking_url
    })) : [],
    refunds: order.refunds ? order.refunds.map((r: any) => ({
      id: r.id.toString(),
      createdAt: r.created_at,
      note: r.note,
      amount: parseFloat(r.transactions[0]?.amount || 0),
      refundLineItems: r.refund_line_items ? r.refund_line_items.map((rli: any) => ({
        id: rli.id.toString(),
        lineItemId: rli.line_item_id.toString(),
        quantity: rli.quantity,
        amount: parseFloat(rli.subtotal)
      })) : []
    })) : [],
    transactions: order.transactions ? order.transactions.map((t: any) => ({
      id: t.id.toString(),
      amount: parseFloat(t.amount),
      kind: t.kind,
      status: t.status,
      createdAt: t.created_at,
      gateway: t.gateway,
      paymentDetails: t.payment_details ? {
        creditCardNumber: t.payment_details.credit_card_number,
        creditCardCompany: t.payment_details.credit_card_company
      } : null
    })) : [],
    discountCodes: order.discount_codes || [],
    shippingLines: order.shipping_lines ? order.shipping_lines.map((sl: any) => ({
      id: sl.id.toString(),
      title: sl.title,
      price: parseFloat(sl.price),
      code: sl.code,
      source: sl.source
    })) : [],
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
}

async function getCustomers(shopify: any, parameters: any) {
  console.log('getCustomers called with parameters:', parameters);
  
  const { limit = 5, email, phone, ordersCountMin } = parameters;
  
  // Parse limit as integer and ensure it's a valid number
  const parsedLimit = parseInt(limit);
  const validLimit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
  
  const query: any = { limit: validLimit };
  
  if (email) {
    console.log(`Filtering by email: ${email}`);
    query.email = email;
  }
  
  if (phone) {
    console.log(`Filtering by phone: ${phone}`);
    query.phone = phone;
  }
  
  if (ordersCountMin) {
    console.log(`Filtering by orders count min: ${ordersCountMin}`);
    query.orders_count_min = parseInt(ordersCountMin);
  }
  
  console.log('Executing Shopify API call with query:', query);
  const customers = await shopify.customer.list(query);
  console.log(`Retrieved ${customers.length} customers from Shopify`);
  
  // Transform to match the schema
  return {
    customers: customers.map((c: any) => ({
      id: c.id.toString(),
      firstName: c.first_name,
      lastName: c.last_name,
      email: c.email,
      phone: c.phone,
      ordersCount: c.orders_count,
      totalSpent: parseFloat(c.total_spent),
      addresses: c.addresses.map((addr: any) => ({
        address1: addr.address1,
        address2: addr.address2,
        city: addr.city,
        province: addr.province,
        country: addr.country,
        zip: addr.zip,
        default: addr.default
      })),
      createdAt: c.created_at,
      updatedAt: c.updated_at
    })),
    count: customers.length
  };
}

async function getCustomerById(shopify: any, parameters: any) {
  const { customerId } = parameters;
  console.log(`getCustomerById called for customer ID: ${customerId}`);
  
  if (!customerId) {
    console.error('Customer ID is required but was not provided');
    throw new Error('Customer ID is required');
  }
  
  console.log(`Fetching customer with ID: ${customerId}`);
  const customer = await shopify.customer.get(customerId);
  console.log(`Retrieved customer: ${customer.first_name} ${customer.last_name} (ID: ${customer.id})`);
  
  return {
    id: customer.id.toString(),
    firstName: customer.first_name,
    lastName: customer.last_name,
    email: customer.email,
    phone: customer.phone,
    ordersCount: customer.orders_count,
    totalSpent: parseFloat(customer.total_spent),
    addresses: customer.addresses.map((addr: any) => ({
      address1: addr.address1,
      address2: addr.address2,
      city: addr.city,
      province: addr.province,
      country: addr.country,
      zip: addr.zip,
      default: addr.default
    })),
    createdAt: customer.created_at,
    updatedAt: customer.updated_at
  };
}

async function getInventoryLevels(shopify: any, parameters: any) {
  console.log('getInventoryLevels called with parameters:', parameters);
  
  let { limit = 5, locationId, productId } = parameters;
  
  // Parse limit as integer and ensure it's a valid number
  const parsedLimit = parseInt(limit);
  const validLimit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
  
  console.log('This is a simplified implementation of inventory levels');
  // This is a simplified implementation
  // In a real implementation, you would need to:
  // 1. Get inventory items (possibly filtered by product ID)
  // 2. Get inventory levels for those items (possibly filtered by location ID)
  
  // If no locationId is provided, get the default location
  if (!locationId) {
    try {
      console.log('No location ID provided, fetching default location');
      const locations = await shopify.location.list({ limit: 1 });
      if (locations && locations.length > 0) {
        locationId = locations[0].id.toString();
        console.log(`Using default location ID: ${locationId}`);
      } else {
        console.warn('No locations found in the store');
        throw new Error('No locations found in the store. Please create at least one location in your Shopify admin.');
      }
    } catch (error) {
      console.error('Error fetching default location:', error);
      throw new Error('Could not determine a default location for inventory. Please specify a valid locationId parameter.');
    }
  } else {
    // Verify the location exists
    try {
      console.log(`Verifying location ID: ${locationId}`);
      await shopify.location.get(locationId);
      console.log(`Location ${locationId} verified successfully`);
    } catch (error) {
      console.error(`Location ${locationId} not found:`, error);
      throw new Error(`Invalid location ID: ${locationId}. Please provide a valid location ID.`);
    }
  }
  
  let inventoryItems: any[] = [];
  
  if (productId) {
    console.log(`Fetching inventory for specific product ID: ${productId}`);
    // Get the product to find its inventory item ID
    const product = await shopify.product.get(productId);
    const variantIds = product.variants.map((v: any) => v.id);
    console.log(`Product has ${variantIds.length} variants`);
    
    // Get inventory items for these variants
    for (const variantId of variantIds) {
      console.log(`Fetching variant ${variantId}`);
      const variant = await shopify.productVariant.get(variantId);
      if (variant.inventory_item_id) {
        console.log(`Found inventory item ID: ${variant.inventory_item_id} for variant ${variantId}`);
        
        // If we have a locationId, get the specific inventory level
        let available = variant.inventory_quantity;
        if (locationId) {
          try {
            const inventoryLevels = await shopify.inventoryLevel.list({
              inventory_item_ids: variant.inventory_item_id,
              location_ids: locationId
            });
            if (inventoryLevels && inventoryLevels.length > 0) {
              available = inventoryLevels[0].available;
            }
          } catch (error) {
            console.error(`Error fetching inventory level for item ${variant.inventory_item_id} at location ${locationId}:`, error);
          }
        }
        
        inventoryItems.push({
          id: variant.inventory_item_id.toString(),
          productId: product.id.toString(),
          productTitle: product.title,
          sku: variant.sku,
          locationId: locationId || 'unknown',
          available: available,
          updatedAt: new Date().toISOString()
        });
      }
    }
  } else {
    console.log('Fetching inventory for all products (limited)');
    // Get all products (limited)
    const products = await shopify.product.list({ limit: validLimit });
    console.log(`Retrieved ${products.length} products to check inventory`);
    
    for (const product of products) {
      console.log(`Checking inventory for product: ${product.title} (ID: ${product.id})`);
      for (const variant of product.variants) {
        if (variant.inventory_item_id) {
          console.log(`Found inventory item ID: ${variant.inventory_item_id} for variant ${variant.id}`);
          
          // If we have a locationId, get the specific inventory level
          let available = variant.inventory_quantity;
          if (locationId) {
            try {
              const inventoryLevels = await shopify.inventoryLevel.list({
                inventory_item_ids: variant.inventory_item_id,
                location_ids: locationId
              });
              if (inventoryLevels && inventoryLevels.length > 0) {
                available = inventoryLevels[0].available;
              }
            } catch (error) {
              console.error(`Error fetching inventory level for item ${variant.inventory_item_id} at location ${locationId}:`, error);
            }
          }
          
          inventoryItems.push({
            id: variant.inventory_item_id.toString(),
            productId: product.id.toString(),
            productTitle: product.title,
            sku: variant.sku,
            locationId: locationId || 'unknown',
            available: available,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
  }
  
  // Limit the results
  inventoryItems = inventoryItems.slice(0, validLimit);
  console.log(`Returning ${inventoryItems.length} inventory items`);
  
  return {
    inventoryItems,
    count: inventoryItems.length,
    locationId: locationId // Always include the locationId used in the response
  };
}

async function updateInventoryLevel(shopify: any, parameters: any) {
  console.log('updateInventoryLevel called with parameters:', parameters);
  
  const { inventoryItemId, locationId, available } = parameters;
  
  if (!inventoryItemId || !locationId || available === undefined) {
    console.error('Missing required parameters for inventory update');
    throw new Error('Inventory item ID, location ID, and available quantity are required');
  }
  
  // Verify the location exists
  try {
    console.log(`Verifying location ID: ${locationId}`);
    await shopify.location.get(locationId);
    console.log(`Location ${locationId} verified successfully`);
  } catch (error) {
    console.error(`Location ${locationId} not found:`, error);
    throw new Error(`Invalid location ID: ${locationId}. Please provide a valid location ID.`);
  }
  
  console.log(`Updating inventory for item ${inventoryItemId} at location ${locationId} to ${available} units`);
  
  // Get the current inventory level
  console.log('Checking if inventory level exists');
  const inventoryLevels = await shopify.inventoryLevel.list({
    inventory_item_ids: inventoryItemId,
    location_ids: locationId
  });
  console.log(`Found ${inventoryLevels.length} existing inventory levels`);
  
  let result;
  
  if (inventoryLevels.length > 0) {
    console.log('Updating existing inventory level');
    // Update existing inventory level
    result = await shopify.inventoryLevel.set({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: parseInt(available)
    });
    console.log('Inventory level updated successfully');
  } else {
    console.log('No existing inventory level found, connecting item to location first');
    // Connect and set inventory level
    result = await shopify.inventoryLevel.connect({
      inventory_item_id: inventoryItemId,
      location_id: locationId
    });
    console.log('Item connected to location, now setting inventory level');
    
    result = await shopify.inventoryLevel.set({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: parseInt(available)
    });
    console.log('Inventory level set successfully');
  }
  
  // Get product info for the response
  // This is a simplified implementation
  // In a real implementation, you would need to find the product associated with this inventory item
  console.log('Returning updated inventory information');
  
  return {
    id: inventoryItemId,
    locationId,
    available: parseInt(available),
    updatedAt: new Date().toISOString()
  };
}

async function getLocations(shopify: any, parameters: any) {
  console.log('getLocations called with parameters:', parameters);
  
  const { limit = 10 } = parameters;
  
  // Parse limit as integer and ensure it's a valid number
  const parsedLimit = parseInt(limit);
  const validLimit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
  
  const query: any = { limit: validLimit };
  
  console.log('Executing Shopify API call to get locations with query:', query);
  const locations = await shopify.location.list(query);
  console.log(`Retrieved ${locations.length} locations from Shopify`);
  
  // Transform to match the schema
  return {
    locations: locations.map((loc: any) => ({
      id: loc.id.toString(),
      name: loc.name,
      address: {
        address1: loc.address1 || '',
        address2: loc.address2 || '',
        city: loc.city || '',
        province: loc.province || '',
        zip: loc.zip || '',
        country: loc.country || '',
      },
      phone: loc.phone || '',
      active: loc.active,
      isDefault: loc.legacy ? false : true, // Primary location is usually not legacy
      createdAt: loc.created_at,
      updatedAt: loc.updated_at
    })),
    count: locations.length
  };
}

async function getLocationById(shopify: any, parameters: any) {
  const { locationId } = parameters;
  console.log(`getLocationById called for location ID: ${locationId}`);
  
  if (!locationId) {
    console.error('Location ID is required but was not provided');
    throw new Error('Location ID is required');
  }
  
  console.log(`Fetching location with ID: ${locationId}`);
  const location = await shopify.location.get(locationId);
  console.log(`Retrieved location: ${location.name} (ID: ${location.id})`);
  
  return {
    id: location.id.toString(),
    name: location.name,
    address: {
      address1: location.address1 || '',
      address2: location.address2 || '',
      city: location.city || '',
      province: location.province || '',
      zip: location.zip || '',
      country: location.country || '',
    },
    phone: location.phone || '',
    active: location.active,
    isDefault: location.legacy ? false : true, // Primary location is usually not legacy
    createdAt: location.created_at,
    updatedAt: location.updated_at
  };
}
