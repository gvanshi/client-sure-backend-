import User from "../models/User.js";

// Calculate effective tokens (daily + temporary)
export const calculateEffectiveTokens = (user) => {
  let effectiveTokens = user.tokens || 0; // Base daily tokens

  // Add temporary tokens if still valid
  if (
    user.temporaryTokens &&
    user.temporaryTokens.amount > 0 &&
    user.temporaryTokens.expiresAt
  ) {
    const now = new Date();
    const expiryTime = new Date(user.temporaryTokens.expiresAt);

    if (now <= expiryTime) {
      effectiveTokens += user.temporaryTokens.amount;
    }
  }

  return effectiveTokens;
};

// Deduct tokens with priority (daily first, then temporary)
export const deductTokensWithPriority = async (userId, tokensToDeduct) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const effectiveTokens = calculateEffectiveTokens(user);

    if (effectiveTokens < tokensToDeduct) {
      throw new Error("Insufficient tokens");
    }

    // Priority: Daily tokens first, then temporary tokens
    let deductFromDaily = 0;
    let deductFromPrize = 0;

    // Determine deduction amounts
    if (user.tokens >= tokensToDeduct) {
      user.tokens -= tokensToDeduct;
      deductFromDaily = tokensToDeduct;
    } else {
      deductFromDaily = user.tokens;
      const remainingToDeduct = tokensToDeduct - user.tokens;
      user.tokens = 0;

      // Deduct from temporary tokens
      if (
        user.temporaryTokens &&
        user.temporaryTokens.amount >= remainingToDeduct
      ) {
        user.temporaryTokens.amount -= remainingToDeduct;
        deductFromPrize = remainingToDeduct;
      }
    }

    user.tokensUsedToday = (user.tokensUsedToday || 0) + tokensToDeduct;
    user.tokensUsedTotal = (user.tokensUsedTotal || 0) + tokensToDeduct;

    // Update monthly stats
    console.log(
      `[DEBUG] Before Update - MonthlyRemaining: ${user.monthlyTokensRemaining}, MonthlyUsed: ${user.monthlyTokensUsed}, Deduct: ${tokensToDeduct}`,
    );

    user.monthlyTokensUsed = (user.monthlyTokensUsed || 0) + tokensToDeduct;
    if (user.monthlyTokensRemaining > 0) {
      user.monthlyTokensRemaining = Math.max(
        0,
        user.monthlyTokensRemaining - tokensToDeduct,
      );
    }

    // START of Sync Enhanced Token Stats
    // Ensure nested objects exist to avoid undefined errors
    if (!user.dailyTokens) {
      user.dailyTokens = { current: 0, limit: 100, usedToday: 0 };
    }
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

    // Sync Daily Enhanced Tokens
    if (deductFromDaily > 0) {
      // Force sync with legacy source of truth to heal 0 values
      user.dailyTokens.current = user.tokens;
      user.dailyTokens.usedToday =
        (user.dailyTokens.usedToday || 0) + deductFromDaily;
      user.tokenStats.dailyUsed =
        (user.tokenStats.dailyUsed || 0) + deductFromDaily;
    }

    // Sync Prize Enhanced Tokens
    if (deductFromPrize > 0) {
      if (user.prizeTokens && user.prizeTokens.current >= deductFromPrize) {
        user.prizeTokens.current -= deductFromPrize;
        user.prizeTokens.used = (user.prizeTokens.used || 0) + deductFromPrize;
        user.tokenStats.prizeUsed =
          (user.tokenStats.prizeUsed || 0) + deductFromPrize;
        // Legacy prize token sync
        if (user.temporaryTokens) {
          user.temporaryTokens.amount = user.prizeTokens.current;
        }
      }
    }

    // General Stats
    user.tokenStats.totalUsed =
      (user.tokenStats.totalUsed || 0) + tokensToDeduct;
    user.tokenStats.planPeriodUsed =
      (user.tokenStats.planPeriodUsed || 0) + tokensToDeduct;

    console.log(
      `[DEBUG] After Update - MonthlyRemaining: ${user.monthlyTokensRemaining}, MonthlyUsed: ${user.monthlyTokensUsed}, DailyEnhancedCurrent: ${user.dailyTokens.current}`,
    );

    await user.save();

    return {
      success: true,
      tokensDeducted: tokensToDeduct,
      remainingDaily: user.tokens,
      remainingTemporary: user.temporaryTokens?.amount || 0,
      totalRemaining: calculateEffectiveTokens(user),
    };
  } catch (error) {
    throw error;
  }
};

// Check if temporary tokens are expired and clean them
export const cleanExpiredTokens = async (user) => {
  if (user.temporaryTokens && user.temporaryTokens.expiresAt) {
    const now = new Date();
    const expiryTime = new Date(user.temporaryTokens.expiresAt);

    if (now > expiryTime) {
      user.temporaryTokens = {
        amount: 0,
        grantedAt: null,
        expiresAt: null,
        grantedBy: null,
        prizeType: null,
      };
      await user.save();
      return true; // Tokens were expired and cleaned
    }
  }
  return false; // No cleanup needed
};
