import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';
import { markNotificationsAsRead, cleanOldNotifications } from '../utils/notificationUtils.js';

const router = express.Router();

// GET /api/notifications - Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    
    const user = await User.findById(userId)
      .populate('notifications.fromUser', 'name avatar')
      .populate('notifications.postId', 'post_title')
      .select('notifications unreadNotificationCount');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const notifications = user.notifications.slice(skip, skip + parseInt(limit));

    res.json({
      notifications,
      unreadCount: user.unreadNotificationCount,
      totalCount: user.notifications.length,
      hasMore: user.notifications.length > skip + parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
});

// GET /api/notifications/count - Get unread notification count
router.get('/count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('unreadNotificationCount');
    
    if (!user) {
      console.log(`❌ User ${userId} not found for notification count`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`🔢 Notification count for user ${userId}: ${user.unreadNotificationCount || 0}`);
    res.json({ count: user.unreadNotificationCount || 0 });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.status(500).json({ message: 'Error fetching notification count', error: error.message });
  }
});

// PUT /api/notifications/mark-read - Mark specific notifications as read
router.put('/mark-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationIds } = req.body;

    const success = await markNotificationsAsRead(userId, notificationIds);
    
    if (success) {
      res.json({ message: 'Notifications marked as read' });
    } else {
      res.status(500).json({ message: 'Error marking notifications as read' });
    }
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ message: 'Error marking notifications as read', error: error.message });
  }
});

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const success = await markNotificationsAsRead(userId);
    
    if (success) {
      res.json({ message: 'All notifications marked as read' });
    } else {
      res.status(500).json({ message: 'Error marking all notifications as read' });
    }
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ message: 'Error marking all notifications as read', error: error.message });
  }
});

// DELETE /api/notifications/all - Delete all notifications
router.delete('/all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    await User.findByIdAndUpdate(userId, {
      $set: { 
        notifications: [],
        unreadNotificationCount: 0
      }
    });

    res.json({ message: 'All notifications deleted successfully' });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ message: 'Error deleting all notifications', error: error.message });
  }
});

// DELETE /api/notifications/:notificationId - Delete specific notification
router.delete('/:notificationId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Decrease unread count if notification was unread
    const updateQuery = {
      $pull: { notifications: { _id: notificationId } }
    };
    
    if (!notification.isRead) {
      updateQuery.$inc = { unreadNotificationCount: -1 };
    }

    await User.findByIdAndUpdate(userId, updateQuery);

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Error deleting notification', error: error.message });
  }
});

// DELETE /api/notifications/clean - Clean old notifications
router.delete('/clean', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const success = await cleanOldNotifications(userId);
    
    if (success) {
      res.json({ message: 'Old notifications cleaned' });
    } else {
      res.status(500).json({ message: 'Error cleaning old notifications' });
    }
  } catch (error) {
    console.error('Error cleaning notifications:', error);
    res.status(500).json({ message: 'Error cleaning notifications', error: error.message });
  }
});

export default router;