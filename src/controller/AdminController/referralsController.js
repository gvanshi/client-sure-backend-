import User from '../../models/User.js';
import Plan from '../../models/Plan.js';
import { getCycleStatistics } from '../../utils/referralUtils.js';

// GET /api/admin/referrals/analytics
export const getReferralAnalytics = async (req, res) => {
  try {
    const [analytics] = await User.aggregate([
      {
        $facet: {
          referrers: [
            { $match: { 'referralStats.totalReferrals': { $gt: 0 } } },
            { $count: 'count' }
          ],
          totalReferrals: [
            { $match: { 'referralStats.totalReferrals': { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$referralStats.totalReferrals' } } }
          ],
          activeReferrals: [
            { $match: { 'referralStats.activeReferrals': { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$referralStats.activeReferrals' } } }
          ],
          referredUsers: [
            { $match: { referredBy: { $exists: true, $ne: null } } },
            { $count: 'count' }
          ],
          milestone8Cycles: [
            { $group: { _id: null, total: { $sum: '$milestoneRewards.referral8Cycles' } } }
          ],
          milestone15Cycles: [
            { $group: { _id: null, total: { $sum: '$milestoneRewards.referral15Cycles' } } }
          ],
          milestone25Cycles: [
            { $group: { _id: null, total: { $sum: '$milestoneRewards.referral25Cycles' } } }
          ],
          totalMilestoneTokens: [
            { $group: { _id: null, total: { $sum: '$milestoneRewards.totalTokensEarned' } } }
          ]
        }
      }
    ]);

    const totalReferrers = analytics.referrers[0]?.count || 0;
    const totalReferrals = analytics.totalReferrals[0]?.total || 0;
    const activeReferrals = analytics.activeReferrals[0]?.total || 0;
    const referredUsers = analytics.referredUsers[0]?.count || 0;
    const conversionRate = totalReferrals > 0 ? ((activeReferrals / totalReferrals) * 100).toFixed(1) : 0;
    
    const milestone8Cycles = analytics.milestone8Cycles[0]?.total || 0;
    const milestone15Cycles = analytics.milestone15Cycles[0]?.total || 0;
    const milestone25Cycles = analytics.milestone25Cycles[0]?.total || 0;
    const totalMilestoneTokens = analytics.totalMilestoneTokens[0]?.total || 0;
    const totalCycles = milestone8Cycles + milestone15Cycles + milestone25Cycles;

    // Get additional cycle statistics
    const cycleStats = await getCycleStatistics();

    res.json({
      success: true,
      data: {
        totalReferrers,
        totalReferrals,
        activeReferrals,
        referredUsers,
        conversionRate: `${conversionRate}%`,
        cycles: {
          total8Cycles: milestone8Cycles,
          total15Cycles: milestone15Cycles,
          total25Cycles: milestone25Cycles,
          totalCycles: totalCycles,
          totalTokensDistributed: totalMilestoneTokens,
          averageCyclesPerUser: cycleStats?.avgCyclesPerUser?.toFixed(1) || '0.0'
        }
      }
    });
  } catch (error) {
    console.error('Get referral analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
};

// GET /api/admin/referrals/referrers
export const getReferrers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let matchQuery = { 'referralStats.totalReferrals': { $gt: 0 } };

    if (search) {
      matchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search, $options: 'i' } }
      ];
    }

    if (status !== 'all') {
      matchQuery['subscription.isActive'] = status === 'active';
    }

    const referrers = await User.find(matchQuery)
      .populate('referrals.userId', 'name email subscription createdAt')
      .populate('subscription.planId', 'name price')
      .select('name email referralCode referralStats referrals subscription createdAt milestoneRewards temporaryTokens')
      .sort({ 'referralStats.totalReferrals': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(matchQuery);

    const formattedReferrers = referrers.map(user => {
      const now = new Date();
      const hasActiveTokens = user.temporaryTokens?.expiresAt && new Date(user.temporaryTokens.expiresAt) > now;
      const timeUntilExpiry = hasActiveTokens 
        ? Math.ceil((new Date(user.temporaryTokens.expiresAt) - now) / (1000 * 60 * 60)) 
        : 0;

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        referralCode: user.referralCode,
        referralStats: user.referralStats,
        subscription: {
          planName: user.subscription.planId?.name || 'No Plan',
          isActive: user.subscription.isActive,
          endDate: user.subscription.endDate
        },
        joinedAt: user.createdAt,
        referralsCount: user.referrals.length,
        activeReferralsCount: user.referrals.filter(r => r.isActive).length,
        milestoneRewards: user.milestoneRewards || {
          referral8Cycles: 0,
          referral15Cycles: 0,
          referral25Cycles: 0,
          totalTokensEarned: 0,
          referral8LastReset: null,
          referral15LastReset: null,
          referral25LastReset: null
        },
        temporaryTokens: hasActiveTokens ? {
          amount: user.temporaryTokens.amount,
          grantedAt: user.temporaryTokens.grantedAt,
          expiresAt: user.temporaryTokens.expiresAt,
          prizeType: user.temporaryTokens.prizeType,
          timeUntilExpiry: `${timeUntilExpiry}h`
        } : null,
        computed: {
          totalCycles: (user.milestoneRewards?.referral8Cycles || 0) + 
                      (user.milestoneRewards?.referral15Cycles || 0) + 
                      (user.milestoneRewards?.referral25Cycles || 0),
          hasActiveTokens,
          milestoneBreakdown: `8×${user.milestoneRewards?.referral8Cycles || 0}, 15×${user.milestoneRewards?.referral15Cycles || 0}, 25×${user.milestoneRewards?.referral25Cycles || 0}`
        }
      };
    });

    res.json({
      success: true,
      data: {
        referrers: formattedReferrers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get referrers error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch referrers' });
  }
};

// GET /api/admin/referrals/referred-users
export const getReferredUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let matchQuery = { referredBy: { $exists: true, $ne: null } };

    if (search) {
      matchQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status !== 'all') {
      matchQuery['subscription.isActive'] = status === 'active';
    }

    const referredUsers = await User.find(matchQuery)
      .populate('referredBy', 'name email referralCode')
      .populate('subscription.planId', 'name price')
      .select('name email referredBy subscription createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(matchQuery);

    const formattedUsers = referredUsers.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      referredBy: {
        name: user.referredBy?.name || 'Unknown',
        email: user.referredBy?.email || 'Unknown',
        referralCode: user.referredBy?.referralCode || 'Unknown'
      },
      subscription: {
        planName: user.subscription.planId?.name || 'No Plan',
        planPrice: user.subscription.planId?.price || 0,
        isActive: user.subscription.isActive,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate
      },
      joinedAt: user.createdAt
    }));

    res.json({
      success: true,
      data: {
        referredUsers: formattedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get referred users error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch referred users' });
  }
};

// GET /api/admin/referrals/referrer/:id
export const getReferrerDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const referrer = await User.findById(id)
      .populate('referrals.userId', 'name email subscription createdAt')
      .populate('subscription.planId', 'name price')
      .select('name email referralCode referralStats referrals subscription createdAt');

    if (!referrer) {
      return res.status(404).json({ success: false, error: 'Referrer not found' });
    }

    const detailedReferrals = referrer.referrals.map(referral => ({
      user: {
        _id: referral.userId._id,
        name: referral.userId.name,
        email: referral.userId.email,
        joinedAt: referral.userId.createdAt
      },
      referralInfo: {
        joinedAt: referral.joinedAt,
        isActive: referral.isActive,
        subscriptionStatus: referral.subscriptionStatus
      },
      subscription: referral.userId.subscription
    }));

    res.json({
      success: true,
      data: {
        referrer: {
          _id: referrer._id,
          name: referrer.name,
          email: referrer.email,
          referralCode: referrer.referralCode,
          referralStats: referrer.referralStats,
          subscription: referrer.subscription,
          joinedAt: referrer.createdAt
        },
        referrals: detailedReferrals
      }
    });
  } catch (error) {
    console.error('Get referrer details error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch referrer details' });
  }
};

// GET /api/admin/referrals/referred-user/:id
export const getReferredUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate('referredBy', 'name email referralCode')
      .populate('subscription.planId', 'name price')
      .select('name email phone referredBy subscription tokens dailyTokens prizeTokens milestoneRewards referralCode referralStats referrals createdAt updatedAt');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check if user has temporary tokens
    const now = new Date();
    let hasActiveTokens = false;
    let temporaryTokens = null;

    if (user.prizeTokens?.amount > 0 && user.prizeTokens?.expiresAt > now) {
      hasActiveTokens = true;
      const timeLeft = user.prizeTokens.expiresAt - now;
      const daysLeft = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      temporaryTokens = {
        amount: user.prizeTokens.amount,
        grantedAt: user.prizeTokens.grantedAt,
        expiresAt: user.prizeTokens.expiresAt,
        prizeType: user.prizeTokens.prizeType,
        timeUntilExpiry: daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h` : `${hoursLeft}h`
      };
    }

    // Get user's referral details if they have referred anyone
    const referredUsers = await User.find({ referredBy: user._id })
      .select('name email subscription createdAt')
      .populate('subscription.planId', 'name price')
      .sort({ createdAt: -1 });

    const formattedReferrals = referredUsers.map(ref => ({
      _id: ref._id,
      name: ref.name,
      email: ref.email,
      subscription: {
        planName: ref.subscription.planId?.name || 'No Plan',
        isActive: ref.subscription.isActive,
        endDate: ref.subscription.endDate
      },
      joinedAt: ref.createdAt
    }));

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          referralCode: user.referralCode,
          joinedAt: user.createdAt,
          lastUpdated: user.updatedAt
        },
        referredBy: user.referredBy ? {
          name: user.referredBy.name,
          email: user.referredBy.email,
          referralCode: user.referredBy.referralCode
        } : null,
        subscription: {
          planName: user.subscription.planId?.name || 'No Plan',
          planPrice: user.subscription.planId?.price || 0,
          isActive: user.subscription.isActive,
          startDate: user.subscription.startDate,
          endDate: user.subscription.endDate
        },
        tokens: {
          available: user.tokens || 0,
          dailyTokens: user.dailyTokens || 0,
          prizeTokens: user.prizeTokens?.amount || 0,
          hasActiveTokens,
          temporaryTokens
        },
        milestoneRewards: {
          referral8Cycles: user.milestoneRewards?.referral8Cycles || 0,
          referral15Cycles: user.milestoneRewards?.referral15Cycles || 0,
          referral25Cycles: user.milestoneRewards?.referral25Cycles || 0,
          totalTokensEarned: user.milestoneRewards?.totalTokensEarned || 0,
          referral8LastReset: user.milestoneRewards?.referral8LastReset,
          referral15LastReset: user.milestoneRewards?.referral15LastReset,
          referral25LastReset: user.milestoneRewards?.referral25LastReset
        },
        referralStats: {
          totalReferrals: user.referralStats?.totalReferrals || 0,
          activeReferrals: user.referralStats?.activeReferrals || 0
        },
        referredUsers: formattedReferrals
      }
    });
  } catch (error) {
    console.error('Get referred user details error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user details' });
  }
};