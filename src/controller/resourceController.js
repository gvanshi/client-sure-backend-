import { User, Resource } from '../models/index.js';
import { sendRepurchaseEmail } from '../utils/emailUtils.js';

// GET /api/resources - Get all available resources
export const getResources = async (req, res) => {
  try {
    const userId = req.user.userId;
    const resources = await Resource.find({ isActive: true }).sort({ createdAt: -1 });
    
    // Get user's accessed resources
    const user = await User.findById(userId).select('accessedResources');
    const accessedResourceIds = user?.accessedResources?.map(item => item.resourceId.toString()) || [];
    
    res.json({
      resources: resources.map(resource => ({
        id: resource._id,
        title: resource.title,
        type: resource.type,
        description: resource.description,
        thumbnailUrl: resource.thumbnailUrl,
        isAccessedByUser: accessedResourceIds.includes(resource._id.toString())
      }))
    });
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/resources/:id/access - Access a resource with token deduction
export const accessResource = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Find resource
    const resource = await Resource.findById(id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Find user with current token count
    const user = await User.findById(userId).populate('subscription.planId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if subscription is active
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      return res.status(403).json({ 
        error: 'Subscription expired',
        needsRenewal: true 
      });
    }

    // Add to accessed resources history
    if (!user.accessedResources) {
      user.accessedResources = [];
    }
    user.accessedResources.unshift({
      resourceId: resource._id,
      accessedAt: new Date()
    });
    
    // Keep only last 100 accessed resources
    if (user.accessedResources.length > 100) {
      user.accessedResources = user.accessedResources.slice(0, 100);
    }
    
    await user.save();

    // Log access
    console.log(`Resource accessed: ${resource.title} by ${user.email}, tokens remaining: ${user.tokens}`);

    // Check if monthly tokens are low and send repurchase email
    if (user.monthlyTokensRemaining <= 100) {
      await sendRepurchaseEmail(user);
    }

    // Return resource access data
    res.json({
      message: 'Resource access granted',
      resource: {
        id: resource._id,
        title: resource.title,
        type: resource.type,
        url: resource.url,
        content: resource.content
      },
      tokensRemaining: user.tokens
    });

  } catch (error) {
    console.error('Access resource error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};


// GET /api/resources/user/stats - Get user token stats
export const getUserStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).populate('subscription.planId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const isSubscriptionActive = user.subscription.endDate && user.subscription.endDate > now;

    res.json({
      tokens: user.tokens,
      tokensUsedTotal: user.tokensUsedTotal,
      tokensUsedToday: user.tokensUsedToday || 0,
      dailyTokens: 100,
      monthlyTokens: {
        total: user.monthlyTokensTotal || 0,
        used: user.monthlyTokensUsed || 0,
        remaining: user.monthlyTokensRemaining || 0
      },
      subscription: {
        isActive: isSubscriptionActive,
        planName: user.subscription.planId?.name,
        endDate: user.subscription.endDate,
        lastRefreshedAt: user.subscription.lastRefreshedAt,
        monthlyAllocation: user.subscription.monthlyAllocation || 0
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/resources/user/accessed - Get user's accessed resources
export const getAccessedResources = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get accessed resources from user's access history
    const accessedResources = user.accessedResources || [];
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedResources = accessedResources.slice(startIndex, endIndex);

    // Get full resource details
    const resourceIds = paginatedResources.map(item => item.resourceId);
    const resources = await Resource.find({ _id: { $in: resourceIds } });

    const result = paginatedResources.map(accessItem => {
      const resource = resources.find(r => r._id.toString() === accessItem.resourceId.toString());
      return {
        id: resource?._id,
        title: resource?.title,
        type: resource?.type,
        description: resource?.description,

        accessedAt: accessItem.accessedAt,
        thumbnailUrl: resource?.thumbnailUrl
      };
    }).filter(item => item.id); // Filter out deleted resources

    res.json({
      resources: result,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(accessedResources.length / limit),
        totalItems: accessedResources.length,
        hasNext: endIndex < accessedResources.length,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get accessed resources error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/resources/:id - Get a specific resource by ID
export const getResourceById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const resource = await Resource.findById(id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Check if user has accessed this resource
    const user = await User.findById(userId).select('accessedResources');
    const hasAccessed = user?.accessedResources?.some(item => 
      item.resourceId.toString() === id
    ) || false;

    res.json({
      id: resource._id,
      title: resource.title,
      type: resource.type,
      description: resource.description,

      thumbnailUrl: resource.thumbnailUrl,
      url: hasAccessed ? resource.url : null,
      content: hasAccessed ? resource.content : null,
      isAccessedByUser: hasAccessed
    });

  } catch (error) {
    console.error('Get resource by ID error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};