import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getTokenPackages,
  createTokenPurchase,
  processTokenPurchase,
  getTokenHistory,
  getTokenBalance
} from '../controller/tokenController.js';

const router = express.Router();

// Public routes
router.get('/packages', getTokenPackages);
// Webhook for payment completion (should be called by payment gateway)
router.post('/webhook', processTokenPurchase);

// Protected routes (require authentication)
router.use(authenticateToken);

// Token purchase flow
router.post('/purchase', createTokenPurchase);
router.get('/balance', getTokenBalance);
router.get('/history', getTokenHistory);

export default router;