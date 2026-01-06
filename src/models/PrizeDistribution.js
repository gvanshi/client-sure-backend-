import mongoose from 'mongoose';

const prizeDistributionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  position: {
    type: Number,
    required: true,
    enum: [1, 2, 3]
  },
  tokenAmount: {
    type: Number,
    required: true
  },
  period: {
    type: String,
    required: true,
    enum: ['weekly', 'monthly', 'custom', 'alltime']
  },
  dateRange: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },
  awardedAt: {
    type: Date,
    default: Date.now
  },
  awardedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notificationSent: {
    type: Boolean,
    default: false
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  contestName: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model('PrizeDistribution', prizeDistributionSchema);