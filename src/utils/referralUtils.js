import crypto from 'crypto';
import User from '../models/User.js';

// Generate unique 12-character referral code
export const generateReferralCode = () => {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
};

// Validate referral code exists and is active
export const validateReferralCode = async (referralCode) => {
  if (!referralCode) return null;
  
  const referrer = await User.findOne({ 
    referralCode: referralCode.toUpperCase(),
    'subscription.endDate': { $gte: new Date() }
  });
  
  return referrer;
};

// Update referral stats
export const updateReferralStats = async (referrerId, isActive = false) => {
  const user = await User.findById(referrerId);
  if (!user) return;

  const totalReferrals = user.referrals.length;
  const activeReferrals = user.referrals.filter(ref => ref.isActive).length;
  
  user.referralStats.totalReferrals = totalReferrals;
  user.referralStats.activeReferrals = activeReferrals;
  
  await user.save();
};

// Milestone configuration - Cycle Based (Repeatable)
const REFERRAL_MILESTONES = {
  referral_8: { target: 8, reward: 300, cycleField: 'referral8Cycles', resetField: 'referral8LastReset' },
  referral_15: { target: 15, reward: 500, cycleField: 'referral15Cycles', resetField: 'referral15LastReset' },
  referral_25: { target: 25, reward: 1000, cycleField: 'referral25Cycles', resetField: 'referral25LastReset' }
};

// Check and grant milestone rewards - Cycle Based
export const checkReferralMilestones = async (referrerId) => {
  try {
    const user = await User.findById(referrerId);
    if (!user) return;

    const activeReferrals = user.referralStats.activeReferrals;
    
    // Check each milestone - now repeatable
    for (const [milestoneKey, milestone] of Object.entries(REFERRAL_MILESTONES)) {
      if (activeReferrals >= milestone.target) {
        await grantMilestoneRewardAndReset(user, milestoneKey, milestone);
        console.log(`Milestone ${milestoneKey} cycle completed by user ${user.email}`);
        break; // Only process one milestone at a time
      }
    }
  } catch (error) {
    console.error('Error checking referral milestones:', error);
  }
};

// Grant milestone reward and reset progress for next cycle
const grantMilestoneRewardAndReset = async (user, milestoneType, milestone) => {
  try {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const currentCycle = (user.milestoneRewards?.[milestone.cycleField] || 0) + 1;
    
    // Grant temporary tokens (similar to leaderboard prizes)
    user.temporaryTokens = {
      amount: milestone.reward,
      grantedAt: new Date(),
      expiresAt: expiresAt,
      grantedBy: 'system',
      prizeType: `${milestoneType}_cycle_${currentCycle}`
    };
    
    // Initialize milestoneRewards if not exists
    if (!user.milestoneRewards) {
      user.milestoneRewards = {
        referral8Cycles: 0,
        referral15Cycles: 0,
        referral25Cycles: 0,
        totalTokensEarned: 0
      };
    }
    
    // Update cycle count and reset timestamp
    user.milestoneRewards[milestone.cycleField] = currentCycle;
    user.milestoneRewards[milestone.resetField] = new Date();
    user.milestoneRewards.totalTokensEarned += milestone.reward;
    
    // RESET PROGRESS: Set active referrals back to 0
    user.referralStats.activeReferrals = 0;
    
    // Reset all referrals to inactive for next cycle
    user.referrals.forEach(referral => {
      if (referral.isActive) {
        referral.isActive = false;
        referral.subscriptionStatus = 'cycled'; // Mark as cycled for tracking
      }
    });
    
    // Add notification
    user.notifications.push({
      type: 'milestone_reward',
      message: `🎉 Cycle ${currentCycle} Complete! You've earned ${milestone.reward} bonus tokens for ${milestone.target} referrals! Progress reset - start your next cycle now!`,
      isRead: false,
      createdAt: new Date()
    });
    
    user.unreadNotificationCount += 1;
    
    await user.save();
    
    console.log(`Cycle ${currentCycle}: Granted ${milestone.reward} tokens to ${user.email} for ${milestoneType}, progress reset`);
  } catch (error) {
    console.error('Error granting milestone reward and reset:', error);
  }
};

// Get milestone progress for a user - Cycle Based
export const getMilestoneProgress = async (userId) => {
  try {
    const user = await User.findById(userId).select('referralStats milestoneRewards');
    if (!user) return null;

    const activeReferrals = user.referralStats.activeReferrals;
    const milestones = [];

    for (const [key, milestone] of Object.entries(REFERRAL_MILESTONES)) {
      const cyclesCompleted = user.milestoneRewards?.[milestone.cycleField] || 0;
      const lastReset = user.milestoneRewards?.[milestone.resetField] || null;
      const tokensEarnedFromThis = cyclesCompleted * milestone.reward;
      
      milestones.push({
        type: key,
        target: milestone.target,
        reward: milestone.reward,
        current: activeReferrals,
        progress: Math.min(100, (activeReferrals / milestone.target) * 100),
        cyclesCompleted,
        tokensEarnedFromThis,
        lastReset,
        isEligible: activeReferrals >= milestone.target,
        nextCycleNumber: cyclesCompleted + 1
      });
    }

    return {
      activeReferrals,
      milestones,
      totalCycles: (user.milestoneRewards?.referral8Cycles || 0) + 
                   (user.milestoneRewards?.referral15Cycles || 0) + 
                   (user.milestoneRewards?.referral25Cycles || 0),
      totalTokensEarned: user.milestoneRewards?.totalTokensEarned || 0
    };
  } catch (error) {
    console.error('Error getting milestone progress:', error);
    return null;
  }
};

// Get cycle statistics for admin
export const getCycleStatistics = async () => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          total8Cycles: { $sum: '$milestoneRewards.referral8Cycles' },
          total15Cycles: { $sum: '$milestoneRewards.referral15Cycles' },
          total25Cycles: { $sum: '$milestoneRewards.referral25Cycles' },
          totalTokensDistributed: { $sum: '$milestoneRewards.totalTokensEarned' },
          avgCyclesPerUser: { 
            $avg: { 
              $add: [
                '$milestoneRewards.referral8Cycles',
                '$milestoneRewards.referral15Cycles', 
                '$milestoneRewards.referral25Cycles'
              ]
            }
          }
        }
      }
    ]);

    return stats[0] || {
      totalUsers: 0,
      total8Cycles: 0,
      total15Cycles: 0,
      total25Cycles: 0,
      totalTokensDistributed: 0,
      avgCyclesPerUser: 0
    };
  } catch (error) {
    console.error('Error getting cycle statistics:', error);
    return null;
  }
};

// Process referral on successful payment
export const processReferralReward = async (referredUserId, referrerId) => {
  try {
    // Update referee status to active
    await User.findOneAndUpdate(
      { 
        _id: referrerId,
        'referrals.userId': referredUserId 
      },
      { 
        $set: { 
          'referrals.$.isActive': true,
          'referrals.$.subscriptionStatus': 'active'
        }
      }
    );

    // Update referrer stats
    await updateReferralStats(referrerId, true);
    
    // Check for milestone achievements
    await checkReferralMilestones(referrerId);
    
    console.log(`Referral processed: ${referredUserId} -> ${referrerId}`);
  } catch (error) {
    console.error('Error processing referral reward:', error);
  }
};