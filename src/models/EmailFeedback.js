import mongoose from 'mongoose';

const emailFeedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  emailType: {
    type: String,
    enum: ['bulk', 'category', 'city', 'country', 'selected'],
    required: true
  },
  filterCriteria: {
    category: String,
    city: String,
    country: String
  },
  recipients: [{
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead'
    },
    email: String,
    name: String,
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent'
    },
    opened: {
      type: Boolean,
      default: false
    },
    clicked: {
      type: Boolean,
      default: false
    },
    openedAt: Date,
    clickedAt: Date,
    openCount: {
      type: Number,
      default: 0
    },
    clickCount: {
      type: Number,
      default: 0
    }
  }],
  totalRecipients: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

emailFeedbackSchema.index({ userId: 1, sentAt: -1 });
emailFeedbackSchema.index({ emailType: 1 });

export default mongoose.model('EmailFeedback', emailFeedbackSchema);
