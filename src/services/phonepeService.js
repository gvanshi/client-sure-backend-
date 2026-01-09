import axios from 'axios';
import crypto from 'crypto';

/**
 * PhonePe Payment Gateway Service
 * 
 * This service handles all interactions with PhonePe Standard Checkout API:
 * - Token generation and caching
 * - Payment initiation
 * - Order status checking
 * - Webhook signature verification
 */

// Token cache to avoid unnecessary API calls
let tokenCache = {
  token: null,
  expiresAt: null
};

/**
 * Get the base URL based on environment
 */
const getBaseUrl = () => {
  const isProduction = process.env.PHONEPE_ENV === 'production';
  return isProduction
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
};

/**
 * Get the auth URL based on environment
 */
const getAuthUrl = () => {
  const isProduction = process.env.PHONEPE_ENV === 'production';
  return isProduction
    ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
};

/**
 * Check if cached token is still valid
 * Refresh token if it expires in less than 5 minutes
 */
const isTokenValid = () => {
  if (!tokenCache.token || !tokenCache.expiresAt) {
    return false;
  }
  
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const bufferTime = 300; // 5 minutes buffer
  
  return tokenCache.expiresAt - now > bufferTime;
};

/**
 * Generate OAuth token for PhonePe API authentication
 * Implements token caching to minimize API calls
 * 
 * @returns {Promise<string>} Access token prefixed with 'O-Bearer '
 * @throws {Error} If token generation fails
 */
const getAuthToken = async () => {
  try {
    // Return cached token if still valid
    if (isTokenValid()) {
      console.log('Using cached PhonePe token');
      return tokenCache.token;
    }

    console.log('Generating new PhonePe token');
    
    const authUrl = getAuthUrl();
    
    // Prepare request body as URL-encoded form data
    const params = new URLSearchParams({
      client_id: process.env.PHONEPE_CLIENT_ID,
      client_version: process.env.PHONEPE_CLIENT_VERSION || '1.0',
      client_secret: process.env.PHONEPE_CLIENT_SECRET,
      grant_type: 'client_credentials'
    });

    const response = await axios.post(authUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Cache the token with expiry time
    tokenCache = {
      token: response.data.access_token,
      expiresAt: response.data.expires_at // Unix timestamp in seconds
    };

    console.log(`PhonePe token generated, expires at: ${new Date(tokenCache.expiresAt * 1000).toISOString()}`);
    
    return tokenCache.token;
  } catch (error) {
    console.error('PhonePe token generation failed:', error.response?.data || error.message);
    
    // Clear cache on error
    tokenCache = { token: null, expiresAt: null };
    
    throw new Error(`Failed to generate PhonePe token: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Create a payment order in PhonePe
 * 
 * @param {Object} orderData - Order details
 * @param {string} orderData.merchantOrderId - Unique order ID from your system
 * @param {number} orderData.amount - Amount in paisa (₹1 = 100 paisa)
 * @param {string} orderData.redirectUrl - URL to redirect after payment
 * @param {Object} orderData.metaInfo - Optional metadata (udf1, udf2, udf3)
 * @param {number} orderData.expireAfter - Optional expiry time in seconds (300-3600)
 * 
 * @returns {Promise<Object>} Payment response with orderId, redirectUrl, state
 * @throws {Error} If payment creation fails
 */
const createPayment = async (orderData) => {
  try {
    const token = await getAuthToken();
    const baseUrl = getBaseUrl();
    
    // Validate required fields
    if (!orderData.merchantOrderId) {
      throw new Error('merchantOrderId is required');
    }
    
    if (!orderData.amount || orderData.amount < 100) {
      throw new Error('amount must be at least 100 paisa (₹1)');
    }
    
    if (!orderData.redirectUrl) {
      throw new Error('redirectUrl is required');
    }

    // Prepare request payload
    const payload = {
      merchantOrderId: orderData.merchantOrderId,
      amount: Math.floor(orderData.amount), // Ensure integer
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl: orderData.redirectUrl
        }
      }
    };

    // Add optional fields
    if (orderData.expireAfter) {
      payload.expireAfter = Math.min(Math.max(orderData.expireAfter, 300), 3600);
    }

    if (orderData.metaInfo) {
      payload.metaInfo = orderData.metaInfo;
    }

    console.log('Creating PhonePe payment:', {
      merchantOrderId: payload.merchantOrderId,
      amount: payload.amount,
      environment: process.env.PHONEPE_ENV || 'sandbox'
    });

    const response = await axios.post(
      `${baseUrl}/checkout/v2/pay`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    console.log('PhonePe payment created:', {
      orderId: response.data.orderId,
      state: response.data.state
    });

    return {
      success: true,
      orderId: response.data.orderId,
      merchantOrderId: payload.merchantOrderId,
      state: response.data.state,
      redirectUrl: response.data.redirectUrl,
      expireAt: response.data.expireAt
    };
  } catch (error) {
    console.error('PhonePe payment creation failed:', error.response?.data || error.message);
    
    throw new Error(
      `Failed to create PhonePe payment: ${error.response?.data?.message || error.message}`
    );
  }
};

/**
 * Check the status of a payment order
 * 
 * @param {string} merchantOrderId - Your system's order ID
 * @param {boolean} includeDetails - Include all payment attempts
 * @param {boolean} includeErrorContext - Include error details if failed
 * 
 * @returns {Promise<Object>} Order status with state, payment details
 * @throws {Error} If status check fails
 */
const checkOrderStatus = async (merchantOrderId, includeDetails = true, includeErrorContext = true) => {
  try {
    const token = await getAuthToken();
    const baseUrl = getBaseUrl();
    
    if (!merchantOrderId) {
      throw new Error('merchantOrderId is required');
    }

    // Build query parameters
    const params = new URLSearchParams();
    if (includeDetails) params.append('details', 'true');
    if (includeErrorContext) params.append('errorContext', 'true');

    console.log(`Checking PhonePe order status: ${merchantOrderId}`);

    const response = await axios.get(
      `${baseUrl}/checkout/v2/order/${merchantOrderId}/status?${params.toString()}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `O-Bearer ${token}`
        }
      }
    );

    console.log('PhonePe order status:', {
      merchantOrderId,
      state: response.data.state
    });

    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    console.error('PhonePe status check failed:', error.response?.data || error.message);
    
    // If order not found, return pending state
    if (error.response?.status === 404) {
      return {
        success: false,
        state: 'PENDING',
        message: 'Order not found or still processing'
      };
    }
    
    throw new Error(
      `Failed to check PhonePe order status: ${error.response?.data?.message || error.message}`
    );
  }
};

/**
 * Verify PhonePe webhook signature
 * PhonePe sends: Authorization: SHA256 <base64(SHA256(username:password))>
 * 
 * @param {string} authHeader - Authorization header from webhook request
 * 
 * @returns {boolean} True if signature is valid
 */
const verifyWebhookSignature = (authHeader) => {
  try {
    if (!authHeader || !authHeader.startsWith('SHA256 ')) {
      console.warn('Invalid webhook authorization header format');
      return false;
    }

    // Extract the hash from header
    const receivedHash = authHeader.replace('SHA256 ', '');

    // Generate expected hash
    const credentials = `${process.env.PHONEPE_WEBHOOK_USERNAME}:${process.env.PHONEPE_WEBHOOK_PASSWORD}`;
    const expectedHash = crypto
      .createHash('sha256')
      .update(credentials)
      .digest('base64');

    const isValid = receivedHash === expectedHash;
    
    if (!isValid) {
      console.warn('Webhook signature verification failed');
    }
    
    return isValid;
  } catch (error) {
    console.error('Webhook signature verification error:', error.message);
    return false;
  }
};

/**
 * Parse and validate webhook payload
 * 
 * @param {Object} webhookData - Raw webhook data from PhonePe
 * 
 * @returns {Object} Parsed webhook data with normalized structure
 */
const parseWebhookData = (webhookData) => {
  try {
    const { event, payload } = webhookData;

    if (!event || !payload) {
      throw new Error('Invalid webhook payload structure');
    }

    // Extract payment details
    const paymentDetails = payload.paymentDetails?.[0] || {};

    return {
      event,
      orderId: payload.orderId,
      merchantOrderId: payload.merchantOrderId,
      state: payload.state, // COMPLETED, FAILED, PENDING
      amount: payload.amount,
      merchantId: payload.merchantId,
      metaInfo: payload.metaInfo || {},
      expireAt: payload.expireAt,
      
      // Payment details
      paymentMode: paymentDetails.paymentMode, // UPI_QR, UPI_INTENT, CARD, etc.
      transactionId: paymentDetails.transactionId,
      paymentTimestamp: paymentDetails.timestamp,
      paymentState: paymentDetails.state,
      
      // UPI/Card specific details
      rail: paymentDetails.rail || {},
      
      // Error information (if payment failed)
      errorInfo: payload.errorInfo || null
    };
  } catch (error) {
    console.error('Webhook parsing error:', error.message);
    throw new Error(`Failed to parse webhook data: ${error.message}`);
  }
};

/**
 * Generate a unique merchant order ID
 * Format: ORDER_{timestamp}_{random}
 * 
 * @param {string} prefix - Optional prefix (default: 'ORDER')
 * 
 * @returns {string} Unique order ID
 */
const generateMerchantOrderId = (prefix = 'ORDER') => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
};

/**
 * Convert rupees to paisa
 * 
 * @param {number} rupees - Amount in rupees
 * 
 * @returns {number} Amount in paisa
 */
const rupeesToPaisa = (rupees) => {
  return Math.floor(rupees * 100);
};

/**
 * Convert paisa to rupees
 * 
 * @param {number} paisa - Amount in paisa
 * 
 * @returns {number} Amount in rupees
 */
const paisaToRupees = (paisa) => {
  return paisa / 100;
};

/**
 * Validate PhonePe environment configuration
 * 
 * @throws {Error} If required environment variables are missing
 */
const validateConfig = () => {
  const required = [
    'PHONEPE_CLIENT_ID',
    'PHONEPE_CLIENT_SECRET',
    'PHONEPE_WEBHOOK_USERNAME',
    'PHONEPE_WEBHOOK_PASSWORD'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required PhonePe environment variables: ${missing.join(', ')}`);
  }

  console.log('PhonePe configuration validated:', {
    environment: process.env.PHONEPE_ENV || 'sandbox',
    baseUrl: getBaseUrl()
  });
};

export {
  getAuthToken,
  createPayment,
  checkOrderStatus,
  verifyWebhookSignature,
  parseWebhookData,
  generateMerchantOrderId,
  rupeesToPaisa,
  paisaToRupees,
  validateConfig
};
