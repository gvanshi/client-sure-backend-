import express from "express";
import * as razorpayController from "../controller/razorpayController.js";

const router = express.Router();

/**
 * Razorpay Payment Routes
 */

/**
 * @route   POST /api/razorpay/verify-subscription
 * @desc    Verify Razorpay subscription payment
 * @access  Public
 */
router.post(
  "/verify-subscription",
  razorpayController.verifySubscriptionPayment,
);

/**
 * @route   POST /api/razorpay/verify-token-purchase
 * @desc    Verify Razorpay token purchase payment
 * @access  Public
 */
router.post(
  "/verify-token-purchase",
  razorpayController.verifyTokenPurchasePayment,
);

/**
 * @route   POST /api/razorpay/create-token-order
 * @desc    Create Razorpay order for token purchase
 * @access  Public
 */
router.post("/create-token-order", razorpayController.createTokenOrder);

/**
 * @route   GET /api/razorpay/validate-config
 * @desc    Validate Razorpay configuration
 * @access  Public
 */
router.get("/validate-config", razorpayController.validateConfig);

export default router;
