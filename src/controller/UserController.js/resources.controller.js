// Access resource and reduce tokens

import { Resource, User } from "../../models/index.js";

// post /api/auth/resources/:id/access
export const accessResource = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const resource = await Resource.findById(id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
console.log('🔍 User accessing resource:', user.email); 
console.log('✅ Access resource call received for ID:', id)
    // Check if subscription is active
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      return res.status(403).json({ error: 'Subscription expired or inactive' });
    }

    // Add to user's accessed resources history
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

    res.json({
      resource: {
        id: resource._id,
        title: resource.title,
        description: resource.description,
        type: resource.type,
        url: resource.url,
        thumbnailUrl: resource.thumbnailUrl
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/auth/resources/:id
export const getAccessedResourceById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

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
    res.status(500).json({ error: error.message });
  }
};

// GET /api/resources - Get all active resources for users
export const getAllResources = async (req, res) => {
  try {
    console.log('🔍 getAllResources called');
    
    // First get all resources for debugging
    const allResources = await Resource.find({})
      .select('title description type url thumbnailUrl createdAt isActive')
      .sort({ createdAt: -1 });
    
    console.log('📊 Total resources in DB:', allResources.length);
    console.log('📊 Resources data:', allResources.map(r => ({ 
      title: r.title, 
      isActive: r.isActive,
      createdAt: r.createdAt 
    })));
    
    // Filter active resources
    const activeResources = allResources.filter(r => r.isActive !== false);
    console.log('✅ Active resources:', activeResources.length);
    
    res.json(activeResources);
  } catch (error) {
    console.error('❌ getAllResources error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get accessed resources by user
// GET /api/resources/accessed
export const getAccessedResources = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('accessedResources');
    if (!user || !user.accessedResources) {
      return res.json([]);
    }

    // Get resource IDs from user's access history
    const resourceIds = user.accessedResources.map(item => item.resourceId);
    
    // Get full resource details
    const resources = await Resource.find({ 
      _id: { $in: resourceIds },
      isActive: true 
    }).select('title description type url thumbnailUrl createdAt');

    // Map resources with access history
    const accessedResources = user.accessedResources
      .map(accessItem => {
        const resource = resources.find(r => r._id.toString() === accessItem.resourceId.toString());
        if (!resource) return null;
        
        return {
          id: resource._id,
          title: resource.title,
          description: resource.description,
          type: resource.type,
          url: resource.url,
          thumbnailUrl: resource.thumbnailUrl,
          accessedAt: accessItem.accessedAt
        };
      })
      .filter(item => item !== null); // Remove null entries for deleted resources
    
    res.json(accessedResources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};