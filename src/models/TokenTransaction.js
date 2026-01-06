import mongoose from 'mongoose';

const tokenTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  packageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TokenPackage',
    required: true
  },
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    enum: ['purchase', 'bonus', 'refund', 'expiry'],
    default: 'purchase'
  },
  tokens: {
    type: Number,
    required: true,
    min: 1
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentDetails: {
    orderId: String,
    paymentId: String,
    paymentMethod: String,
    gateway: {
      type: String,
      default: 'razorpay'
    }
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    purchaseReason: String,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
tokenTransactionSchema.index({ userId: 1, createdAt: -1 });
tokenTransactionSchema.index({ status: 1, createdAt: -1 });
tokenTransactionSchema.index({ 'metadata.expiresAt': 1 });

// Auto-expire tokens after 24 hours
tokenTransactionSchema.index({ 'metadata.expiresAt': 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('TokenTransaction', tokenTransactionSchema);