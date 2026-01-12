import User from "../../models/User.js";
import {
  calculateEffectiveTokens,
  cleanExpiredTokens,
} from "../../utils/tokenUtils.js";
import { createNotification } from "../../utils/notificationUtils.js";

import Admin from "../../models/Admin.js";
import PrizeDistribution from "../../models/PrizeDistribution.js";

// Award prize tokens to user
export const awardPrizeTokens = async (req, res) => {
  try {
    const { userId, tokenAmount, prizeType, position } = req.body;
    const adminUsername = req.admin?.username || "admin";

    // Get Admin ID: verify if it's in the token, otherwise find by username
    let adminId = req.admin?.id;
    if (!adminId) {
      const admin = await Admin.findOne({ username: adminUsername });
      if (admin) adminId = admin._id;
    }

    // Validate input
    if (!userId || !tokenAmount || !prizeType) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, tokenAmount, prizeType",
      });
    }

    if (tokenAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Token amount must be greater than 0",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    // Check if user already has active prize tokens
    if (
      user.temporaryTokens &&
      user.temporaryTokens.amount > 0 &&
      user.temporaryTokens.expiresAt
    ) {
      const now = new Date();
      const expiryTime = new Date(user.temporaryTokens.expiresAt);

      if (now <= expiryTime) {
        return res.status(400).json({
          success: false,
          error: "User already has active prize tokens",
          currentTokens: user.temporaryTokens.amount,
          expiresAt: user.temporaryTokens.expiresAt,
          prizeType: user.temporaryTokens.prizeType,
        });
      }
    }

    // Set 24-hour temporary tokens
    const now = new Date();
    const expiryTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    user.temporaryTokens = {
      amount: tokenAmount,
      grantedAt: now,
      expiresAt: expiryTime,
      grantedBy: adminUsername,
      prizeType: prizeType,
    };

    await user.save();

    // Create PrizeDistribution record if we have adminId and valid position
    if (adminId && position && [1, 2, 3].includes(position)) {
      try {
        await PrizeDistribution.create({
          userId: user._id,
          position: position,
          tokenAmount: tokenAmount,
          period: "custom", // Treating manual single awards as custom/ad-hoc
          dateRange: {
            start: now,
            end: now,
          },
          awardedAt: now,
          awardedBy: adminId,
          notificationSent: true, // We are sending notification below
          contestName: `Individual Award - ${prizeType}`,
        });
        console.log("✅ PrizeDistribution record created");
      } catch (distError) {
        console.error("Error creating PrizeDistribution record:", distError);
        // Don't fail the main request
      }
    }

    // Create notification for user
    try {
      const notificationMessage = `🎉 You have been rewarded ${tokenAmount} tokens as ${prizeType}! Valid for 24 hours.`;
      const notificationCreated = await createNotification(
        user._id,
        "prize_tokens_awarded",
        notificationMessage,
        null, // No specific post ID
        null // System notification
      );

      if (notificationCreated) {
        console.log(
          `✅ Notification successfully sent to ${user.email} for prize tokens`
        );
      } else {
        console.log(`❌ Failed to send notification to ${user.email}`);
      }
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError);
      // Don't fail the main operation if notification fails
    }

    console.log(
      `✅ Prize tokens awarded: ${tokenAmount} ${prizeType} tokens to ${user.email} by ${adminUsername}`
    );

    res.json({
      success: true,
      message: `${tokenAmount} ${prizeType} tokens awarded to ${user.name}. Notification sent successfully.`,
      tokenAmount,
      expiresAt: expiryTime,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      notification: {
        sent: true,
        message: `Prize tokens notification sent to ${user.email}`,
      },
    });
  } catch (error) {
    console.error("Award prize tokens error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to award prize tokens",
    });
  }
};

// Get user's current token status
export const getUserTokenStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    const effectiveTokens = calculateEffectiveTokens(user);

    let timeRemaining = 0;
    if (user.temporaryTokens && user.temporaryTokens.expiresAt) {
      timeRemaining = Math.max(
        0,
        new Date(user.temporaryTokens.expiresAt) - new Date()
      );
    }

    res.json({
      success: true,
      dailyTokens: user.tokens || 0,
      temporaryTokens: {
        amount: user.temporaryTokens?.amount || 0,
        grantedAt: user.temporaryTokens?.grantedAt,
        expiresAt: user.temporaryTokens?.expiresAt,
        grantedBy: user.temporaryTokens?.grantedBy,
        prizeType: user.temporaryTokens?.prizeType,
      },
      effectiveTokens,
      timeRemaining,
    });
  } catch (error) {
    console.error("Get user token status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch token status",
    });
  }
};
