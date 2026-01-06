import mongoose from 'mongoose';

const socialAccountSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['instagram', 'facebook', 'twitter', 'linkedin', 'youtube', 'other']
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

// Ensure user can't have duplicate platforms
socialAccountSchema.index({ user_id: 1, platform: 1 }, { unique: true });

export default mongoose.model('SocialAccount', socialAccountSchema);