import { User, PrizeDistribution, PrizeTemplate } from "../../models/index.js";
import { sendEmail } from "../../utils/emailUtils.js";

// GET /api/admin/prize-templates
export const getPrizeTemplates = async (req, res) => {
  try {
    const templates = await PrizeTemplate.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.json({ success: true, templates });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/admin/prize-templates
export const createPrizeTemplate = async (req, res) => {
  try {
    const { name, period, prizes } = req.body;
    const adminId = req.user.id;

    const template = new PrizeTemplate({
      name,
      period,
      prizes,
      createdBy: adminId,
    });

    await template.save();
    res.json({ success: true, template });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/leaderboard/filtered
export const getFilteredLeaderboard = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    let dateFilter = {};
    const now = new Date();

    if (period === "weekly") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      dateFilter = { createdAt: { $gte: weekStart, $lte: weekEnd } };
    } else if (period === "monthly") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      dateFilter = { createdAt: { $gte: monthStart, $lte: monthEnd } };
    } else if (period === "custom" && startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    // Get users with community activity in the specified period
    const users = await User.aggregate([
      {
        $lookup: {
          from: "posts",
          localField: "_id",
          foreignField: "user_id",
          as: "posts",
          pipeline: dateFilter.createdAt ? [{ $match: dateFilter }] : [],
        },
      },
      {
        $lookup: {
          from: "comments",
          localField: "_id",
          foreignField: "user_id",
          as: "comments",
          pipeline: dateFilter.createdAt ? [{ $match: dateFilter }] : [],
        },
      },
      {
        $addFields: {
          periodPoints: {
            $add: [
              { $multiply: [{ $size: "$posts" }, 5] }, // 5 points per post
              { $multiply: [{ $size: "$comments" }, 2] }, // 2 points per comment
            ],
          },
        },
      },
      {
        $match: {
          periodPoints: { $gt: 0 },
        },
      },
      {
        $sort: { periodPoints: -1 },
      },
      {
        $limit: 50,
      },
      {
        $project: {
          name: 1,
          email: 1,
          avatar: 1,
          points: "$periodPoints",
          communityActivity: {
            postsCreated: { $size: "$posts" },
            commentsMade: { $size: "$comments" },
          },
        },
      },
    ]);

    res.json({
      success: true,
      leaderboard: users,
      period,
      dateRange: dateFilter.createdAt
        ? {
            start: dateFilter.createdAt.$gte,
            end: dateFilter.createdAt.$lte,
          }
        : null,
    });
  } catch (error) {
    console.error("Filtered leaderboard error:", error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/admin/distribute-prizes
export const distributePrizes = async (req, res) => {
  try {
    const { winners, period, dateRange, contestName } = req.body;
    const adminId = req.user.id;

    const distributions = [];

    for (const winner of winners) {
      const { userId, position, tokenAmount } = winner;

      // Add tokens to user account
      const user = await User.findById(userId);
      if (!user) continue;

      user.tokens = (user.tokens || 0) + tokenAmount;
      await user.save();

      // Create prize distribution record
      const distribution = new PrizeDistribution({
        userId,
        position,
        tokenAmount,
        period,
        dateRange: {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end),
        },
        awardedBy: adminId,
        contestName,
      });

      await distribution.save();
      distributions.push(distribution);

      // Send notification email
      const positionText =
        position === 1 ? "1st" : position === 2 ? "2nd" : "3rd";
      const emailSubject = `🏆 Congratulations! You won ${positionText} place in ${contestName}`;
      const emailBody = `
        <h2>🎉 Congratulations ${user.name}!</h2>
        <p>You have won <strong>${positionText} place</strong> in the <strong>${contestName}</strong>!</p>
        <p>🎁 <strong>Prize:</strong> ${tokenAmount} tokens have been added to your account.</p>
        <p>Keep up the great work in our community!</p>
        <p>Best regards,<br>Client Sure Team</p>
      `;

      try {
        await sendEmail(user.email, emailSubject, emailBody);
        distribution.emailSent = true;
        await distribution.save();
      } catch (emailError) {
        console.error("Email send error:", emailError);
      }
    }

    res.json({
      success: true,
      message: `Prizes distributed to ${winners.length} winners`,
      distributions,
    });
  } catch (error) {
    console.error("Prize distribution error:", error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/prize-history
export const getPrizeHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const history = await PrizeDistribution.find()
      .populate("userId", "name email")
      .populate("awardedBy", "name")
      .sort({ awardedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await PrizeDistribution.countDocuments();

    res.json({
      success: true,
      history,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/prize-analytics
export const getPrizeAnalytics = async (req, res) => {
  try {
    const now = new Date();

    // This week
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [weeklyStats, monthlyStats, totalStats] = await Promise.all([
      PrizeDistribution.aggregate([
        { $match: { awardedAt: { $gte: weekStart } } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: "$tokenAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      PrizeDistribution.aggregate([
        { $match: { awardedAt: { $gte: monthStart } } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: "$tokenAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      PrizeDistribution.aggregate([
        {
          $group: {
            _id: null,
            totalTokens: { $sum: "$tokenAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      analytics: {
        thisWeek: weeklyStats[0] || { totalTokens: 0, count: 0 },
        thisMonth: monthlyStats[0] || { totalTokens: 0, count: 0 },
        allTime: totalStats[0] || { totalTokens: 0, count: 0 },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/prize-analytics/filtered
export const getFilteredPrizeAnalytics = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    // Calculate date range (same logic as getFilteredLeaderboard)
    let dateFilter = {};
    const now = new Date();

    if (period === "weekly") {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      dateFilter = { awardedAt: { $gte: weekStart, $lte: weekEnd } };
    } else if (period === "monthly") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );

      dateFilter = { awardedAt: { $gte: monthStart, $lte: monthEnd } };
    } else if (period === "custom" && startDate && endDate) {
      dateFilter = {
        awardedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    // Aggregate statistics for the period
    const stats = await PrizeDistribution.aggregate([
      { $match: dateFilter.awardedAt ? dateFilter : {} },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: "$tokenAmount" },
          totalAwards: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" },
          // Breakdown by position
          firstPrizeCount: {
            $sum: { $cond: [{ $eq: ["$position", 1] }, 1, 0] },
          },
          firstPrizeTokens: {
            $sum: { $cond: [{ $eq: ["$position", 1] }, "$tokenAmount", 0] },
          },
          secondPrizeCount: {
            $sum: { $cond: [{ $eq: ["$position", 2] }, 1, 0] },
          },
          secondPrizeTokens: {
            $sum: { $cond: [{ $eq: ["$position", 2] }, "$tokenAmount", 0] },
          },
          thirdPrizeCount: {
            $sum: { $cond: [{ $eq: ["$position", 3] }, 1, 0] },
          },
          thirdPrizeTokens: {
            $sum: { $cond: [{ $eq: ["$position", 3] }, "$tokenAmount", 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalTokens: 0,
      totalAwards: 0,
      uniqueUsers: [],
      firstPrizeCount: 0,
      firstPrizeTokens: 0,
      secondPrizeCount: 0,
      secondPrizeTokens: 0,
      thirdPrizeCount: 0,
      thirdPrizeTokens: 0,
    };

    // Get active tokens (prize tokens that haven't expired)
    const activeTokensStats = await User.aggregate([
      {
        $match: {
          "temporaryTokens.expiresAt": { $gt: new Date() },
          "temporaryTokens.amount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalActiveTokens: { $sum: "$temporaryTokens.amount" },
        },
      },
    ]);

    res.json({
      success: true,
      analytics: {
        totalUsersRewarded: result.uniqueUsers.length,
        totalTokensDistributed: result.totalTokens,
        totalAwardsGiven: result.totalAwards,
        activeTokensNow: activeTokensStats[0]?.totalActiveTokens || 0,
        breakdown: {
          firstPrize: {
            count: result.firstPrizeCount,
            totalTokens: result.firstPrizeTokens,
          },
          secondPrize: {
            count: result.secondPrizeCount,
            totalTokens: result.secondPrizeTokens,
          },
          thirdPrize: {
            count: result.thirdPrizeCount,
            totalTokens: result.thirdPrizeTokens,
          },
        },
        period,
        dateRange: dateFilter.awardedAt || null,
      },
    });
  } catch (error) {
    console.error("Filtered prize analytics error:", error);
    res.status(500).json({ error: error.message });
  }
};
