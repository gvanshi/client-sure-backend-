import mongoose from "mongoose";
import crypto from "crypto";
import { User } from "../models/index.js";
import TokenPackage from "../models/TokenPackage.js";
import TokenTransaction from "../models/TokenTransaction.js";
import { createNotification } from "../utils/notificationUtils.js";
import * as razorpayService from "../services/razorpayService.js";
import {
  addPurchasedTokens,
  getTokenBreakdown,
  calculateTotalTokens,
} from "../utils/enhancedTokenUtils.js";

/**
 * Get available token packages
 * GET /api/tokens/packages
 */
export const getTokenPackages = async (req, res) => {
  try {
    const packages = await TokenPackage.find({ isActive: true })
      .sort({ sortOrder: 1, tokens: 1 })
      .select("name tokens price description isPopular metadata.category");

    res.json({
      success: true,
      packages: packages.map((pkg) => ({
        id: pkg._id,
        name: pkg.name,
        tokens: pkg.tokens,
        price: pkg.price,
        description: pkg.description,
        isPopular: pkg.isPopular,
        category: pkg.metadata.category,
        pricePerToken: (pkg.price / pkg.tokens).toFixed(2),
      })),
    });
  } catch (error) {
    console.error("Get token packages error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch token packages",
    });
  }
};

/**
 * Create token purchase order
 * POST /api/tokens/purchase
 */
export const createTokenPurchase = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { packageId } = req.body;
    const userId = req.user.userId;
    const userAgent = req.get("User-Agent");
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Validate package
    const tokenPackage =
      await TokenPackage.findById(packageId).session(session);
    if (!tokenPackage || !tokenPackage.isActive) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: "Token package not found or inactive",
      });
    }

    // Get user details
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check subscription status
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        error: "Active subscription required to purchase tokens",
      });
    }

    // Check daily purchase limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayPurchases = await TokenTransaction.countDocuments({
      userId,
      status: "completed",
      createdAt: { $gte: todayStart },
    }).session(session);

    if (todayPurchases >= tokenPackage.metadata.maxPurchasePerDay) {
      await session.abortTransaction();
      return res.status(429).json({
        success: false,
        error: `Daily purchase limit exceeded. Maximum ${tokenPackage.metadata.maxPurchasePerDay} purchases per day.`,
      });
    }

    // Generate unique transaction ID
    const transactionId = `TKN_${Date.now()}_${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    // Create transaction record
    const currentTotal = calculateTotalTokens(user);
    const transaction = new TokenTransaction({
      userId,
      packageId: tokenPackage._id,
      transactionId,
      type: "purchase",
      tokens: tokenPackage.tokens,
      amount: tokenPackage.price,
      status: "pending",
      balanceBefore: currentTotal,
      balanceAfter: currentTotal + tokenPackage.tokens,
      metadata: {
        userAgent,
        ipAddress,
        purchaseReason: "token_topup",
        expiresAt: user.subscription.endDate, // Changed: expires with plan
      },
    });

    await transaction.save({ session });

    // Create Razorpay Order
    // Amount in paisa (INR * 100)
    const amountInPaisa = Math.round(tokenPackage.price * 100);
    const razorpayOrder = await razorpayService.createOrder({
      amount: amountInPaisa,
      receipt: transactionId,
      notes: {
        transactionId: transaction._id.toString(),
        type: "token_purchase",
        packageId: tokenPackage._id.toString(),
        userId: userId.toString(),
      },
    });

    // Update transaction with Razorpay Order ID
    transaction.razorpayOrderId = razorpayOrder.id;
    await transaction.save({ session });

    await session.commitTransaction();

    console.log(
      `Token purchase order created: ${transaction.transactionId} for ${user.email} (Razorpay Order: ${razorpayOrder.id})`,
    );

    res.json({
      success: true,
      transaction: {
        id: transaction.transactionId,
        tokens: tokenPackage.tokens,
        amount: tokenPackage.price,
        packageName: tokenPackage.name,
        expiresAt: transaction.metadata.expiresAt,
      },
      paymentDetails: {
        orderId: razorpayOrder.id,
        amount: amountInPaisa,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID,
        name: "Client Sure",
        description: `Purchase ${tokenPackage.tokens} Tokens`,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Create token purchase error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create token purchase order",
    });
  } finally {
    session.endSession();
  }
};

/**
 * Process token purchase completion (webhook)
 * POST /api/tokens/webhook
 */
export const processTokenPurchase = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { transactionId, paymentId, status } = req.body;

    // Find transaction
    const transaction = await TokenTransaction.findOne({
      transactionId,
    }).session(session);
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      });
    }

    // Check if already processed
    if (transaction.status === "completed") {
      await session.abortTransaction();
      return res.json({
        success: true,
        message: "Transaction already processed",
      });
    }

    if (status === "success") {
      // Update transaction
      transaction.status = "completed";
      transaction.paymentDetails.paymentId = paymentId;
      transaction.completedAt = new Date();

      // Update balance before/after
      const user = await User.findById(transaction.userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      const balanceBefore = calculateTotalTokens(user);
      transaction.balanceBefore = balanceBefore;

      await transaction.save({ session });
      await session.commitTransaction();

      // Add tokens using enhanced token utils (outside transaction)
      const result = await addPurchasedTokens(
        user._id,
        transaction.tokens,
        transaction._id,
      );

      console.log(
        `Tokens credited: ${transaction.tokens} tokens to ${user.email}`,
      );

      res.json({
        success: true,
        message: "Tokens credited successfully",
        tokensAdded: transaction.tokens,
        newBalance: result.currentBalance,
        totalPurchased: result.totalPurchased,
        expiresAt: result.expiresAt,
      });
    } else {
      // Mark as failed
      transaction.status = "failed";
      await transaction.save({ session });

      await session.commitTransaction();

      res.json({
        success: false,
        message: "Payment failed",
      });
    }
  } catch (error) {
    await session.abortTransaction();
    console.error("Process token purchase error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process token purchase",
    });
  } finally {
    session.endSession();
  }
};

/**
 * Get user's token purchase history
 * GET /api/tokens/history
 */
export const getTokenHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const transactions = await TokenTransaction.find({ userId })
      .populate("packageId", "name tokens price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select(
        "transactionId tokens amount status createdAt metadata.expiresAt",
      );

    const total = await TokenTransaction.countDocuments({ userId });

    res.json({
      success: true,
      transactions: transactions.map((txn) => ({
        id: txn.transactionId,
        packageName: txn.packageId?.name || "Unknown Package",
        tokens: txn.tokens,
        amount: txn.amount,
        status: txn.status,
        purchaseDate: txn.createdAt,
        expiresAt: txn.metadata.expiresAt,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + transactions.length < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get token history error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch token history",
    });
  }
};

/**
 * Get current token balance with breakdown
 * GET /api/tokens/balance
 */
export const getTokenBalance = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .populate("subscription.planId", "name dailyTokens")
      .select(
        "tokens tokensUsedToday subscription dailyTokens purchasedTokens bonusTokens prizeTokens",
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get enhanced token breakdown
    const breakdown = getTokenBreakdown(user);

    res.json({
      success: true,
      breakdown,
      // Legacy format for backward compatibility
      balance: {
        total: breakdown.total,
        regular: breakdown.daily.current,
        extra:
          breakdown.purchased.current +
          breakdown.bonus.current +
          breakdown.prize.current,
        used: breakdown.daily.usedToday,
        dailyLimit: breakdown.daily.limit,
        hasExtraTokens:
          breakdown.purchased.current +
            breakdown.bonus.current +
            breakdown.prize.current >
          0,
      },
      subscription: {
        planName: user.subscription.planId?.name || "No Plan",
        isActive: breakdown.planExpiry.isActive,
        endDate: breakdown.planExpiry.endDate,
        daysRemaining: breakdown.planExpiry.daysRemaining,
      },
    });
  } catch (error) {
    console.error("Get token balance error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch token balance",
    });
  }
};
