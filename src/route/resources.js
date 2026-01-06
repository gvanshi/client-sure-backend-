import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getAllResources, accessResource, getAccessedResources, getAccessedResourceById } from '../controller/UserController.js/resources.controller.js';

const router = express.Router();

// GET /api/resources - Get all available resources
router.get('/', authenticateToken, getAllResources);

// POST /api/resources/:id/access - Access a resource with token deduction
router.post('/:id/access', authenticateToken, accessResource);



// GET /api/resources/accessed - Get user's accessed resources
router.get('/accessed', authenticateToken, getAccessedResources);

// GET /api/resources/:id - Get a specific resource by ID
router.get('/:id', authenticateToken, getAccessedResourceById);

// GET /api/resources/:id/download - Download PDF with authentication
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const Resource = (await import('../models/Resource.js')).default;
    const resource = await Resource.findById(req.params.id);
    
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    if (!resource.url) {
      return res.status(404).json({ error: 'PDF not available' });
    }
    
    // For Cloudinary URLs, fetch and stream the file
    if (resource.url.includes('cloudinary.com')) {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(resource.url);
      
      if (!response.ok) {
        return res.status(404).json({ error: 'PDF file not accessible' });
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resource.title}.pdf"`);
      response.body.pipe(res);
    } else {
      // For other URLs, redirect
      res.redirect(resource.url);
    }
  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
});

// GET /api/resources/:id/preview - Get PDF preview URL
router.get('/:id/preview', authenticateToken, async (req, res) => {
  try {
    const Resource = (await import('../models/Resource.js')).default;
    const resource = await Resource.findById(req.params.id);
    
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.json({ url: resource.url, title: resource.title });
  } catch (error) {
    console.error('PDF preview error:', error);
    res.status(500).json({ error: 'Failed to get preview' });
  }
});

export default router;