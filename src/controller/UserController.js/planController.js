import { User, Plan } from '../../models/index.js';

export const getPlanStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).populate('subscription.planId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const isActive = user.subscription.endDate && user.subscription.endDate > now;
    const daysRemaining = isActive ? Math.ceil((user.subscription.endDate - now) / (1000 * 60 * 60 * 24)) : 0;

    res.json({
      planStatus: {
        isActive,
        planName: user.subscription.planId?.name || 'No Plan',
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        daysRemaining,
        dailyTokens: user.subscription.dailyTokens,
        currentTokens: user.tokens,
        monthlyTokensTotal: user.monthlyTokensTotal,
        monthlyTokensUsed: user.monthlyTokensUsed,
        monthlyTokensRemaining: user.monthlyTokensRemaining
      }
    });
  } catch (error) {
    console.error('Get plan status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};