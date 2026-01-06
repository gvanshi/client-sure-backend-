import User from '../../models/User.js';
import Order from '../../models/Order.js';
import Plan from '../../models/Plan.js';
import Resource from '../../models/Resource.js';
import Lead from '../../models/Lead.js';

// GET /api/admin/analytics
export const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Execute independent query groups in parallel
    const [
      userStats,
      orderStats,
      revenueStats,
      tokenStats,
      resourceStats,
      leadStats,
      recentUsers,
      planStats
    ] = await Promise.all([
      // 1. User Analytics
      Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: startOfDay } }),
        User.countDocuments({ createdAt: { $gte: startOfWeek } }),
        User.countDocuments({ createdAt: { $gte: startOfMonth } }),
        User.countDocuments({ 'subscription.planId': { $exists: true } })
      ]),

      // 2. Order Analytics
      Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ status: 'completed' }),
        Order.countDocuments({ status: 'pending' }),
        Order.countDocuments({ status: 'failed' }),
        Order.countDocuments({ createdAt: { $gte: startOfDay } }),
        Order.countDocuments({ createdAt: { $gte: startOfMonth } })
      ]),

      // 3. Revenue Analytics
      Promise.all([
        Order.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Order.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]),

      // 4. Token Analytics
      Promise.all([
        User.aggregate([
          { $group: { _id: null, total: { $sum: '$tokens' } } }
        ]),
        User.aggregate([
          { $group: { _id: null, total: { $sum: '$tokensUsedTotal' } } }
        ])
      ]),

      // 5. Resource Analytics
      Promise.all([
        Resource.countDocuments(),
        Resource.countDocuments({ isActive: true }),
        Resource.aggregate([
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ])
      ]),

      // 6. Lead Analytics
      Promise.all([
        Lead.countDocuments(),
        Lead.countDocuments({ isActive: true })
      ]),

      // 7. Recent Activity
      User.find()
        .select('name email createdAt')
        .sort({ createdAt: -1 })
        .limit(10),

      // 8. Plan Analytics (Optimized)
      (async () => {
        // First get counts per plan directly from Users collection (faster than $lookup)
        const userCountsByPlan = await User.aggregate([
          { $match: { 'subscription.planId': { $exists: true } } },
          { $group: { _id: '$subscription.planId', count: { $sum: 1 } } }
        ]);

        // Create a map for quick lookup
        const countMap = {};
        userCountsByPlan.forEach(item => {
          if (item._id) countMap[item._id.toString()] = item.count;
        });

        // Get all plans and map counts
        const plans = await Plan.find().select('name price');
        return plans.map(plan => ({
          _id: plan._id,
          name: plan.name,
          price: plan.price,
          subscriberCount: countMap[plan._id.toString()] || 0
        }));
      })()
    ]);

    // Destructure results for response
    const [totalUsers, newUsersToday, newUsersThisWeek, newUsersThisMonth, activeSubscriptions] = userStats;
    const [totalOrders, completedOrders, pendingOrders, failedOrders, ordersToday, ordersThisMonth] = orderStats;
    const [totalRevenueResult, monthlyRevenueResult] = revenueStats;
    const [totalTokensDistributedResult, totalTokensUsedResult] = tokenStats;
    const [totalResources, activeResources, resourcesByType] = resourceStats;
    const [totalLeads, activeLeads] = leadStats;

    res.json({
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersThisWeek,
        newThisMonth: newUsersThisMonth,
        activeSubscriptions
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
        pending: pendingOrders,
        failed: failedOrders,
        today: ordersToday,
        thisMonth: ordersThisMonth
      },
      revenue: {
        total: totalRevenueResult[0]?.total || 0,
        monthly: monthlyRevenueResult[0]?.total || 0
      },
      tokens: {
        distributed: totalTokensDistributedResult[0]?.total || 0,
        used: totalTokensUsedResult[0]?.total || 0
      },
      resources: {
        total: totalResources,
        active: activeResources,
        byType: resourcesByType
      },
      leads: {
        total: totalLeads,
        active: activeLeads
      },
      plans: planStats,
      recentUsers
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/analytics/user-growth
export const getUserGrowthData = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const userData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.json(userData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/analytics/revenue
export const getRevenueData = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const revenueData = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.json(revenueData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};