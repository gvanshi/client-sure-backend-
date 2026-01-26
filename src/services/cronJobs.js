import cron from "node-cron";
import { User } from "../models/index.js";
import { cleanExpiredTokens } from "../utils/enhancedTokenUtils.js";
import {
  sendExpiryWarningEmail,
  sendSubscriptionExpiredEmail,
  sendRenewalReminderEmail,
} from "./subscriptionEmailService.js";

// Daily token refresh at 12:00 AM (midnight) IST
export const startTokenRefreshCron = () => {
  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        console.log("Starting daily token refresh...");

        const now = new Date();

        // Find all users with subscriptions (active or expired)
        const allUsers = await User.find({
          "subscription.planId": { $exists: true },
        }).populate("subscription.planId");

        let refreshedCount = 0;
        let renewedCount = 0;

        for (const user of allUsers) {
          const isActive =
            user.subscription.isActive &&
            user.subscription.endDate &&
            user.subscription.endDate > now;

          if (isActive) {
            // Active subscription - reset daily tokens only, keep purchased/bonus/prize
            const plan = user.subscription.planId;
            const dailyLimit = plan ? plan.dailyTokens : 100;

            // Initialize dailyTokens if not exists
            if (!user.dailyTokens) {
              user.dailyTokens = {
                current: dailyLimit,
                limit: dailyLimit,
                usedToday: 0,
                lastRefreshedAt: now,
              };
            } else {
              // Reset daily tokens
              user.dailyTokens.current = dailyLimit;
              user.dailyTokens.limit = dailyLimit;
              user.dailyTokens.usedToday = 0;
              user.dailyTokens.lastRefreshedAt = now;
            }

            // Reset daily stats in tokenStats
            if (user.tokenStats) {
              user.tokenStats.dailyUsed = 0;
            }

            // Update legacy fields for backward compatibility
            user.tokens = plan ? plan.dailyTokens : 100;
            user.tokensUsedToday = 0;
            user.subscription.lastRefreshedAt = now;

            // Reset daily community limits
            user.dailyLimits = {
              date: now,
              posts: 0,
              likes: 0,
              comments: 0,
            };

            // NOTE: purchased/bonus/prize tokens remain unchanged!

            await user.save();
            refreshedCount++;
          } else if (
            user.subscription.endDate &&
            user.subscription.endDate <= now
          ) {
            // Expired subscription - clean ALL tokens (daily, purchased, bonus, prize)
            console.log(`Plan expired for ${user.email}, cleaning all tokens`);

            await cleanExpiredTokens(user);

            // Deactivate subscription
            user.subscription.isActive = false;

            await user.save();
            renewedCount++;
          }
        }

        console.log(
          `Token refresh completed: ${refreshedCount} daily refreshed, ${renewedCount} plans renewed at ${now.toISOString()}`,
        );
      } catch (error) {
        console.error("Token refresh cron error:", error);
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );

  console.log(
    "Daily token refresh + auto plan renewal cron job started (12:00 AM IST)",
  );
};

// Subscription expiry monitoring at 02:00 IST
export const startSubscriptionExpiryCron = () => {
  cron.schedule(
    "0 2 * * *",
    async () => {
      try {
        console.log("Starting subscription expiry monitoring...");

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );

        // Find users with subscriptions
        const allUsers = await User.find({
          "subscription.endDate": { $exists: true },
        }).populate("subscription.planId");

        let warningsSent = 0;
        let expiredNotified = 0;
        let remindersSet = 0;
        let deactivatedCount = 0;

        for (const user of allUsers) {
          if (!user.subscription.endDate) continue;

          const endDate = new Date(user.subscription.endDate);
          const endDateOnly = new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate(),
          );
          const diffTime = endDateOnly.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // Pre-expiry warnings (7, 3, 1 days before)
          if ([7, 3, 1].includes(diffDays) && user.subscription.endDate > now) {
            await sendExpiryWarningEmail(user, diffDays);
            warningsSent++;
            console.log(
              `⚠️ Expiry warning sent to ${user.email} (${diffDays} days left)`,
            );
          }

          // Subscription expired today
          else if (diffDays === 0 && user.subscription.endDate <= now) {
            // Deactivate subscription
            user.tokens = 0;
            user.tokensUsedToday = 0;
            user.monthlyTokensRemaining = 0;
            user.subscription.isActive = false;

            await user.save();
            await sendSubscriptionExpiredEmail(user);

            deactivatedCount++;
            expiredNotified++;
            console.log(
              `🔴 Subscription expired and deactivated for ${user.email}`,
            );
          }

          // Post-expiry reminders (3, 7, 14 days after expiry)
          else if (
            [-3, -7, -14].includes(diffDays) &&
            user.subscription.endDate < now
          ) {
            const daysExpired = Math.abs(diffDays);
            await sendRenewalReminderEmail(user, daysExpired);
            remindersSet++;
            console.log(
              `💙 Renewal reminder sent to ${user.email} (${daysExpired} days expired)`,
            );
          }
        }

        console.log(
          `Subscription monitoring completed: ${warningsSent} warnings, ${expiredNotified} expired notifications, ${remindersSet} reminders, ${deactivatedCount} deactivated at ${now.toISOString()}`,
        );
      } catch (error) {
        console.error("Subscription expiry monitoring error:", error);
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );

  console.log("Subscription expiry monitoring cron job started (02:00 IST)");
};

// Manual token refresh function (for testing)
export const manualTokenRefresh = async () => {
  try {
    console.log("Manual token refresh started...");

    const now = new Date();

    const activeUsers = await User.find({
      "subscription.isActive": true,
      "subscription.endDate": { $gt: now },
      "subscription.planId": { $exists: true },
    }).populate("subscription.planId");

    let refreshedCount = 0;

    for (const user of activeUsers) {
      // Reset ONLY daily tokens, keep monthly tokens as is
      const plan = user.subscription.planId;
      user.tokens = plan ? plan.dailyTokens : 100;
      user.tokensUsedToday = 0;
      user.subscription.lastRefreshedAt = now;

      await user.save();
      refreshedCount++;

      console.log(
        `Refreshed daily tokens for ${user.email}: ${user.tokens} tokens (Monthly: ${user.monthlyTokensRemaining})`,
      );
    }

    console.log(`Manual refresh completed: ${refreshedCount} users refreshed`);
    return { success: true, refreshedCount };
  } catch (error) {
    console.error("Manual token refresh error:", error);
    return { success: false, error: error.message };
  }
};

// Manual subscription expiry check function
export const manualSubscriptionCheck = async (userEmail = null) => {
  try {
    console.log("Manual subscription expiry check started...");

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const query = userEmail
      ? { email: userEmail, "subscription.endDate": { $exists: true } }
      : { "subscription.endDate": { $exists: true } };

    const users = await User.find(query).populate("subscription.planId");

    const results = {
      warnings: [],
      expired: [],
      reminders: [],
      deactivated: [],
    };

    for (const user of users) {
      if (!user.subscription.endDate) continue;

      const endDate = new Date(user.subscription.endDate);
      const endDateOnly = new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
      );
      const diffTime = endDateOnly.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if ([7, 3, 1].includes(diffDays) && user.subscription.endDate > now) {
        await sendExpiryWarningEmail(user, diffDays);
        results.warnings.push({ email: user.email, daysLeft: diffDays });
      } else if (diffDays === 0 && user.subscription.endDate <= now) {
        user.tokens = 0;
        user.tokensUsedToday = 0;
        user.monthlyTokensRemaining = 0;
        user.subscription.isActive = false;

        await user.save();
        await sendSubscriptionExpiredEmail(user);

        results.expired.push({ email: user.email });
        results.deactivated.push({ email: user.email });
      } else if (
        [-3, -7, -14].includes(diffDays) &&
        user.subscription.endDate < now
      ) {
        const daysExpired = Math.abs(diffDays);
        await sendRenewalReminderEmail(user, daysExpired);
        results.reminders.push({ email: user.email, daysExpired });
      }
    }

    console.log("Manual subscription check completed:", results);
    return { success: true, results };
  } catch (error) {
    console.error("Manual subscription check error:", error);
    return { success: false, error: error.message };
  }
};

// Manual plan renewal function
export const manualPlanRenewal = async (userEmail) => {
  try {
    console.log(`Manual plan renewal for: ${userEmail}`);

    const user = await User.findOne({ email: userEmail }).populate(
      "subscription.planId",
    );

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (!user.subscription.planId) {
      return { success: false, error: "No plan found" };
    }

    const plan = user.subscription.planId;
    const monthlyAllocation = plan.durationDays * plan.dailyTokens;
    const now = new Date();

    // Reset monthly tokens (plan renewal)
    user.tokens = plan.dailyTokens;
    user.tokensUsedToday = 0;
    user.monthlyTokensTotal = monthlyAllocation;
    user.monthlyTokensUsed = 0;
    user.monthlyTokensRemaining = monthlyAllocation;

    // Extend subscription
    user.subscription.startDate = now;
    user.subscription.endDate = new Date(
      now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000,
    );
    user.subscription.lastRefreshedAt = now;

    await user.save();

    console.log(
      `✅ Plan renewed for ${userEmail}: ${monthlyAllocation} monthly tokens`,
    );
    return {
      success: true,
      monthlyTokens: monthlyAllocation,
      newEndDate: user.subscription.endDate,
    };
  } catch (error) {
    console.error("Manual plan renewal error:", error);
    return { success: false, error: error.message };
  }
};
