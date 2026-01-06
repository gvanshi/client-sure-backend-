import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getLeads,
  accessLead,
  getAccessedLeads,
  getAccessedLeadById,
  bulkAccessLeads,
  exportLeadData,
  bulkExportLeads,
  sendBulkEmail,
  getEmailFeedback
} from '../controller/UserController.js/leads.controller.js';

const router = express.Router();

// Lead access routes
router.get('/', authenticateToken, getLeads);
router.post('/:id/access', authenticateToken, accessLead);
router.get('/accessed', authenticateToken, getAccessedLeads);
router.get('/accessed/:id', authenticateToken, getAccessedLeadById);
router.post('/bulk-access', authenticateToken, bulkAccessLeads);
router.post('/export', authenticateToken, exportLeadData);
router.post('/bulk-export', authenticateToken, bulkExportLeads);
router.post('/send-email', authenticateToken, sendBulkEmail);
router.get('/email-feedback', authenticateToken, getEmailFeedback);

export default router;