import EmailFeedback from '../../models/EmailFeedback.js';

// Get all email campaigns with pagination and filters
export const getEmails = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      emailType, 
      startDate, 
      endDate 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter query
    const filter = {};
    
    if (emailType) {
      filter.emailType = emailType;
    }
    
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) {
        filter.sentAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.sentAt.$lte = new Date(endDate);
      }
    }

    // Get emails with user details
    const emailFeedbacks = await EmailFeedback.find(filter)
      .populate('userId', 'name email')
      .populate('recipients.leadId', 'name email category city country')
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate engagement rates for each email
    const emailsWithRates = emailFeedbacks.map(email => {
      const openedCount = email.recipients.filter(r => r.opened).length;
      const clickedCount = email.recipients.filter(r => r.clicked).length;
      
      const openRate = email.totalRecipients > 0 
        ? ((openedCount / email.totalRecipients) * 100).toFixed(1)
        : '0.0';
      
      const clickRate = email.totalRecipients > 0 
        ? ((clickedCount / email.totalRecipients) * 100).toFixed(1)
        : '0.0';

      return {
        ...email.toObject(),
        openedCount,
        clickedCount,
        openRate,
        clickRate
      };
    });

    // Get total count for pagination
    const total = await EmailFeedback.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      emailFeedbacks: emailsWithRates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    });

  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
};

// Get single email campaign details
export const getEmailById = async (req, res) => {
  try {
    const { id } = req.params;

    const email = await EmailFeedback.findById(id)
      .populate('userId', 'name email')
      .populate('recipients.leadId', 'name email category city country');

    if (!email) {
      return res.status(404).json({ error: 'Email campaign not found' });
    }

    // Add engagement status to recipients
    const recipientsWithEngagement = email.recipients.map(recipient => {
      let engagementStatus = 'sent';
      
      if (recipient.clicked) {
        engagementStatus = 'clicked';
      } else if (recipient.opened) {
        engagementStatus = 'opened';
      } else if (recipient.status === 'failed') {
        engagementStatus = 'failed';
      }

      return {
        ...recipient.toObject(),
        engagementStatus
      };
    });

    const emailWithEngagement = {
      ...email.toObject(),
      recipients: recipientsWithEngagement
    };

    res.json(emailWithEngagement);

  } catch (error) {
    console.error('Get email by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch email details' });
  }
};

// Get email statistics
export const getEmailStats = async (req, res) => {
  try {
    // Get total campaigns
    const totalEmailCampaigns = await EmailFeedback.countDocuments();

    // Get aggregated stats
    const stats = await EmailFeedback.aggregate([
      {
        $group: {
          _id: null,
          totalEmailsSent: { $sum: '$successCount' },
          totalEmailsFailed: { $sum: '$failedCount' },
          totalRecipients: { $sum: '$totalRecipients' }
        }
      }
    ]);

    // Get engagement stats from recipients
    const engagementStats = await EmailFeedback.aggregate([
      { $unwind: '$recipients' },
      {
        $group: {
          _id: null,
          totalEmailsOpened: {
            $sum: { $cond: [{ $eq: ['$recipients.opened', true] }, 1, 0] }
          },
          totalEmailsClicked: {
            $sum: { $cond: [{ $eq: ['$recipients.clicked', true] }, 1, 0] }
          }
        }
      }
    ]);

    const baseStats = stats[0] || {
      totalEmailsSent: 0,
      totalEmailsFailed: 0,
      totalRecipients: 0
    };

    const engagement = engagementStats[0] || {
      totalEmailsOpened: 0,
      totalEmailsClicked: 0
    };

    // Calculate rates
    const openRate = baseStats.totalRecipients > 0 
      ? ((engagement.totalEmailsOpened / baseStats.totalRecipients) * 100).toFixed(1)
      : '0.0';

    const clickRate = baseStats.totalRecipients > 0 
      ? ((engagement.totalEmailsClicked / baseStats.totalRecipients) * 100).toFixed(1)
      : '0.0';

    res.json({
      totalEmailCampaigns,
      totalEmailsSent: baseStats.totalEmailsSent,
      totalEmailsFailed: baseStats.totalEmailsFailed,
      totalEmailsOpened: engagement.totalEmailsOpened,
      totalEmailsClicked: engagement.totalEmailsClicked,
      openRate,
      clickRate
    });

  } catch (error) {
    console.error('Get email stats error:', error);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
};

// Delete email campaign
export const deleteEmail = async (req, res) => {
  try {
    const { id } = req.params;

    const email = await EmailFeedback.findByIdAndDelete(id);

    if (!email) {
      return res.status(404).json({ error: 'Email campaign not found' });
    }

    res.json({ message: 'Email campaign deleted successfully' });

  } catch (error) {
    console.error('Delete email error:', error);
    res.status(500).json({ error: 'Failed to delete email campaign' });
  }
};