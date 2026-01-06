import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true
  },
  durationDays: {
    type: Number,
    required: true
  },
  dailyTokens: {
    type: Number,
    required: true,
    default: 100
  },
  bonusTokens: {
    type: Number,
    required: false,
    default: 0
  },
  totalPlanTokens: {
    type: Number,
    required: false
  },
  providerPlanId: {
    type: String,
    required: false // External payment provider plan ID
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate totalPlanTokens
planSchema.pre('save', function(next) {
  this.totalPlanTokens = this.durationDays * this.dailyTokens;
  next();
});

export default mongoose.model('Plan', planSchema);