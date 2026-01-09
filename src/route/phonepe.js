import express from 'express';
import * as phonepeController from '../controller/phonepeController.js';

const router = express.Router();

/**
 * PhonePe Payment Routes
 * 
 * Handles all PhonePe payment gateway operations
 */

/**
 * @route   POST /api/phonepe/create-subscription-payment
 * @desc    Create PhonePe payment for subscription
 * @access  Public
 * @body    { orderId, planId, name, email, phone, referralCode }
 */
router.post('/create-subscription-payment', phonepeController.createSubscriptionPayment);

/**
 * @route   POST /api/phonepe/create-token-payment
 * @desc    Create PhonePe payment for token purchase
 * @access  Public (should be protected in production)
 * @body    { packageId, userId }
 */
router.post('/create-token-payment', phonepeController.createTokenPayment);

/**
 * @route   POST /api/phonepe/webhook
 * @desc    Receive PhonePe webhook notifications
 * @access  Public (verified by signature)
 * @body    PhonePe webhook payload
 */
router.post('/webhook', phonepeController.handleWebhook);

/**
 * @route   GET /api/phonepe/subscription-status/:merchantOrderId
 * @desc    Check subscription payment status
 * @access  Public (should be protected in production)
 */
router.get('/subscription-status/:merchantOrderId', phonepeController.checkSubscriptionStatus);

/**
 * @route   GET /api/phonepe/token-status/:merchantOrderId
 * @desc    Check token payment status
 * @access  Public (should be protected in production)
 */
router.get('/token-status/:merchantOrderId', phonepeController.checkTokenStatus);

/**
 * @route   GET /api/phonepe/validate-config
 * @desc    Validate PhonePe configuration
 * @access  Public (for debugging)
 */
router.get('/validate-config', phonepeController.validateConfig);

export default router;
