import express from 'express';
import { validateReferral, getMyReferrals, getReferralStats, getMilestones } from '../controller/referralController.js';
import { authenticateToken as auth } from '../middleware/auth.js';

const router = express.Router();

// Public route to validate referral code
router.get('/validate/:code', validateReferral);

// Protected routes
router.get('/my-referrals', auth, getMyReferrals);
router.get('/stats', auth, getReferralStats);
router.get('/milestones', auth, getMilestones);

export default router;