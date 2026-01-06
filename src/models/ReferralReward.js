import mongoose from 'mongoose';

const referralRewardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  referralCount: {
    type: Number,
    required: true
  },
  rewardAmount: {
    type: Number,
    required: true
  },
  rewardType: {
    type: String,
    enum: ['tokens', 'cash', 'subscription'],
    default: 'tokens'
  },
  status: {
    type: String,
    enum: ['pending', 'rewarded', 'cancelled'],
    default: 'pending'
  },
  awardedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  awardedAt: {
    type: Date
  },
  adminNotified: {
    type: Boolean,
    default: false
  },
  adminNotifiedAt: {
    type: Date
  },
  userNotified: {
    type: Boolean,
    default: false
  },
  customMessage: {
    type: String
  }
}, {
  timestamps: true
});

export default mongoose.model('ReferralReward', referralRewardSchema);