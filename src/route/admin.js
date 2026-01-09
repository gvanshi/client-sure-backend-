import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateAdmin } from '../middleware/adminAuth.js';
import Admin from '../models/Admin.js';
import { upload } from '../middleware/upload.js';
import { excelUpload } from '../middleware/excelUpload.js';
import { manualTokenRefresh, manualSubscriptionCheck } from '../services/cronJobs.js';
import { adminLogin, adminLogout } from '../controller/AdminController/authController.js';
import { adminSignup, getAdminProfile, updateAdminProfile, changeAdminPassword, requestAdminPasswordReset, resetAdminPassword } from '../controller/AdminController/adminProfileController.js';
import { createResource, getResources, getResource, updateResource, deleteResource } from '../controller/AdminController/resourceController.js';
import { uploadLeads, getLeads, getLead, updateLead, deleteLead, bulkDeleteLeads } from '../controller/AdminController/leadController.js';
import { getUsers, getUser, updateUserTokens } from '../controller/AdminController/userController.js';
import { getAnalytics, getUserGrowthData, getRevenueData } from '../controller/AdminController/analyticsController.js';
import { getAllPostsAdmin, deletePostAdmin, deleteCommentAdmin, getLeaderboardAdmin, getCommunityStatsAdmin, fixLeaderboardSync, getUserPrizeHistory, getAllPrizeHistory } from '../controller/AdminController/communityController.js';
import { awardPrizeTokens, getUserTokenStatus } from '../controller/AdminController/prizeTokenController.js';
import { getReferralAnalytics, getReferrers, getReferredUsers, getReferrerDetails, getReferredUserDetails } from '../controller/AdminController/referralsController.js';
import { getEmails, getEmailById, getEmailStats, deleteEmail } from '../controller/AdminController/emailController.js';

const router = express.Router();

// Admin authentication
router.post('/signup', adminSignup);
router.post('/login', adminLogin);
router.post('/logout', adminLogout);

// Admin profile management
router.get('/profile', authenticateAdmin, getAdminProfile);
router.put('/profile', authenticateAdmin, updateAdminProfile);
router.put('/change-password', authenticateAdmin, changeAdminPassword);
router.post('/request-password-reset', requestAdminPasswordReset);
router.post('/reset-password', resetAdminPassword);

// Resource CRUD operations
router.post('/resources', authenticateAdmin, upload.single('file'), createResource);
router.get('/resources', authenticateAdmin, getResources);
router.get('/resources/:id', authenticateAdmin, getResource);
router.put('/resources/:id', authenticateAdmin, upload.single('file'), updateResource);
router.delete('/resources/:id', authenticateAdmin, deleteResource);

// User management operations
router.get('/users', authenticateAdmin, getUsers);
router.get('/users/:id', authenticateAdmin, getUser);
router.put('/users/:id/tokens', authenticateAdmin, updateUserTokens);

// Lead CRUD operations
router.post('/leads/upload', authenticateAdmin, excelUpload.single('file'), uploadLeads);
router.get('/leads', authenticateAdmin, getLeads);
router.get('/get-lead/:id', authenticateAdmin, getLead);
router.put('/update-leads/:id', authenticateAdmin, updateLead);
router.delete('/leads/bulk-delete', authenticateAdmin, bulkDeleteLeads);
router.delete('/leads/:id', authenticateAdmin, deleteLead);

// Analytics operations
router.get('/analytics', authenticateAdmin, getAnalytics);
router.get('/analytics/user-growth', authenticateAdmin, getUserGrowthData);
router.get('/analytics/revenue', authenticateAdmin, getRevenueData);

// Community moderation
router.get('/community/all', authenticateAdmin, getAllPostsAdmin);
router.delete('/community/post/:postId', authenticateAdmin, deletePostAdmin);
router.delete('/community/comment/:commentId', authenticateAdmin, deleteCommentAdmin);

// Community data for admin dashboard
router.get('/community/leaderboard', authenticateAdmin, getLeaderboardAdmin);
router.get('/community/stats', authenticateAdmin, getCommunityStatsAdmin);
router.post('/community/fix-sync', authenticateAdmin, fixLeaderboardSync);
router.get('/community/user/:userId/prize-history', authenticateAdmin, getUserPrizeHistory);
router.get('/community/prize-history/all', authenticateAdmin, getAllPrizeHistory);

// Prize token management
router.post('/award-prize-tokens', authenticateAdmin, awardPrizeTokens);
router.get('/user/:userId/token-status', authenticateAdmin, getUserTokenStatus);

// Referrals management
router.get('/referrals/analytics', authenticateAdmin, getReferralAnalytics);
router.get('/referrals/referrers', authenticateAdmin, getReferrers);
router.get('/referrals/referred-users', authenticateAdmin, getReferredUsers);
router.get('/referrals/referrer/:id', authenticateAdmin, getReferrerDetails);
router.get('/referrals/referred-user/:id', authenticateAdmin, getReferredUserDetails);

// Email management
router.get('/emails', authenticateAdmin, getEmails);
router.get('/emails/stats', authenticateAdmin, getEmailStats);
router.get('/emails/:id', authenticateAdmin, getEmailById);
router.delete('/emails/:id', authenticateAdmin, deleteEmail);

// Referral Rewards management
import { getReferralRewards, awardReferralReward, getReferralRewardAnalytics } from '../controller/AdminController/referralRewardController.js';
router.get('/referral-rewards', authenticateAdmin, getReferralRewards);
router.post('/referral-rewards/award', authenticateAdmin, awardReferralReward);
router.get('/referral-rewards/analytics', authenticateAdmin, getReferralRewardAnalytics);

// Prize management
import { getPrizeTemplates, createPrizeTemplate, getFilteredLeaderboard, distributePrizes, getPrizeHistory, getPrizeAnalytics } from '../controller/AdminController/prizeController.js';
router.get('/prize-templates', authenticateAdmin, getPrizeTemplates);
router.post('/prize-templates', authenticateAdmin, createPrizeTemplate);
router.get('/leaderboard/filtered', authenticateAdmin, getFilteredLeaderboard);
router.post('/distribute-prizes', authenticateAdmin, distributePrizes);
router.get('/prize-history', authenticateAdmin, getPrizeHistory);
router.get('/prize-analytics', authenticateAdmin, getPrizeAnalytics);

// POST /api/admin/refresh-tokens - Manual token refresh (for testing)
router.post('/refresh-tokens', authenticateToken, async (req, res) => {
  try {
    const result = await manualTokenRefresh();
    
    if (result.success) {
      res.json({
        message: 'Token refresh completed successfully',
        refreshedCount: result.refreshedCount
      });
    } else {
      res.status(500).json({
        error: 'Token refresh failed',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Manual refresh endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/check-subscriptions - Manual subscription expiry check (for testing)
router.post('/check-subscriptions', authenticateAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const result = await manualSubscriptionCheck(email);
    
    if (result.success) {
      res.json({
        message: 'Subscription check completed successfully',
        results: result.results
      });
    } else {
      res.status(500).json({
        error: 'Subscription check failed',
        details: result.error
      });
    }
  } catch (error) {
    console.error('Manual subscription check endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;