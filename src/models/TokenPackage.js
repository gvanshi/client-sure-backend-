import mongoose from 'mongoose';

const tokenPackageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  tokens: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPopular: {
    type: Boolean,
    default: false
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  metadata: {
    category: {
      type: String,
      enum: ['emergency', 'standard', 'premium', 'bulk'],
      default: 'standard'
    },
    validityHours: {
      type: Number,
      default: 24 // Tokens expire after 24 hours
    },
    maxPurchasePerDay: {
      type: Number,
      default: 10 // Max 10 purchases per day
    }
  }
}, {
  timestamps: true
});

// Index for better query performance
tokenPackageSchema.index({ isActive: 1, sortOrder: 1 });
tokenPackageSchema.index({ tokens: 1, price: 1 });

export default mongoose.model('TokenPackage', tokenPackageSchema);