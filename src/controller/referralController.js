import { User } from '../models/index.js';
import { validateReferralCode, getMilestoneProgress } from '../utils/referralUtils.js';
import { checkReferralMilestone } from './AdminController/referralRewardController.js';

// GET /api/referrals/validate/:code
export const validateReferral = async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    const referrer = await validateReferralCode(code);
    
    if (!referrer) {
      return res.status(404).json({ 
        valid: false, 
        error: 'Invalid or expired referral code' 
      });
    }

    res.json({
      valid: true,
      referrer: {
        name: referrer.name,
        email: referrer.email
      }
    });
  } catch (error) {
    console.error('Validate referral error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/referrals/my-referrals
export const getMyReferrals = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId)
      .populate('referrals.userId', 'name email createdAt')
      .select('referralCode referrals referralStats');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check for referral milestone (8+ referrals)
    const referralCount = user.referrals?.length || 0;
    if (referralCount >= 8) {
      // Trigger milestone check in background
      checkReferralMilestone(userId).catch(err => 
        console.error('Milestone check error:', err)
      );
    }

    res.json({
      referralCode: user.referralCode,
      stats: user.referralStats,
      referrals: user.referrals.map(ref => ({
        user: ref.userId,
        joinedAt: ref.joinedAt,
        isActive: ref.isActive,
        subscriptionStatus: ref.subscriptionStatus
      }))
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/referrals/stats
export const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId)
      .populate('referrals')
      .select('referralStats referralCode referrals');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referralCount = user.referrals?.length || 0;
    
    // Check for referral milestone (8+ referrals)
    if (referralCount >= 8) {
      // Trigger milestone check in background
      checkReferralMilestone(userId).catch(err => 
        console.error('Milestone check error:', err)
      );
    }

    res.json({
      referralCode: user.referralCode,
      totalReferrals: referralCount,
      activeReferrals: user.referralStats?.activeReferrals || 0,
      totalEarnings: user.referralStats?.totalEarnings || 0
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/referrals/milestones
export const getMilestones = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const milestoneData = await getMilestoneProgress(userId);
    
    if (!milestoneData) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(milestoneData);
  } catch (error) {
    console.error('Get milestones error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};