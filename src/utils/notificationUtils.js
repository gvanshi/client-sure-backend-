import User from '../models/User.js';

// Create notification for users
export const createNotification = async (userId, type, message, postId, fromUserId) => {
  try {
    console.log(`🔔 Creating notification for user ${userId}:`, { type, message });
    
    const notification = {
      type,
      message,
      postId,
      fromUser: fromUserId,
      isRead: false,
      createdAt: new Date()
    };

    const result = await User.findByIdAndUpdate(userId, {
      $push: { notifications: { $each: [notification], $position: 0 } },
      $inc: { unreadNotificationCount: 1 }
    }, { new: true });

    if (result) {
      console.log(`✅ Notification successfully created for user ${userId}`);
      console.log(`🔔 User now has ${result.unreadNotificationCount} unread notifications`);
      return true;
    } else {
      console.log(`❌ User ${userId} not found`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    return false;
  }
};

// Notify all users about new post (except the author)
export const notifyNewPost = async (postAuthorId, postId, postTitle) => {
  try {
    const users = await User.find({ 
      _id: { $ne: postAuthorId },
      'subscription.endDate': { $gte: new Date() }
    }).select('_id');

    const author = await User.findById(postAuthorId).select('name');
    const message = `${author.name} created a new post: "${postTitle}"`;

    const notifications = users.map(user => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $push: { 
            notifications: { 
              $each: [{
                type: 'new_post',
                message,
                postId,
                fromUser: postAuthorId,
                isRead: false,
                createdAt: new Date()
              }], 
              $position: 0 
            }
          },
          $inc: { unreadNotificationCount: 1 }
        }
      }
    }));

    if (notifications.length > 0) {
      await User.bulkWrite(notifications);
      console.log(`New post notifications sent to ${notifications.length} users`);
    }

    return true;
  } catch (error) {
    console.error('Error notifying new post:', error);
    return false;
  }
};

// Mark notifications as read
export const markNotificationsAsRead = async (userId, notificationIds = null) => {
  try {
    let updateQuery;
    
    if (notificationIds && notificationIds.length > 0) {
      // Mark specific notifications as read
      updateQuery = {
        $set: { 
          'notifications.$[elem].isRead': true 
        },
        $inc: { unreadNotificationCount: -notificationIds.length }
      };
      
      await User.findByIdAndUpdate(userId, updateQuery, {
        arrayFilters: [{ 'elem._id': { $in: notificationIds }, 'elem.isRead': false }]
      });
    } else {
      // Mark all notifications as read
      const user = await User.findById(userId);
      const unreadCount = user.unreadNotificationCount;
      
      await User.findByIdAndUpdate(userId, {
        $set: { 
          'notifications.$[].isRead': true,
          unreadNotificationCount: 0
        }
      });
    }

    return true;
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return false;
  }
};

// Clean old notifications (keep only last 50)
export const cleanOldNotifications = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (user.notifications.length > 50) {
      const notificationsToKeep = user.notifications.slice(0, 50);
      await User.findByIdAndUpdate(userId, {
        $set: { notifications: notificationsToKeep }
      });
    }
    return true;
  } catch (error) {
    console.error('Error cleaning old notifications:', error);
    return false;
  }
};