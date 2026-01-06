import { v2 as cloudinary } from 'cloudinary';
import Resource from '../../models/Resource.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// POST /api/admin/resources
export const createResource = async (req, res) => {
  try {
    const { title, description, type, url: videoUrl, thumbnailUrl: providedThumbnailUrl } = req.body;
    const file = req.file;

    // For videos, allow URL input instead of file upload
    if (type === 'video' && videoUrl) {
      const resource = new Resource({
        title,
        description,
        type,
        url: videoUrl,
        thumbnailUrl: providedThumbnailUrl || videoUrl, // Use provided thumbnail or video URL as fallback
        previewUrl: videoUrl,
        cloudinaryPublicId: null, // No Cloudinary for URL-based videos
        isActive: true // Explicitly set to true
      });

      await resource.save();
      console.log('✅ Video resource saved successfully:', {
        id: resource._id,
        title: resource.title,
        isActive: resource.isActive,
        type: resource.type
      });
      return res.status(201).json(resource);
    }

    // For other types or if no URL provided for video, require file upload
    if (!file) {
      return res.status(400).json({ error: 'File is required for this resource type' });
    }

    console.log('Uploading file:', { type, mimetype: file.mimetype, size: file.size });

    // Upload to Cloudinary from buffer with proper resource type
    const resourceType = type === 'pdf' ? 'raw' : 'auto';
    let result;
    
    try {
      result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: 'clientsure-resources',
            public_id: `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            format: type === 'pdf' ? 'pdf' : undefined,
            access_mode: 'public',
            use_filename: true,
            unique_filename: true
          },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject(new Error(`Cloudinary upload failed: ${error.message}`));
            } else {
              console.log('Cloudinary upload success:', result.secure_url);
              resolve(result);
            }
          }
        ).end(file.buffer);
      });
    } catch (uploadError) {
      console.error('Cloudinary upload failed:', uploadError);
      return res.status(500).json({ 
        error: 'File upload failed', 
        details: uploadError.message,
        suggestion: 'Please check Cloudinary configuration or try a smaller file'
      });
    }

    // Generate proper URLs for different file types
    let thumbnailUrl = result.secure_url;
    
    if (type === 'pdf') {
      // Generate PDF thumbnail using Cloudinary transformation
      thumbnailUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/f_jpg,q_auto,w_300,h_400,c_fit/${result.public_id}.jpg`;
    }

    const resource = new Resource({
      title,
      description,
      type,
      url: result.secure_url,
      thumbnailUrl: thumbnailUrl,
      previewUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      isActive: true // Explicitly set to true
    });

    await resource.save();
    console.log('✅ Resource saved successfully:', {
      id: resource._id,
      title: resource.title,
      isActive: resource.isActive,
      type: resource.type
    });
    res.status(201).json(resource);
  } catch (error) {
    console.error('Create resource error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/resources
export const getResources = async (req, res) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/resources/:id
export const getResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/resources/:id
export const updateResource = async (req, res) => {
  try {
    const { title, description, type, isActive, url: videoUrl, thumbnailUrl: providedThumbnailUrl } = req.body;
    const file = req.file;

    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    // Update fields
    if (title) resource.title = title;
    if (description) resource.description = description;
    if (type) resource.type = type;
    if (isActive !== undefined) resource.isActive = isActive;

    // For videos, allow URL update
    if (type === 'video' && videoUrl) {
      resource.url = videoUrl;
      resource.previewUrl = videoUrl;
      if (providedThumbnailUrl) resource.thumbnailUrl = providedThumbnailUrl;
      resource.cloudinaryPublicId = null; // Clear Cloudinary ID for URL-based videos
    } else if (file) {
      // Upload new file if provided
      const resourceType = resource.type === 'pdf' ? 'raw' : 'auto';
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: 'resources',
            public_id: `${resource.type}_${Date.now()}`,
            format: resource.type === 'pdf' ? 'pdf' : undefined,
            access_mode: 'public'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        ).end(file.buffer);
      });
      
      resource.url = result.secure_url;
      resource.cloudinaryPublicId = result.public_id;
      
      if (resource.type === 'pdf') {
        resource.thumbnailUrl = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/f_jpg,q_auto,w_300,h_400,c_fit/${result.public_id}.jpg`;
      } else {
        resource.thumbnailUrl = result.secure_url;
      }
      resource.previewUrl = result.secure_url;
    }

    await resource.save();
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/admin/resources/:id
export const deleteResource = async (req, res) => {
  try {
    console.log('Deleting resource with ID:', req.params.id);
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    await Resource.findByIdAndDelete(req.params.id);
    res.json({ message: 'Resource deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};