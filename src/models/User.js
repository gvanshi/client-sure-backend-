import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    avatar: {
      type: String,
      required: false,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    passwordHash: {
      type: String,
      required: false, // Will be set after email verification
    },
    tokens: {
      type: Number,
      default: 0,
    },
    tokensUsedTotal: {
      type: Number,
      default: 0,
    },
    tokensUsedToday: {
      type: Number,
      default: 0,
    },
    monthlyTokensTotal: {
      type: Number,
      default: 0,
    },
    monthlyTokensUsed: {
      type: Number,
      default: 0,
    },
    monthlyTokensRemaining: {
      type: Number,
      default: 0,
    },
    // === ENHANCED TOKEN SYSTEM (New) ===
    // Daily Tokens - Refreshed every day, valid until plan expires
    dailyTokens: {
      current: {
        type: Number,
        default: 0,
      },
      limit: {
        type: Number,
        default: 100,
      },
      usedToday: {
        type: Number,
        default: 0,
      },
      lastRefreshedAt: {
        type: Date,
        default: Date.now,
      },
    },
    // Purchased Tokens - Bought via extra token packages, valid until plan expires
    purchasedTokens: {
      current: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
      used: {
        type: Number,
        default: 0,
      },
      lastPurchasedAt: {
        type: Date,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },
    // Bonus Tokens - One-time grant on subscription purchase, valid until plan expires
    bonusTokens: {
      current: {
        type: Number,
        default: 0,
      },
      initial: {
        type: Number,
        default: 0,
      },
      used: {
        type: Number,
        default: 0,
      },
      grantedAt: {
        type: Date,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },
    // Prize Tokens - Earned from contests/referrals, valid until plan expires
    prizeTokens: {
      current: {
        type: Number,
        default: 0,
      },
      used: {
        type: Number,
        default: 0,
      },
      grantedAt: {
        type: Date,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      grantedBy: {
        type: String,
        default: null,
      },
      prizeType: {
        type: String,
        default: null,
      },
      history: [
        {
          amount: Number,
          grantedAt: Date,
          grantedBy: String,
          prizeType: String,
        },
      ],
    },
    // Token Usage Statistics
    tokenStats: {
      totalUsed: {
        type: Number,
        default: 0,
      },
      dailyUsed: {
        type: Number,
        default: 0,
      },
      purchasedUsed: {
        type: Number,
        default: 0,
      },
      bonusUsed: {
        type: Number,
        default: 0,
      },
      prizeUsed: {
        type: Number,
        default: 0,
      },
      planPeriodUsed: {
        type: Number,
        default: 0,
      },
    },
    subscription: {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Plan",
        required: false,
      },
      startDate: {
        type: Date,
        required: false,
      },
      endDate: {
        type: Date,
        required: false,
      },
      isActive: {
        type: Boolean,
        default: true,
      },
      dailyTokens: {
        type: Number,
        default: 100,
      },
      monthlyAllocation: {
        type: Number,
        default: 0,
      },
      currentMonth: {
        type: Number,
        default: () => new Date().getMonth(),
      },
      currentYear: {
        type: Number,
        default: () => new Date().getFullYear(),
      },
      lastRefreshedAt: {
        type: Date,
        default: Date.now,
      },
    },
    resetTokenHash: {
      type: String,
      required: false,
    },
    resetTokenExpires: {
      type: Date,
      required: false,
    },
    accessedResources: [
      {
        resourceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Resource",
          required: true,
        },
        accessedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    accessedLeads: [
      {
        leadId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Lead",
        },
        accessedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    points: {
      type: Number,
      default: 0,
    },
    communityActivity: {
      postsCreated: {
        type: Number,
        default: 0,
      },
      commentsMade: {
        type: Number,
        default: 0,
      },
      likesGiven: {
        type: Number,
        default: 0,
      },
      likesReceived: {
        type: Number,
        default: 0,
      },
    },
    dailyLimits: {
      date: {
        type: Date,
        default: () => new Date().toDateString(),
      },
      posts: {
        type: Number,
        default: 0,
        max: 10,
      },
      likes: {
        type: Number,
        default: 0,
        max: 10,
      },
      comments: {
        type: Number,
        default: 0,
        max: 10,
      },
    },
    temporaryTokens: {
      amount: {
        type: Number,
        default: 0,
      },
      grantedAt: {
        type: Date,
        default: null,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      grantedBy: {
        type: String,
        default: null,
      },
      prizeType: {
        type: String,
        default: null,
      },
    },
    userReferenceId: {
      type: String,
      unique: true,
      sparse: true,
    },
    notifications: [
      {
        type: {
          type: String,
          enum: [
            "new_post",
            "new_comment",
            "post_like",
            "post_unlike",
            "prize_tokens_awarded",
            "milestone_reward",
            "system",
          ],
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        postId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Feedback",
          required: false,
        },
        fromUser: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        isRead: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    unreadNotificationCount: {
      type: Number,
      default: 0,
    },
    // Milestone Rewards System - Cycle Based (Repeatable)
    milestoneRewards: {
      referral8Cycles: {
        type: Number,
        default: 0,
      },
      referral8LastReset: {
        type: Date,
        required: false,
      },
      referral15Cycles: {
        type: Number,
        default: 0,
      },
      referral15LastReset: {
        type: Date,
        required: false,
      },
      referral25Cycles: {
        type: Number,
        default: 0,
      },
      referral25LastReset: {
        type: Date,
        required: false,
      },
      totalTokensEarned: {
        type: Number,
        default: 0,
      },
    },
    // Referral System Fields
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      length: 12,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    referrals: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        isActive: {
          type: Boolean,
          default: false,
        },
        subscriptionStatus: {
          type: String,
          enum: ["pending", "active", "expired", "cycled"],
          default: "pending",
        },
      },
    ],
    referralStats: {
      totalReferrals: {
        type: Number,
        default: 0,
      },
      activeReferrals: {
        type: Number,
        default: 0,
      },
      totalEarnings: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for Analytics Optimization
userSchema.index({ "subscription.planId": 1 });

export default mongoose.model("User", userSchema);
