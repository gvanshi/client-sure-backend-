import { User, ReferralReward } from '../../models/index.js';
import { sendEmail } from '../../utils/emailUtils.js';

const ADMIN_EMAIL = 'yadavsatyamsingh078@gmail.com';

// Function to check and notify admin when user reaches 8 referrals
export const checkReferralMilestone = async (userId) => {
  try {
    const user = await User.findById(userId).populate('referrals');
    if (!user) return;

    const referralCount = user.referrals?.length || 0;
    
    // Check if user has reached 8 referrals and hasn't been notified yet
    if (referralCount >= 8) {
      const existingReward = await ReferralReward.findOne({ 
        userId, 
        referralCount: { $lte: referralCount },
        adminNotified: true 
      });

      if (!existingReward) {
        // Create reward record
        const reward = new ReferralReward({
          userId,
          referralCount,
          rewardAmount: 0, // Will be set by admin
          status: 'pending',
          adminNotified: true,
          adminNotifiedAt: new Date()
        });
        
        await reward.save();

        // Send email to admin
        const emailSubject = '🎉 Referral Milestone Reached - Action Required';
        const emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0; font-size: 28px;">🎉 Referral Milestone Alert</h1>
              <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">User Eligible for Reward</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #4f46e5;">Referral Milestone Reached!</h2>
              
              <div style="background: #f8fafc; padding: 20px; border-left: 4px solid #4f46e5; margin: 20px 0; border-radius: 5px;">
                <h3 style="margin-top: 0; color: #4f46e5;">User Details:</h3>
                <p><strong>Name:</strong> ${user.name}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Referrals Completed:</strong> ${referralCount}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              
              <div style="background: #fef3c7; padding: 20px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 5px;">
                <h3 style="margin-top: 0; color: #f59e0b;">Action Required:</h3>
                <p>This user has completed <strong>${referralCount} referrals</strong> and is eligible for a reward.</p>
                <p>Please login to the admin panel to set and award the referral reward.</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.BASE_URL}/admin/referrals" 
                   style="background: #4f46e5; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                  Login to Admin Panel
                </a>
              </div>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
                <p>This is an automated notification from ClientSure referral system.</p>
                <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
              </div>
            </div>
          </div>
        `;

        await sendEmail(ADMIN_EMAIL, emailSubject, emailBody);
        console.log(`Admin notified: User ${user.name} completed ${referralCount} referrals`);
      }
    }
  } catch (error) {
    console.error('Error checking referral milestone:', error);
  }
};

// GET /api/admin/referral-rewards
export const getReferralRewards = async (req, res) => {
  try {
    const { 
      email, 
      name, 
      status = 'all', 
      minReferrals = 8,
      page = 1, 
      limit = 20 
    } = req.query;

    // Build user filter
    let userFilter = {};
    if (email) {
      userFilter.email = { $regex: email, $options: 'i' };
    }
    if (name) {
      userFilter.name = { $regex: name, $options: 'i' };
    }

    // Get users with referrals >= minReferrals
    const users = await User.aggregate([
      { $match: userFilter },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'referredBy',
          as: 'referrals'
        }
      },
      {
        $addFields: {
          referralCount: { $size: '$referrals' }
        }
      },
      {
        $match: {
          referralCount: { $gte: parseInt(minReferrals) }
        }
      },
      {
        $lookup: {
          from: 'referralrewards',
          localField: '_id',
          foreignField: 'userId',
          as: 'rewards'
        }
      },
      {
        $addFields: {
          latestReward: { $arrayElemAt: ['$rewards', -1] },
          hasReward: { $gt: [{ $size: '$rewards' }, 0] }
        }
      }
    ]);

    // Filter by status
    let filteredUsers = users;
    if (status === 'pending') {
      filteredUsers = users.filter(user => !user.hasReward || user.latestReward?.status === 'pending');
    } else if (status === 'rewarded') {
      filteredUsers = users.filter(user => user.hasReward && user.latestReward?.status === 'rewarded');
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    res.json({
      success: true,
      users: paginatedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredUsers.length,
        pages: Math.ceil(filteredUsers.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching referral rewards:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/admin/referral-rewards/award
export const awardReferralReward = async (req, res) => {
  try {
    const { userId, rewardAmount, customMessage } = req.body;
    const adminId = req.user.id;

    if (!userId || !rewardAmount) {
      return res.status(400).json({ error: 'User ID and reward amount are required' });
    }

    const user = await User.findById(userId).populate('referrals');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const referralCount = user.referrals?.length || 0;

    // Check if user already has a rewarded status for current referral count
    const existingReward = await ReferralReward.findOne({
      userId,
      status: 'rewarded',
      referralCount: { $lte: referralCount }
    });

    if (existingReward) {
      return res.status(400).json({ error: 'User has already been rewarded for this referral milestone' });
    }

    // Add tokens to user account
    user.tokens = (user.tokens || 0) + parseInt(rewardAmount);
    await user.save();

    // Create or update reward record
    let reward = await ReferralReward.findOne({ userId, status: 'pending' });
    if (!reward) {
      reward = new ReferralReward({
        userId,
        referralCount,
        rewardAmount: parseInt(rewardAmount),
        status: 'rewarded',
        awardedBy: adminId,
        awardedAt: new Date(),
        customMessage
      });
    } else {
      reward.rewardAmount = parseInt(rewardAmount);
      reward.status = 'rewarded';
      reward.awardedBy = adminId;
      reward.awardedAt = new Date();
      reward.customMessage = customMessage;
    }

    await reward.save();

    // Send notification email to user
    const emailSubject = '🎁 Congratulations! Referral Reward Received';
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">🎁 Referral Reward!</h1>
          <p style="margin: 10px 0 0; font-size: 18px; opacity: 0.9;">Congratulations ${user.name}!</p>
        </div>
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #10b981;">Amazing Achievement! 🎉</h2>
          
          <p>Congratulations on completing <strong>${referralCount} referrals</strong>! Your dedication to sharing ClientSure with others is truly appreciated.</p>
          
          <div style="background: #f0fdf4; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0; border-radius: 5px;">
            <h3 style="margin-top: 0; color: #10b981;">Your Reward:</h3>
            <p style="font-size: 24px; font-weight: bold; color: #059669; margin: 10px 0;">🎁 ${rewardAmount} Tokens</p>
            <p>These tokens have been added to your account and are ready to use!</p>
          </div>
          
          ${customMessage ? `
          <div style="background: #fef3c7; padding: 20px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 5px;">
            <h3 style="margin-top: 0; color: #f59e0b;">Special Message:</h3>
            <p style="font-style: italic;">"${customMessage}"</p>
          </div>
          ` : ''}
          
          <div style="background: #eff6ff; padding: 20px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 5px;">
            <h3 style="margin-top: 0; color: #3b82f6;">Keep Referring!</h3>
            <p>Continue sharing ClientSure with your network to earn more rewards. Every referral helps grow our community!</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.BASE_URL}/user/dashboard" 
               style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
              View My Account
            </a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
            <p>Thank you for being a valued member of the ClientSure community!</p>
            <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
          </div>
        </div>
      </div>
    `;

    await sendEmail(user.email, emailSubject, emailBody);

    // Mark user as notified
    reward.userNotified = true;
    await reward.save();

    res.json({
      success: true,
      message: `Reward of ${rewardAmount} tokens awarded to ${user.name}`,
      reward
    });
  } catch (error) {
    console.error('Error awarding referral reward:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/referral-rewards/analytics
export const getReferralRewardAnalytics = async (req, res) => {
  try {
    const [totalRewards, pendingRewards, rewardedUsers, totalTokensDistributed] = await Promise.all([
      ReferralReward.countDocuments(),
      ReferralReward.countDocuments({ status: 'pending' }),
      ReferralReward.countDocuments({ status: 'rewarded' }),
      ReferralReward.aggregate([
        { $match: { status: 'rewarded' } },
        { $group: { _id: null, total: { $sum: '$rewardAmount' } } }
      ])
    ]);

    // Get users with 8+ referrals
    const usersWithEightPlus = await User.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'referredBy',
          as: 'referrals'
        }
      },
      {
        $addFields: {
          referralCount: { $size: '$referrals' }
        }
      },
      {
        $match: {
          referralCount: { $gte: 8 }
        }
      },
      {
        $count: 'total'
      }
    ]);

    res.json({
      success: true,
      analytics: {
        totalRewards,
        pendingRewards,
        rewardedUsers,
        totalTokensDistributed: totalTokensDistributed[0]?.total || 0,
        usersWithEightPlusReferrals: usersWithEightPlus[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching referral reward analytics:', error);
    res.status(500).json({ error: error.message });
  }
};