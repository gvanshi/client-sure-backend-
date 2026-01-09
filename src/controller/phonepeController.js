import * as phonepeService from '../services/phonepeService.js';
import { Order, User, Plan, TokenTransaction, TokenPackage } from '../models/index.js';

/**
 * PhonePe Payment Controller
 * 
 * Handles all PhonePe payment-related operations:
 * - Initiating subscription payments
 * - Initiating token purchase payments
 * - Processing webhooks
 * - Checking payment status
 */

/**
 * Create payment order for subscription
 * POST /api/phonepe/create-subscription-payment
 */
const createSubscriptionPayment = async (req, res) => {
  try {
    const { orderId, planId, name, email, phone, referralCode } = req.body;

    console.log('Creating PhonePe subscription payment:', {
      orderId,
      planId,
      email
    });

    // Validate required fields
    if (!orderId || !planId || !name || !email) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, planId, name, email'
      });
    }

    // Find the order
    const order = await Order.findById(orderId).populate('planId');
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if order is already paid
    if (order.paymentStatus === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Order already paid'
      });
    }

    // Generate merchant order ID
    const merchantOrderId = phonepeService.generateMerchantOrderId('SUB');

    // Convert amount to paisa
    const amountInPaisa = phonepeService.rupeesToPaisa(order.amount);

    // Prepare payment data
    const paymentData = {
      merchantOrderId,
      amount: amountInPaisa,
      redirectUrl: `${process.env.FRONTEND_URL}/payment-success?orderId=${orderId}`,
      metaInfo: {
        udf1: orderId.toString(),
        udf2: 'subscription',
        udf3: referralCode || ''
      },
      expireAfter: 900 // 15 minutes
    };

    // Create payment in PhonePe
    const paymentResponse = await phonepeService.createPayment(paymentData);

    // Update order with PhonePe details
    order.merchantOrderId = merchantOrderId;
    order.phonePeOrderId = paymentResponse.orderId;
    order.paymentStatus = 'pending';
    await order.save();

    console.log('PhonePe subscription payment created:', {
      orderId,
      merchantOrderId,
      phonePeOrderId: paymentResponse.orderId
    });

    res.json({
      success: true,
      ...paymentResponse
    });
  } catch (error) {
    console.error('Create subscription payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment'
    });
  }
};

/**
 * Create payment order for token purchase
 * POST /api/phonepe/create-token-payment
 */
const createTokenPayment = async (req, res) => {
  try {
    const { packageId, userId } = req.body;

    console.log('Creating PhonePe token payment:', {
      packageId,
      userId
    });

    // Validate required fields
    if (!packageId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: packageId, userId'
      });
    }

    // Find the token package
    const tokenPackage = await TokenPackage.findById(packageId);
    if (!tokenPackage) {
      return res.status(404).json({
        success: false,
        error: 'Token package not found'
      });
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Create token transaction
    const tokenTransaction = new TokenTransaction({
      userId: user._id,
      packageId: tokenPackage._id,
      tokens: tokenPackage.tokens,
      amount: tokenPackage.price,
      status: 'pending',
      createdAt: new Date()
    });
    await tokenTransaction.save();

    // Generate merchant order ID
    const merchantOrderId = phonepeService.generateMerchantOrderId('TOKEN');

    // Convert amount to paisa
    const amountInPaisa = phonepeService.rupeesToPaisa(tokenPackage.price);

    // Prepare payment data
    const paymentData = {
      merchantOrderId,
      amount: amountInPaisa,
      redirectUrl: `${process.env.FRONTEND_URL}/payment-success?transactionId=${tokenTransaction._id}`,
      metaInfo: {
        udf1: tokenTransaction._id.toString(),
        udf2: 'token_purchase',
        udf3: tokenPackage.tokens.toString()
      },
      expireAfter: 900 // 15 minutes
    };

    // Create payment in PhonePe
    const paymentResponse = await phonepeService.createPayment(paymentData);

    // Update transaction with PhonePe details
    tokenTransaction.merchantOrderId = merchantOrderId;
    tokenTransaction.phonePeOrderId = paymentResponse.orderId;
    await tokenTransaction.save();

    console.log('PhonePe token payment created:', {
      transactionId: tokenTransaction._id,
      merchantOrderId,
      phonePeOrderId: paymentResponse.orderId
    });

    res.json({
      success: true,
      transactionId: tokenTransaction._id,
      ...paymentResponse
    });
  } catch (error) {
    console.error('Create token payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment'
    });
  }
};

/**
 * Handle PhonePe webhook
 * POST /api/phonepe/webhook
 */
const handleWebhook = async (req, res) => {
  try {
    // Verify webhook signature
    const authHeader = req.headers.authorization;
    const isValid = phonepeService.verifyWebhookSignature(authHeader);

    if (!isValid) {
      console.warn('Invalid webhook signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    // Parse webhook data
    const webhookData = phonepeService.parseWebhookData(req.body);

    console.log('PhonePe webhook received:', {
      event: webhookData.event,
      merchantOrderId: webhookData.merchantOrderId,
      state: webhookData.state
    });

    // Respond immediately to acknowledge receipt
    res.status(200).json({ success: true });

    // Process webhook asynchronously
    processWebhook(webhookData).catch(error => {
      console.error('Webhook processing error:', error);
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    
    // Still respond with 200 to prevent PhonePe retries for invalid data
    res.status(200).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
};

/**
 * Process webhook data asynchronously
 */
const processWebhook = async (webhookData) => {
  const { event, merchantOrderId, state, amount, metaInfo, paymentMode, transactionId, rail } = webhookData;

  try {
    // Determine payment type from metadata
    const paymentType = metaInfo.udf2; // 'subscription' or 'token_purchase'

    if (paymentType === 'subscription') {
      await processSubscriptionWebhook(webhookData);
    } else if (paymentType === 'token_purchase') {
      await processTokenWebhook(webhookData);
    } else {
      console.warn('Unknown payment type in webhook:', paymentType);
    }
  } catch (error) {
    console.error('Webhook processing error:', error);
    throw error;
  }
};

/**
 * Process subscription payment webhook
 */
const processSubscriptionWebhook = async (webhookData) => {
  const { merchantOrderId, state, transactionId, paymentMode, rail } = webhookData;
  const orderId = webhookData.metaInfo.udf1;

  try {
    // Find the order
    const order = await Order.findById(orderId).populate('userId planId');
    if (!order) {
      console.error('Order not found for webhook:', orderId);
      return;
    }

    // Update order status
    if (state === 'COMPLETED') {
      order.paymentStatus = 'completed';
      order.phonePeTransactionId = transactionId;
      order.paymentMode = paymentMode;
      order.paymentRail = rail;
      order.completedAt = new Date();

      // Activate user subscription if not already active
      if (order.userId) {
        const user = await User.findById(order.userId);
        if (user) {
          const plan = order.planId;
          
          // Update subscription details
          const startDate = new Date();
          const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
          const monthlyAllocation = plan.durationDays * plan.dailyTokens;

          user.subscription = {
            planId: plan._id,
            startDate,
            endDate,
            dailyTokens: plan.dailyTokens,
            monthlyAllocation,
            isActive: true
          };

          user.tokens = plan.dailyTokens;
          user.monthlyTokensTotal = monthlyAllocation;
          user.monthlyTokensRemaining = monthlyAllocation;

          await user.save();
          console.log('User subscription activated:', user.email);
        }
      }

      await order.save();
      console.log('Subscription payment completed:', orderId);

    } else if (state === 'FAILED') {
      order.paymentStatus = 'failed';
      order.failureReason = webhookData.errorInfo?.message || 'Payment failed';
      await order.save();
      console.log('Subscription payment failed:', orderId);
    }
  } catch (error) {
    console.error('Subscription webhook processing error:', error);
    throw error;
  }
};

/**
 * Process token purchase webhook
 */
const processTokenWebhook = async (webhookData) => {
  const { merchantOrderId, state, transactionId, paymentMode, rail } = webhookData;
  const transactionIdFromMeta = webhookData.metaInfo.udf1;

  try {
    // Find the token transaction
    const transaction = await TokenTransaction.findById(transactionIdFromMeta).populate('userId packageId');
    if (!transaction) {
      console.error('Token transaction not found for webhook:', transactionIdFromMeta);
      return;
    }

    // Update transaction status
    if (state === 'COMPLETED') {
      transaction.status = 'completed';
      transaction.phonePeTransactionId = transactionId;
      transaction.paymentMode = paymentMode;
      transaction.paymentRail = rail;
      transaction.completedAt = new Date();

      // Add tokens to user account
      const user = await User.findById(transaction.userId);
      if (user) {
        user.tokens += transaction.tokens;
        await user.save();
        console.log('Tokens added to user:', {
          userId: user._id,
          tokensAdded: transaction.tokens,
          newBalance: user.tokens
        });
      }

      await transaction.save();
      console.log('Token purchase completed:', transactionIdFromMeta);

    } else if (state === 'FAILED') {
      transaction.status = 'failed';
      transaction.failureReason = webhookData.errorInfo?.message || 'Payment failed';
      await transaction.save();
      console.log('Token purchase failed:', transactionIdFromMeta);
    }
  } catch (error) {
    console.error('Token webhook processing error:', error);
    throw error;
  }
};

/**
 * Check payment status for subscription
 * GET /api/phonepe/subscription-status/:merchantOrderId
 */
const checkSubscriptionStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    console.log('Checking subscription status:', merchantOrderId);

    // Get status from PhonePe
    const statusResponse = await phonepeService.checkOrderStatus(merchantOrderId);

    // Find order in database
    const order = await Order.findOne({ merchantOrderId });

    res.json({
      success: true,
      phonePeStatus: statusResponse,
      orderStatus: order ? {
        orderId: order._id,
        paymentStatus: order.paymentStatus,
        amount: order.amount
      } : null
    });
  } catch (error) {
    console.error('Check subscription status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check status'
    });
  }
};

/**
 * Check payment status for token purchase
 * GET /api/phonepe/token-status/:merchantOrderId
 */
const checkTokenStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    console.log('Checking token payment status:', merchantOrderId);

    // Get status from PhonePe
    const statusResponse = await phonepeService.checkOrderStatus(merchantOrderId);

    // Find transaction in database
    const transaction = await TokenTransaction.findOne({ merchantOrderId });

    res.json({
      success: true,
      phonePeStatus: statusResponse,
      transactionStatus: transaction ? {
        transactionId: transaction._id,
        status: transaction.status,
        tokens: transaction.tokens,
        amount: transaction.amount
      } : null
    });
  } catch (error) {
    console.error('Check token status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check status'
    });
  }
};

/**
 * Validate PhonePe configuration
 * GET /api/phonepe/validate-config
 */
const validateConfig = async (req, res) => {
  try {
    phonepeService.validateConfig();
    
    res.json({
      success: true,
      message: 'PhonePe configuration is valid',
      environment: process.env.PHONEPE_ENV || 'sandbox'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export {
  createSubscriptionPayment,
  createTokenPayment,
  handleWebhook,
  checkSubscriptionStatus,
  checkTokenStatus,
  validateConfig
};
