import mongoose from 'mongoose';
import User from './src/models/User.js';
import Feedback from './src/models/Feedback.js';
import dotenv from 'dotenv';

dotenv.config();

const fixLeaderboardSync = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const users = await User.find({});
    console.log(`Processing ${users.length} users...`);

    for (const user of users) {
      // Calculate actual points based on existing data
      const userPosts = await Feedback.find({ user_id: user._id });
      const userComments = await Feedback.find({ 'comments.user_id': user._id });
      const userLikes = await Feedback.find({ 'likes.user_id': user._id });

      // Count user's comments across all posts
      let totalComments = 0;
      for (const post of userComments) {
        totalComments += post.comments.filter(comment => 
          comment.user_id.toString() === user._id.toString()
        ).length;
      }

      // Calculate correct points
      const postPoints = userPosts.length * 5;
      const commentPoints = totalComments * 2;
      const likePoints = userLikes.length * 1;
      const correctPoints = postPoints + commentPoints + likePoints;

      // Update user with correct data
      await User.findByIdAndUpdate(user._id, {
        points: correctPoints,
        'communityActivity.postsCreated': userPosts.length,
        'communityActivity.commentsMade': totalComments,
        'communityActivity.likesGiven': userLikes.length
      });

      console.log(`Fixed ${user.name}: ${user.points} → ${correctPoints} points`);
    }

    console.log('✅ Leaderboard sync completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixLeaderboardSync();