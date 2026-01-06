import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import { User } from "../models/index.js";
import {
  addSocialAccount,
  deleteSocialAccount,
  getSocialAccounts,
} from "../controller/UserController.js/socialAccountController.js";
import { getPlanStatus } from "../controller/UserController.js/planController.js";

const router = express.Router();

// GET /api/user/profile - Get user profile (protected)
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate(
      "subscription.planId"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const now = new Date();
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      tokens: user.tokens,
      tokensUsedTotal: user.tokensUsedTotal,
      subscription: {
        planName: user.subscription.planId?.name,
        dailyTokens: user.subscription.dailyTokens,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        isActive: user.subscription.endDate > now,
        lastRefreshedAt: user.subscription.lastRefreshedAt,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/user/dashboard - Dashboard data (protected)
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate(
      "subscription.planId"
    );

    res.json({
      user: {
        name: user.name,
        email: user.email,
        tokens: user.tokens,
        tokensUsedTotal: user.tokensUsedTotal,
      },
      subscription: {
        planName: user.subscription.planId?.name,
        dailyTokens: user.subscription.dailyTokens,
        endDate: user.subscription.endDate,
        daysRemaining: Math.ceil(
          (user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)
        ),
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/social-accounts", authenticateToken, getSocialAccounts);
router.post("/social-accounts", authenticateToken, addSocialAccount);
router.delete("/social-accounts/:id", authenticateToken, deleteSocialAccount);

// GET /api/user/plan-status - Get user's plan status (protected)
router.get("/plan-status", authenticateToken, async (req, res) => {
  req.params.userId = req.user.id;
  await getPlanStatus(req, res);
});

export default router;
