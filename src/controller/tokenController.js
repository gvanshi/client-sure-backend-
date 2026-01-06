import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/index.js';
import TokenPackage from '../models/TokenPackage.js';
import TokenTransaction from '../models/TokenTransaction.js';
import { createNotification } from '../utils/notificationUtils.js';

/**
 * Get available token packages
 * GET /api/tokens/packages
 */
export const getTokenPackages = async (req, res) => {
  try {
    const packages = await TokenPackage.find({ isActive: true })
      .sort({ sortOrder: 1, tokens: 1 })
      .select('name tokens price description isPopular metadata.category');

    res.json({
      success: true,
      packages: packages.map(pkg => ({
        id: pkg._id,
        name: pkg.name,
        tokens: pkg.tokens,
        price: pkg.price,
        description: pkg.description,
        isPopular: pkg.isPopular,
        category: pkg.metadata.category,
        pricePerToken: (pkg.price / pkg.tokens).toFixed(2)
      }))
    });
  } catch (error) {
    console.error('Get token packages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token packages'
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
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Validate package
    const tokenPackage = await TokenPackage.findById(packageId).session(session);
    if (!tokenPackage || !tokenPackage.isActive) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: 'Token package not found or inactive'
      });
    }

    // Get user details
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check subscription status
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        error: 'Active subscription required to purchase tokens'
      });
    }

    // Check daily purchase limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayPurchases = await TokenTransaction.countDocuments({
      userId,
      status: 'completed',
      createdAt: { $gte: todayStart }
    }).session(session);

    if (todayPurchases >= tokenPackage.metadata.maxPurchasePerDay) {
      await session.abortTransaction();
      return res.status(429).json({
        success: false,
        error: `Daily purchase limit exceeded. Maximum ${tokenPackage.metadata.maxPurchasePerDay} purchases per day.`
      });
    }

    // Generate unique transaction ID
    const transactionId = `TKN_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create transaction record
    const transaction = new TokenTransaction({
      userId,
      packageId: tokenPackage._id,
      transactionId,
      type: 'purchase',
      tokens: tokenPackage.tokens,
      amount: tokenPackage.price,
      status: 'pending',
      balanceBefore: user.tokens,
      balanceAfter: user.tokens + tokenPackage.tokens,
      metadata: {
        userAgent,
        ipAddress,
        purchaseReason: 'token_topup',
        expiresAt: new Date(Date.now() + tokenPackage.metadata.validityHours * 60 * 60 * 1000)
      }
    });

    await transaction.save({ session });

    // Create payment order (using dummy payment system)
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://client-sure-backend.vercel.app'
      : `http://localhost:${process.env.PORT || 5000}`;
    
    const paymentPayload = {
      checkoutUrl: `${baseUrl}/api/dummy-token-checkout?transaction=${transaction.transactionId}`,
      checkoutToken: `token-${Date.now()}`,
      orderAmount: tokenPackage.price,
      userEmail: user.email,
      userName: user.name,
      transactionId: transaction.transactionId
    };

    await session.commitTransaction();

    console.log(`Token purchase order created: ${transaction.transactionId} for ${user.email}`);

    res.json({
      success: true,
      transaction: {
        id: transaction.transactionId,
        tokens: tokenPackage.tokens,
        amount: tokenPackage.price,
        packageName: tokenPackage.name,
        expiresAt: transaction.metadata.expiresAt
      },
      paymentPayload
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Create token purchase error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create token purchase order'
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
    const transaction = await TokenTransaction.findOne({ transactionId }).session(session);
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Check if already processed
    if (transaction.status === 'completed') {
      await session.abortTransaction();
      return res.json({
        success: true,
        message: 'Transaction already processed'
      });
    }

    if (status === 'success') {
      // Update transaction
      transaction.status = 'completed';
      transaction.paymentDetails.paymentId = paymentId;
      await transaction.save({ session });

      // Credit tokens to user
      const user = await User.findById(transaction.userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Add tokens using Approach 1 (existing field)
      user.tokens += transaction.tokens;
      await user.save({ session });

      await session.commitTransaction();

      // Create notification for successful token purchase
      const tokenPackage = await TokenPackage.findById(transaction.packageId);
      const notificationMessage = `🎉 Token purchase successful! ${transaction.tokens} tokens from ${tokenPackage.name} package have been added to your account.`;
      
      await createNotification(
        user._id,
        'token_purchase',
        notificationMessage,
        null,
        null
      );

      console.log(`Tokens credited: ${transaction.tokens} tokens to ${user.email}`);

      res.json({
        success: true,
        message: 'Tokens credited successfully',
        tokensAdded: transaction.tokens,
        newBalance: user.tokens
      });

    } else {
      // Mark as failed
      transaction.status = 'failed';
      await transaction.save({ session });
      
      await session.commitTransaction();

      res.json({
        success: false,
        message: 'Payment failed'
      });
    }

  } catch (error) {
    await session.abortTransaction();
    console.error('Process token purchase error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process token purchase'
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
      .populate('packageId', 'name tokens price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('transactionId tokens amount status createdAt metadata.expiresAt');

    const total = await TokenTransaction.countDocuments({ userId });

    res.json({
      success: true,
      transactions: transactions.map(txn => ({
        id: txn.transactionId,
        packageName: txn.packageId?.name || 'Unknown Package',
        tokens: txn.tokens,
        amount: txn.amount,
        status: txn.status,
        purchaseDate: txn.createdAt,
        expiresAt: txn.metadata.expiresAt
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + transactions.length < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get token history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token history'
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
      .populate('subscription.planId', 'name dailyTokens')
      .select('tokens tokensUsedToday subscription');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Calculate extra tokens (tokens above daily limit)
    const dailyLimit = user.subscription.dailyTokens || 100;
    const extraTokens = Math.max(0, user.tokens - dailyLimit);
    const regularTokens = Math.min(user.tokens, dailyLimit);

    res.json({
      success: true,
      balance: {
        total: user.tokens,
        regular: regularTokens,
        extra: extraTokens,
        used: user.tokensUsedToday || 0,
        dailyLimit: dailyLimit,
        hasExtraTokens: extraTokens > 0
      },
      subscription: {
        planName: user.subscription.planId?.name || 'No Plan',
        isActive: user.subscription.endDate && user.subscription.endDate > new Date()
      }
    });

  } catch (error) {
    console.error('Get token balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token balance'
    });
  }
};