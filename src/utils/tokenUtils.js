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
    if (user.tokens >= tokensToDeduct) {
      user.tokens -= tokensToDeduct;
    } else {
      const remainingToDeduct = tokensToDeduct - user.tokens;
      user.tokens = 0;

      // Deduct from temporary tokens
      if (
        user.temporaryTokens &&
        user.temporaryTokens.amount >= remainingToDeduct
      ) {
        user.temporaryTokens.amount -= remainingToDeduct;
      }
    }

    user.tokensUsedToday = (user.tokensUsedToday || 0) + tokensToDeduct;
    user.tokensUsedTotal = (user.tokensUsedTotal || 0) + tokensToDeduct;

    // Update monthly stats
    user.monthlyTokensUsed = (user.monthlyTokensUsed || 0) + tokensToDeduct;
    if (user.monthlyTokensRemaining > 0) {
      user.monthlyTokensRemaining = Math.max(
        0,
        user.monthlyTokensRemaining - tokensToDeduct,
      );
    }

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
