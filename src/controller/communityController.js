import Feedback from "../models/Feedback.js";
import User from "../models/User.js";
import {
  createNotification,
  notifyNewPost,
  markNotificationsAsRead,
  cleanOldNotifications,
} from "../utils/notificationUtils.js";
import { uploadToImageKitCommunity } from "../middleware/communityUpload.js";
import {
  canPerformAction,
  incrementDailyCount,
  getRemainingLimits,
  areAllLimitsExhausted,
} from "../utils/dailyLimitsUtils.js";

// Get trending posts
export const getTrendingPosts = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    const posts = await Feedback.aggregate([
      {
        $addFields: {
          engagement: {
            $add: [
              { $size: "$likes" },
              { $multiply: [{ $size: "$comments" }, 2] },
            ],
          },
        },
      },
      { $sort: { engagement: -1, createdAt: -1 } },
      { $limit: 10 },
    ]);

    await Feedback.populate(posts, [
      { path: "user_id", select: "name avatar" },
      { path: "comments.user_id", select: "name avatar" },
    ]);

    res.json({ posts });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching trending posts", error: error.message });
  }
};

// Helper function to check subscription validity
const checkSubscriptionAccess = (user) => {
  if (!user.subscription.endDate) return false;
  return new Date() <= new Date(user.subscription.endDate);
};

// Create new post with optional image
export const createPost = async (req, res) => {
  try {
    const { post_title, description } = req.body;
    const userId = req.user.id;

    console.log("Creating post:", { post_title, description, userId });

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    // Check daily post limit
    const limitCheck = await canPerformAction(userId, "posts");
    if (!limitCheck.canPerform) {
      const remainingLimits =
        limitCheck.remainingLimits || (await getRemainingLimits(userId));
      const allExhausted = areAllLimitsExhausted(remainingLimits);

      return res.status(429).json({
        success: false,
        message: allExhausted
          ? "All your community limits for today have been used up."
          : "Your Post limit for today is finished.",
        limitType: "posts",
        remainingLimits,
        allExhausted,
      });
    }

    const postData = {
      user_id: userId,
      post_title,
      description,
    };

    // Upload image to ImageKit if provided
    if (req.file) {
      try {
        const uploadResult = await uploadToImageKitCommunity(req.file);
        postData.image = uploadResult.url;
        console.log("Image uploaded to ImageKit:", uploadResult.url);
      } catch (uploadError) {
        console.error("ImageKit upload error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Error uploading image",
          error: uploadError.message,
        });
      }
    }

    const post = new Feedback(postData);
    const savedPost = await post.save();
    console.log("Post saved successfully:", savedPost._id);

    // Update user points and activity
    await User.findByIdAndUpdate(userId, {
      $inc: {
        points: 5,
        "communityActivity.postsCreated": 1,
      },
    });

    console.log("User points updated for post creation");

    // Increment daily post count
    await incrementDailyCount(userId, "posts");

    // Get updated remaining limits
    const remainingLimits = await getRemainingLimits(userId);

    // Notify all users about new post (async, don't wait)
    notifyNewPost(userId, savedPost._id, savedPost.post_title).catch((err) =>
      console.error("Error sending new post notifications:", err)
    );

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: savedPost,
      remainingLimits,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({
      success: false,
      message: "Error creating post",
      error: error.message,
    });
  }
};

// Delete own post
export const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Feedback.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Convert both to strings for comparison
    if (post.user_id.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "You can only delete your own posts" });
    }

    // Get all unique commenters before deleting the post
    const commenters = [
      ...new Set(post.comments.map((comment) => comment.user_id.toString())),
    ];
    const totalComments = post.comments.length;

    console.log(
      `Deleting post with ${totalComments} comments from ${commenters.length} unique users`
    );

    // Delete the post
    await Feedback.findByIdAndDelete(postId);

    // Deduct points from post owner
    await User.findByIdAndUpdate(userId, {
      $inc: {
        points: -5,
        "communityActivity.postsCreated": -1,
      },
    });

    // Deduct points from all commenters (2 points per comment)
    if (commenters.length > 0) {
      const commenterUpdates = commenters.map(async (commenterId) => {
        // Count how many comments this user made on this post
        const userCommentCount = post.comments.filter(
          (comment) => comment.user_id.toString() === commenterId
        ).length;

        const pointsToDeduct = userCommentCount * 2;

        console.log(
          `Deducting ${pointsToDeduct} points from user ${commenterId} for ${userCommentCount} comments`
        );

        return User.findByIdAndUpdate(commenterId, {
          $inc: {
            points: -pointsToDeduct,
            "communityActivity.commentsMade": -userCommentCount,
          },
        });
      });

      await Promise.all(commenterUpdates);
      console.log(`Points deducted from ${commenters.length} commenters`);
    }

    res.json({
      message: "Post deleted successfully",
      details: {
        commentsDeleted: totalComments,
        usersAffected: commenters.length + 1, // +1 for post owner
      },
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    res
      .status(500)
      .json({ message: "Error deleting post", error: error.message });
  }
};

// Update own post
export const updatePost = async (req, res) => {
  try {
    const { postId } = req.params
    const { post_title, description } = req.body
    const userId = req.user.id

    const post = await Feedback.findById(postId)
    if (!post) {
      return res.status(404).json({ message: 'Post not found' })
    }

    if (post.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You can only edit your own posts' })
    }

    if (post_title !== undefined) post.post_title = post_title
    if (description !== undefined) post.description = description

    // Handle new image upload
    if (req.file) {
      try {
        const uploadResult = await uploadToImageKitCommunity(req.file)
        post.image = uploadResult.url
      } catch (uploadError) {
        console.error('ImageKit upload error:', uploadError)
        return res.status(500).json({ success: false, message: 'Error uploading image', error: uploadError.message })
      }
    }

    post.updatedAt = new Date()
    const saved = await post.save()

    // Populate user and comments user data for consistent response
    await Feedback.populate(saved, [
      { path: 'user_id', select: 'name avatar' },
      { path: 'comments.user_id', select: 'name avatar' },
    ])

    res.json({ success: true, message: 'Post updated successfully', post: saved })
  } catch (error) {
    console.error('Error updating post:', error)
    res.status(500).json({ message: 'Error updating post', error: error.message })
  }
}

// Like post
export const likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    // Check daily like limit
    const limitCheck = await canPerformAction(userId, "likes");
    if (!limitCheck.canPerform) {
      const remainingLimits =
        limitCheck.remainingLimits || (await getRemainingLimits(userId));
      const allExhausted = areAllLimitsExhausted(remainingLimits);

      return res.status(429).json({
        success: false,
        message: allExhausted
          ? "All your community limits for today have been used up."
          : "Your like limit for today is finished.",
        limitType: "likes",
        remainingLimits,
        allExhausted,
      });
    }

    const post = await Feedback.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const userIdStr = userId.toString();
    const alreadyLiked = post.likes.some(
      (like) => like.user_id.toString() === userIdStr
    );

    if (alreadyLiked) {
      return res.status(400).json({ message: "Post already liked" });
    }

    post.likes.push({ user_id: userId });
    await post.save();

    // Add points for liking (1 point)
    await User.findByIdAndUpdate(userId, {
      $inc: {
        points: 1,
        "communityActivity.likesGiven": 1,
      },
    });

    // Increment daily like count
    await incrementDailyCount(userId, "likes");

    // Get updated remaining limits
    const remainingLimits = await getRemainingLimits(userId);

    res.json({
      success: true,
      message: "Post liked successfully",
      remainingLimits,
    });
  } catch (error) {
    console.error("Like post error:", error);
    res
      .status(500)
      .json({ message: "Error liking post", error: error.message });
  }
};

// Unlike post
export const unlikePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Feedback.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Convert userId to string for comparison
    const userIdStr = userId.toString();

    // Find like by this user
    const likeIndex = post.likes.findIndex((like) => {
      const likeUserIdStr = like.user_id.toString();
      return likeUserIdStr === userIdStr;
    });

    if (likeIndex === -1) {
      return res
        .status(400)
        .json({ message: "You have not liked this post yet" });
    }

    // Remove the like
    post.likes.splice(likeIndex, 1);
    await post.save();

    // Deduct points for unliking (1 point)
    await User.findByIdAndUpdate(userId, {
      $inc: {
        points: -1,
        "communityActivity.likesGiven": -1,
      },
    });

    res.json({ message: "Post unliked successfully" });
  } catch (error) {
    console.error("Unlike post error:", error);
    res
      .status(500)
      .json({ message: "Error unliking post", error: error.message });
  }
};

// Add comment
export const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    // Check daily comment limit
    const limitCheck = await canPerformAction(userId, "comments");
    if (!limitCheck.canPerform) {
      const remainingLimits =
        limitCheck.remainingLimits || (await getRemainingLimits(userId));
      const allExhausted = areAllLimitsExhausted(remainingLimits);

      return res.status(429).json({
        success: false,
        message: allExhausted
          ? "All your community limits for today have been used up."
          : "Your comment limit for today is finished.",
        limitType: "comments",
        remainingLimits,
        allExhausted,
      });
    }

    const post = await Feedback.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const comment = {
      user_id: userId,
      text,
      createdAt: new Date(),
    };

    post.comments.push(comment);
    await post.save();

    // Update user points
    await User.findByIdAndUpdate(userId, {
      $inc: {
        points: 2,
        "communityActivity.commentsMade": 1,
      },
    });

    // Increment daily comment count
    await incrementDailyCount(userId, "comments");

    // Get updated remaining limits
    const remainingLimits = await getRemainingLimits(userId);

    // Notify post owner about new comment (if not commenting on own post)
    if (post.user_id.toString() !== userId.toString()) {
      const commenter = await User.findById(userId).select("name");
      const message = `${commenter.name} commented on your post: "${post.post_title}"`;
      createNotification(
        post.user_id,
        "new_comment",
        message,
        postId,
        userId
      ).catch((err) =>
        console.error("Error creating comment notification:", err)
      );
    }

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment,
      remainingLimits,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error adding comment", error: error.message });
  }
};

// Delete own comment
export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const post = await Feedback.findOne({ "comments._id": commentId });
    if (!post) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const comment = post.comments.id(commentId);
    if (comment.user_id.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "You can only delete your own comments" });
    }

    post.comments.pull(commentId);
    await post.save();

    // Deduct points
    await User.findByIdAndUpdate(userId, {
      $inc: {
        points: -2,
        "communityActivity.commentsMade": -1,
      },
    });

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting comment", error: error.message });
  }
};

// Get all posts with advanced search and filters
export const getAllPosts = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      search,
      author,
      hasImage,
      dateFrom,
      dateTo,
      sortBy = "latest",
      minLikes = 0,
      page = 1,
      limit = 10,
    } = req.query;

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    // Build search query
    let query = {};

    if (search) {
      query.$or = [
        { post_title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (author) {
      query.user_id = author;
    }

    if (hasImage === "true") {
      query.image = { $exists: true, $ne: null };
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Build sort options
    let sortOptions = {};
    switch (sortBy) {
      case "popular":
        sortOptions = { likesCount: -1, createdAt: -1 };
        break;
      case "trending":
        sortOptions = { engagement: -1, createdAt: -1 };
        break;
      case "oldest":
        sortOptions = { createdAt: 1 };
        break;
      default: // latest
        sortOptions = { createdAt: -1 };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Aggregation pipeline for advanced features
    const pipeline = [
      { $match: query },
      {
        $addFields: {
          likesCount: { $size: "$likes" },
          commentsCount: { $size: "$comments" },
          engagement: {
            $add: [
              { $size: "$likes" },
              { $multiply: [{ $size: "$comments" }, 2] },
            ],
          },
        },
      },
      {
        $match: {
          likesCount: { $gte: parseInt(minLikes) },
        },
      },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const posts = await Feedback.aggregate(pipeline);

    // Populate user data
    await Feedback.populate(posts, [
      { path: "user_id", select: "name avatar" },
      { path: "comments.user_id", select: "name avatar" },
    ]);

    // Get total count for pagination
    const totalPosts = await Feedback.countDocuments(query);
    const totalPages = Math.ceil(totalPosts / parseInt(limit));

    res.json({
      posts,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPosts,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching posts", error: error.message });
  }
};

// Get leaderboard with professional filtering
export const getLeaderboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10, includeCurrentUser = false } = req.query;

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    // Get top users (default 10)
    const topUsers = await User.find({ points: { $gt: 0 } })
      .select("name avatar points communityActivity")
      .sort({ points: -1 })
      .limit(parseInt(limit));

    // Check if current user is in top users
    const currentUserInTop = topUsers.some(
      (topUser) => topUser._id.toString() === userId
    );

    let response = {
      topUsers,
    };

    // If includeCurrentUser is true and user is not in top 10, get their rank
    if (includeCurrentUser === "true" && !currentUserInTop) {
      // Get current user's rank
      const userRank =
        (await User.countDocuments({
          points: { $gt: user.points },
        })) + 1;

      // Get total number of users with points
      const totalUsers = await User.countDocuments({ points: { $gt: 0 } });

      // Only include current user rank if they're not in top users
      if (userRank > parseInt(limit)) {
        response.currentUserRank = {
          user: {
            _id: user._id,
            name: user.name,
            avatar: user.avatar,
            points: user.points,
            communityActivity: user.communityActivity,
          },
          rank: userRank,
          totalUsers,
        };
      }
    }

    // Backward compatibility - also send old format
    response.leaderboard = topUsers;
    response.userRank =
      (await User.countDocuments({
        points: { $gt: user.points },
      })) + 1;
    response.userPoints = user.points;

    res.json(response);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching leaderboard", error: error.message });
  }
};

// Get community stats
export const getCommunityStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    const stats = await Promise.all([
      Feedback.countDocuments(),
      Feedback.aggregate([{ $unwind: "$comments" }, { $count: "total" }]),
      Feedback.aggregate([{ $unwind: "$likes" }, { $count: "total" }]),
      User.countDocuments({ points: { $gt: 0 } }),
    ]);

    res.json({
      totalPosts: stats[0],
      totalComments: stats[1][0]?.total || 0,
      totalLikes: stats[2][0]?.total || 0,
      activeMembers: stats[3],
    });
  } catch (error) {
    res.status(500).json({
      message: "Error fetching community stats",
      error: error.message,
    });
  }
};

// Get user's remaining daily limits
export const getUserDailyLimits = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!checkSubscriptionAccess(user)) {
      return res
        .status(403)
        .json({ message: "Subscription expired. Community access denied." });
    }

    const remainingLimits = await getRemainingLimits(userId);

    if (!remainingLimits) {
      return res.status(500).json({ message: "Error fetching limits" });
    }

    const allExhausted = areAllLimitsExhausted(remainingLimits);

    res.json({
      success: true,
      remainingLimits,
      allExhausted,
      maxLimits: {
        posts: 10,
        likes: 10,
        comments: 10,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching daily limits", error: error.message });
  }
};
