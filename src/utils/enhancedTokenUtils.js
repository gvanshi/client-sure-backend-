import User from "../models/User.js";
import { createNotification } from "./notificationUtils.js";

/**
 * Calculate total available tokens for user across all types
 * All tokens are valid until subscription.endDate
 */
export const calculateTotalTokens = (user) => {
  // Check if subscription is active
  const now = new Date();
  if (!user.subscription?.endDate || user.subscription.endDate < now) {
    return 0; // All tokens expired with plan
  }

  let total = 0;
  total += user.dailyTokens?.current || 0;
  total += user.purchasedTokens?.current || 0;
  total += user.bonusTokens?.current || 0;
  total += user.prizeTokens?.current || 0;

  return total;
};

/**
 * Get detailed token breakdown
 */
export const getTokenBreakdown = (user) => {
  const now = new Date();
  const planActive =
    user.subscription?.endDate && user.subscription.endDate > now;
  const daysRemaining = planActive
    ? Math.ceil((user.subscription.endDate - now) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    daily: {
      current: planActive ? user.dailyTokens?.current || 0 : 0,
      limit: user.dailyTokens?.limit || 100,
      usedToday: user.dailyTokens?.usedToday || 0,
      lastRefreshedAt: user.dailyTokens?.lastRefreshedAt,
    },
    purchased: {
      current: planActive ? user.purchasedTokens?.current || 0 : 0,
      total: user.purchasedTokens?.total || 0,
      used: user.purchasedTokens?.used || 0,
      lastPurchasedAt: user.purchasedTokens?.lastPurchasedAt,
    },
    bonus: {
      current: planActive ? user.bonusTokens?.current || 0 : 0,
      initial: user.bonusTokens?.initial || 0,
      used: user.bonusTokens?.used || 0,
      grantedAt: user.bonusTokens?.grantedAt,
    },
    prize: {
      current: planActive ? user.prizeTokens?.current || 0 : 0,
      used: user.prizeTokens?.used || 0,
      grantedBy: user.prizeTokens?.grantedBy,
      prizeType: user.prizeTokens?.prizeType,
      history: user.prizeTokens?.history || [],
    },
    total: planActive ? calculateTotalTokens(user) : 0,
    planExpiry: {
      isActive: planActive,
      endDate: user.subscription?.endDate,
      daysRemaining,
    },
  };
};

/**
 * Deduct tokens with priority: Daily → Purchased → Bonus → Prize
 */
export const deductTokens = async (
  userId,
  tokensToDeduct,
  reason = "resource_access",
) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check subscription is active
    const now = new Date();
    if (!user.subscription?.endDate || user.subscription.endDate < now) {
      throw new Error(
        "Subscription expired. Please renew to access resources.",
      );
    }

    // Check if user has enough tokens
    const availableTokens = calculateTotalTokens(user);
    if (availableTokens < tokensToDeduct) {
      throw new Error(
        `Insufficient tokens. Required: ${tokensToDeduct}, Available: ${availableTokens}`,
      );
    }

    let remaining = tokensToDeduct;
    const deductionBreakdown = {
      daily: 0,
      purchased: 0,
      bonus: 0,
      prize: 0,
    };

    // Step 1: Deduct from Daily Tokens
    if (remaining > 0 && user.dailyTokens.current > 0) {
      const deductFromDaily = Math.min(remaining, user.dailyTokens.current);
      user.dailyTokens.current -= deductFromDaily;
      user.dailyTokens.usedToday += deductFromDaily;
      deductionBreakdown.daily = deductFromDaily;
      remaining -= deductFromDaily;
    }

    // Step 2: Deduct from Purchased Tokens
    if (remaining > 0 && user.purchasedTokens.current > 0) {
      const deductFromPurchased = Math.min(
        remaining,
        user.purchasedTokens.current,
      );
      user.purchasedTokens.current -= deductFromPurchased;
      user.purchasedTokens.used += deductFromPurchased;
      deductionBreakdown.purchased = deductFromPurchased;
      remaining -= deductFromPurchased;
    }

    // Step 3: Deduct from Bonus Tokens
    if (remaining > 0 && user.bonusTokens.current > 0) {
      const deductFromBonus = Math.min(remaining, user.bonusTokens.current);
      user.bonusTokens.current -= deductFromBonus;
      user.bonusTokens.used += deductFromBonus;
      deductionBreakdown.bonus = deductFromBonus;
      remaining -= deductFromBonus;
    }

    // Step 4: Deduct from Prize Tokens
    if (remaining > 0 && user.prizeTokens.current > 0) {
      const deductFromPrize = Math.min(remaining, user.prizeTokens.current);
      user.prizeTokens.current -= deductFromPrize;
      user.prizeTokens.used += deductFromPrize;
      deductionBreakdown.prize = deductFromPrize;
      remaining -= deductFromPrize;
    }

    // Update statistics
    if (!user.tokenStats) {
      user.tokenStats = {
        totalUsed: 0,
        dailyUsed: 0,
        purchasedUsed: 0,
        bonusUsed: 0,
        prizeUsed: 0,
        planPeriodUsed: 0,
      };
    }

    user.tokenStats.totalUsed += tokensToDeduct;
    user.tokenStats.dailyUsed += deductionBreakdown.daily;
    user.tokenStats.purchasedUsed += deductionBreakdown.purchased;
    user.tokenStats.bonusUsed += deductionBreakdown.bonus;
    user.tokenStats.prizeUsed += deductionBreakdown.prize;
    user.tokenStats.planPeriodUsed += tokensToDeduct;

    // Update legacy fields for backward compatibility
    user.tokensUsedTotal = user.tokenStats.totalUsed;
    user.tokensUsedToday = user.dailyTokens.usedToday;

    // Update monthly stats (Legacy/Flat structure)
    user.monthlyTokensUsed = (user.monthlyTokensUsed || 0) + tokensToDeduct;
    if (user.monthlyTokensRemaining > 0) {
      user.monthlyTokensRemaining = Math.max(
        0,
        user.monthlyTokensRemaining - tokensToDeduct,
      );
    }

    user.tokens = calculateTotalTokens(user);

    await user.save();

    console.log(
      `✅ Deducted ${tokensToDeduct} tokens from ${user.email}:`,
      deductionBreakdown,
    );

    return {
      success: true,
      tokensDeducted: tokensToDeduct,
      breakdown: deductionBreakdown,
      remaining: getTokenBreakdown(user),
      reason,
    };
  } catch (error) {
    console.error("Token deduction error:", error);
    throw error;
  }
};

/**
 * Add purchased tokens to user's account
 */
export const addPurchasedTokens = async (userId, amount, transactionId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user has active subscription
    const now = new Date();
    if (!user.subscription?.endDate || user.subscription.endDate < now) {
      throw new Error("Active subscription required to purchase extra tokens");
    }

    // Initialize purchasedTokens if not exists
    if (!user.purchasedTokens) {
      user.purchasedTokens = {
        current: 0,
        total: 0,
        used: 0,
        lastPurchasedAt: null,
        expiresAt: null,
      };
    }

    // Add to purchased tokens
    user.purchasedTokens.current += amount;
    user.purchasedTokens.total += amount;
    user.purchasedTokens.lastPurchasedAt = now;
    user.purchasedTokens.expiresAt = user.subscription.endDate; // Expires with plan

    // Update legacy token field for backward compatibility
    user.tokens = calculateTotalTokens(user);

    await user.save();

    console.log(
      `✅ Added ${amount} purchased tokens to ${user.email}, ` +
        `valid until ${user.subscription.endDate.toISOString()}`,
    );

    // Send notification
    await createNotification(
      userId,
      "system",
      `🎉 ${amount} tokens added to your account! They're valid until your plan expires.`,
      null,
      null,
    );

    return {
      success: true,
      amount,
      currentBalance: user.purchasedTokens.current,
      totalPurchased: user.purchasedTokens.total,
      expiresAt: user.subscription.endDate,
    };
  } catch (error) {
    console.error("Add purchased tokens error:", error);
    throw error;
  }
};

/**
 * Grant prize tokens (valid until plan expires)
 */
export const grantPrizeTokens = async (
  userId,
  amount,
  prizeType,
  grantedBy = "system",
) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user has active subscription
    const now = new Date();
    if (!user.subscription?.endDate || user.subscription.endDate < now) {
      throw new Error(
        "User must have active subscription to receive prize tokens",
      );
    }

    // Initialize prizeTokens if not exists
    if (!user.prizeTokens) {
      user.prizeTokens = {
        current: 0,
        used: 0,
        grantedAt: null,
        expiresAt: null,
        grantedBy: null,
        prizeType: null,
        history: [],
      };
    }

    // Add to current prize tokens
    user.prizeTokens.current += amount;
    user.prizeTokens.grantedAt = now;
    user.prizeTokens.expiresAt = user.subscription.endDate; // Valid till plan end
    user.prizeTokens.grantedBy = grantedBy;
    user.prizeTokens.prizeType = prizeType;

    // Add to history
    if (!user.prizeTokens.history) {
      user.prizeTokens.history = [];
    }
    user.prizeTokens.history.push({
      amount,
      grantedAt: now,
      grantedBy,
      prizeType,
    });

    // Update legacy fields
    user.tokens = calculateTotalTokens(user);
    if (user.temporaryTokens) {
      user.temporaryTokens.amount = user.prizeTokens.current;
      user.temporaryTokens.expiresAt = user.subscription.endDate;
    }

    await user.save();

    console.log(
      `✅ Granted ${amount} prize tokens to ${user.email} (${prizeType}), ` +
        `valid until ${user.subscription.endDate.toISOString()}`,
    );

    return {
      success: true,
      amount,
      expiresAt: user.subscription.endDate,
      prizeType,
      totalPrizeTokens: user.prizeTokens.current,
    };
  } catch (error) {
    console.error("Grant prize tokens error:", error);
    throw error;
  }
};

/**
 * Clean expired tokens (when plan expires)
 */
export const cleanExpiredTokens = async (user) => {
  const now = new Date();

  if (!user.subscription?.endDate || user.subscription.endDate < now) {
    let cleaned = false;

    // Clean all tokens when plan expires
    if (user.dailyTokens?.current > 0) {
      console.log(
        `Expiring daily tokens for ${user.email}: ${user.dailyTokens.current}`,
      );
      user.dailyTokens.current = 0;
      cleaned = true;
    }

    if (user.purchasedTokens?.current > 0) {
      console.log(
        `Expiring purchased tokens for ${user.email}: ${user.purchasedTokens.current}`,
      );
      user.purchasedTokens.current = 0;
      cleaned = true;
    }

    if (user.bonusTokens?.current > 0) {
      console.log(
        `Expiring bonus tokens for ${user.email}: ${user.bonusTokens.current}`,
      );
      user.bonusTokens.current = 0;
      cleaned = true;
    }

    if (user.prizeTokens?.current > 0) {
      console.log(
        `Expiring prize tokens for ${user.email}: ${user.prizeTokens.current}`,
      );
      user.prizeTokens.current = 0;
      cleaned = true;
    }

    if (cleaned) {
      user.tokens = 0;
      user.temporaryTokens.amount = 0;
      await user.save();
    }

    return cleaned;
  }

  return false;
};
