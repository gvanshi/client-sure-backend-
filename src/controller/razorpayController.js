import * as razorpayService from "../services/razorpayService.js";
import {
  Order,
  User,
  TokenTransaction,
  TokenPackage,
  Session,
} from "../models/index.js";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { sendWelcomeEmail } from "../utils/emailUtils.js";
import {
  generateReferralCode,
  validateReferralCode,
  updateReferralStats,
  processReferralReward,
} from "../utils/referralUtils.js";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

/**
 * Razorpay Controller
 * Handles Razorpay interactions: Verification and Webhooks
 */

/**
 * Verify Subscription Payment
 * POST /api/razorpay/verify-subscription
 */
export const verifySubscriptionPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    console.log("Verifying Razorpay subscription payment:", {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
    });

    // 1. Verify signature
    const isValid = razorpayService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment signature",
      });
    }

    // 2. Update Order Status
    const order = await Order.findById(orderId).populate("planId");
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    if (order.paymentStatus === "completed") {
      return res.json({ success: true, message: "Already processed" });
    }

    order.paymentStatus = "completed";
    order.providerOrderId = razorpay_order_id; // Ensure this is set
    order.paymentId = razorpay_payment_id;
    order.paymentSignature = razorpay_signature;
    order.completedAt = new Date();

    // Activate subscription
    let user;
    if (order.userId) {
      user = await User.findById(order.userId);
    } else {
      // New User Creation Logic
      console.log("Creating new user for verified order:", orderId);
      const email = order.userEmail;

      // Check if user exists (race condition check)
      user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        // Register new user
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(email, saltRounds);

        // Handle referral
        let referrer = null;
        if (order.referralCode) {
          referrer = await validateReferralCode(order.referralCode);
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetTokenHash = crypto
          .createHash("sha256")
          .update(resetToken)
          .digest("hex");
        const resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        let newReferralCode;
        let isUnique = false;
        while (!isUnique) {
          newReferralCode = generateReferralCode();
          const existingUser = await User.findOne({
            referralCode: newReferralCode,
          });
          if (!existingUser) isUnique = true;
        }

        // Calculate subscription details
        const plan = order.planId;
        const monthlyAllocation = plan.durationDays * plan.dailyTokens;
        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000,
        );

        user = new User({
          name: order.userName,
          email: email.toLowerCase(),
          phone: order.userPhone || null,
          passwordHash,
          resetTokenHash,
          resetTokenExpires,
          tokens: plan.dailyTokens,
          tokensUsedTotal: 0,
          monthlyTokensTotal: monthlyAllocation,
          monthlyTokensUsed: 0,
          monthlyTokensRemaining: monthlyAllocation,
          bonusTokens: {
            current: plan.bonusTokens || 0,
            initial: plan.bonusTokens || 0,
            used: 0,
            grantedAt: plan.bonusTokens > 0 ? new Date() : null,
          },
          referralCode: newReferralCode,
          referredBy: referrer ? referrer._id : null,
          referralStats: {
            totalReferrals: 0,
            activeReferrals: 0,
            totalEarnings: 0,
          },
          subscription: {
            planId: plan._id,
            startDate,
            endDate,
            dailyTokens: plan.dailyTokens,
            monthlyAllocation,
            isActive: true,
          },
        });

        await user.save();
        console.log("New user created via Razorpay verification:", user.email);

        // Update order with new userId
        order.userId = user._id;

        // Referral logic
        if (referrer) {
          referrer.referrals.push({
            userId: user._id,
            joinedAt: new Date(),
            isActive: false, // Will be set to true by processReferralReward
            subscriptionStatus: "active",
          });
          await referrer.save();

          // Process Commission Reward
          await processReferralReward(user._id, referrer._id);
        }

        // Send Welcome Email
        const planInfo = {
          planId: plan._id,
          planName: plan.name,
          planPrice: plan.price,
        };
        await sendWelcomeEmail(user, resetToken, planInfo);
      } else {
        console.log(
          "User already exists (race condition), linking order:",
          email,
        );
        order.userId = user._id;
      }
    }

    if (user) {
      if (order.userId && !user.isNew) {
        // Re-apply subscription update for existing users/renewals
        const plan = order.planId;
        const startDate = new Date();
        const endDate = new Date(
          startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000,
        );
        const monthlyAllocation = plan.durationDays * plan.dailyTokens;

        user.subscription = {
          planId: plan._id,
          startDate,
          endDate,
          dailyTokens: plan.dailyTokens,
          monthlyAllocation,
          isActive: true,
        };
        user.tokens = plan.dailyTokens;
        user.monthlyTokensTotal = monthlyAllocation;
        user.monthlyTokensRemaining = monthlyAllocation;

        // Grant bonus tokens from plan
        user.bonusTokens = {
          current: plan.bonusTokens || 0,
          initial: plan.bonusTokens || 0,
          used: 0,
          grantedAt: plan.bonusTokens > 0 ? new Date() : null,
        };

        await user.save();
        console.log("User subscription updated/activated:", user.email);
        console.log(
          `Granted ${plan.bonusTokens || 0} bonus tokens to ${user.email}`,
        );

        // Handle referral reward for existing users renewal/payment
        if (user.referredBy) {
          console.log(
            `Processing referral reward for existing user ${user.email} (Referred by: ${user.referredBy})`,
          );
          await processReferralReward(user._id, user.referredBy);
        }
      }
    }

    await order.save();
    console.log("Subscription payment verified and completed:", orderId);

    // Generate Session and Token for Auto-Login
    const sessionId = uuidv4();
    const userAgent = req.headers["user-agent"] || "Unknown Device";
    const newSession = new Session({
      userId: user._id,
      sessionId: sessionId,
      deviceId: `payment-${orderId}`, // Use order ID as unique device identifier
      deviceName: userAgent.includes("Mobile")
        ? "Mobile Browser"
        : "Desktop Browser",
      platform: "web",
      ipAddress: req.ip || req.connection.remoteAddress || "Unknown IP",
      createdAt: new Date(),
      lastActiveAt: new Date(),
    });
    await newSession.save();

    // Update user last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      {
        payload: {
          userId: user._id,
          email: user.email,
          planId: user.subscription.planId,
          sessionId: sessionId,
        },
        userId: user._id,
        email: user.email,
        planId: user.subscription.planId,
        sessionId: sessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    // Set HTTP-only cookie
    res.cookie("userToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.json({
      success: true,
      message: "Payment verified and subscription activated",
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error("Verify subscription error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * Verify Token Purchase Payment
 * POST /api/razorpay/verify-token-purchase
 */
export const verifyTokenPurchasePayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      transactionId,
    } = req.body;

    console.log("Verifying Razorpay token payment:", {
      transactionId,
      razorpay_order_id,
    });

    const isValid = razorpayService.verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!isValid) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid signature" });
    }

    const transaction =
      await TokenTransaction.findById(transactionId).populate("userId");
    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, error: "Transaction not found" });
    }

    if (transaction.status === "completed") {
      return res.json({ success: true, message: "Already processed" });
    }

    transaction.status = "completed";
    transaction.providerOrderId = razorpay_order_id;
    transaction.paymentId = razorpay_payment_id;
    transaction.paymentSignature = razorpay_signature;
    transaction.completedAt = new Date();

    // Add tokens
    const user = await User.findById(transaction.userId);
    if (user) {
      user.tokens = (user.tokens || 0) + transaction.tokens;

      // Update Enhanced Token Stats
      if (!user.purchasedTokens) {
        user.purchasedTokens = {
          current: 0,
          total: 0,
          used: 0,
          lastPurchasedAt: null,
          expiresAt: null,
        };
      }

      user.purchasedTokens.current =
        (user.purchasedTokens.current || 0) + transaction.tokens;
      user.purchasedTokens.total =
        (user.purchasedTokens.total || 0) + transaction.tokens;
      user.purchasedTokens.lastPurchasedAt = new Date();

      await user.save();
    }

    await transaction.save();
    console.log("Token purchase verified and completed:", transactionId);

    res.json({ success: true, message: "Payment verified and tokens added" });
  } catch (error) {
    console.error("Verify token purchase error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * Create Token Purchase Order (Since logic is specific to tokens, kept here or shared)
 * POST /api/razorpay/create-token-order
 */
export const createTokenOrder = async (req, res) => {
  try {
    const { packageId, userId } = req.body;

    const tokenPackage = await TokenPackage.findById(packageId);
    if (!tokenPackage)
      return res.status(404).json({ error: "Package not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const transaction = new TokenTransaction({
      userId: user._id,
      packageId: tokenPackage._id,
      tokens: tokenPackage.tokens,
      amount: tokenPackage.price,
      status: "pending",
      transactionId: `TKN_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      createdAt: new Date(),
    });
    await transaction.save();

    const amountInPaisa = Math.round(tokenPackage.price * 100);
    const razorpayOrder = await razorpayService.createOrder({
      amount: amountInPaisa,
      receipt: `rcpt_token_${transaction._id}`,
      notes: {
        transactionId: transaction._id.toString(),
        type: "token_purchase",
      },
    });

    transaction.providerOrderId = razorpayOrder.id; // Save Razorpay Order ID
    await transaction.save();

    res.json({
      success: true,
      transactionId: transaction._id,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: razorpayOrder.id,
      amount: amountInPaisa,
      currency: razorpayOrder.currency,
      package: tokenPackage,
    });
  } catch (error) {
    console.error("Create token order error:", error);
    res.status(500).json({ success: false, error: "Failed to create order" });
  }
};

/**
 * Validate Config
 */
export const validateConfig = (req, res) => {
  try {
    razorpayService.validateConfig();
    res.json({ success: true, message: "Razorpay config valid" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
