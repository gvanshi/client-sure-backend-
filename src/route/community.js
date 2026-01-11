import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { communityUpload } from '../middleware/communityUpload.js';
import {
  createPost,
  deletePost,
  updatePost,
  likePost,
  unlikePost,
  addComment,
  deleteComment,
  getAllPosts,
  getLeaderboard,
  getTrendingPosts,
  getCommunityStats,
  getUserDailyLimits
} from '../controller/communityController.js';

const router = express.Router();

// POST /api/community/post (with optional image)
router.post('/post', authenticateToken, communityUpload.single('image'), createPost);

// DELETE /api/community/post/:postId
router.delete('/post/:postId', authenticateToken, deletePost);

// POST /api/community/like/:postId
router.post('/like/:postId', authenticateToken, likePost);

// POST /api/community/unlike/:postId
router.post('/unlike/:postId', authenticateToken, unlikePost);

// POST /api/community/comment/:postId
router.post('/comment/:postId', authenticateToken, addComment);

// DELETE /api/community/comment/:commentId
router.delete('/comment/:commentId', authenticateToken, deleteComment);

// UPDATE /api/community/post/:postId (with optional image)
router.put('/post/:postId', authenticateToken, communityUpload.single('image'), updatePost);

// GET /api/community/posts (with search)
router.get('/posts', authenticateToken, getAllPosts);

// GET /api/community/trending
router.get('/trending', authenticateToken, getTrendingPosts);

// GET /api/community/leaderboard
router.get('/leaderboard', authenticateToken, getLeaderboard);

// GET /api/community/stats
router.get('/stats', authenticateToken, getCommunityStats);

// GET /api/community/daily-limits
router.get('/daily-limits', authenticateToken, getUserDailyLimits);

export default router;