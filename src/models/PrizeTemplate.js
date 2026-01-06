import mongoose from 'mongoose';

const prizeTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  period: {
    type: String,
    required: true,
    enum: ['weekly', 'monthly', 'custom']
  },
  prizes: {
    first: {
      type: Number,
      required: true
    },
    second: {
      type: Number,
      required: true
    },
    third: {
      type: Number,
      required: true
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model('PrizeTemplate', prizeTemplateSchema);