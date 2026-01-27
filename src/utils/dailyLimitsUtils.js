import User from "../models/User.js";

// Check if it's a new day and reset limits if needed
export const checkAndResetDailyLimits = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return null;

    const today = new Date().toDateString();
    const userDate = new Date(user.dailyLimits.date).toDateString();

    // If it's a new day, reset all limits
    if (today !== userDate) {
      await User.findByIdAndUpdate(userId, {
        "dailyLimits.date": new Date(),
        "dailyLimits.posts": 0,
        "dailyLimits.likes": 0,
        "dailyLimits.comments": 0,
      });

      return {
        posts: 0,
        likes: 0,
        comments: 0,
      };
    }

    return {
      posts: user.dailyLimits.posts,
      likes: user.dailyLimits.likes,
      comments: user.dailyLimits.comments,
    };
  } catch (error) {
    console.error("Error checking daily limits:", error);
    return null;
  }
};

// Check if user can perform specific action
export const canPerformAction = async (userId, actionType) => {
  try {
    const currentLimits = await checkAndResetDailyLimits(userId);
    if (!currentLimits) return { canPerform: false, error: "User not found" };

    const DAILY_LIMITS = {
      posts: 10,
      likes: 10,
      comments: 10,
    };

    const canPerform = currentLimits[actionType] < DAILY_LIMITS[actionType];
    const remaining = DAILY_LIMITS[actionType] - currentLimits[actionType];

    return {
      canPerform,
      remaining,
      currentCount: currentLimits[actionType],
      maxLimit: DAILY_LIMITS[actionType],
      remainingLimits: {
        posts: DAILY_LIMITS.posts - currentLimits.posts,
        likes: DAILY_LIMITS.likes - currentLimits.likes,
        comments: DAILY_LIMITS.comments - currentLimits.comments,
      },
    };
  } catch (error) {
    console.error("Error checking action permission:", error);
    return { canPerform: false, error: "Server error" };
  }
};

// Increment daily count for specific action
export const incrementDailyCount = async (userId, actionType) => {
  try {
    const updateField = `dailyLimits.${actionType}`;
    await User.findByIdAndUpdate(userId, {
      $inc: { [updateField]: 1 },
    });
    return true;
  } catch (error) {
    console.error("Error incrementing daily count:", error);
    return false;
  }
};

// Get remaining limits for user
export const getRemainingLimits = async (userId) => {
  try {
    const currentLimits = await checkAndResetDailyLimits(userId);
    if (!currentLimits) return null;

    return {
      posts: 10 - currentLimits.posts,
      likes: 10 - currentLimits.likes,
      comments: 10 - currentLimits.comments,
    };
  } catch (error) {
    console.error("Error getting remaining limits:", error);
    return null;
  }
};

// Check if all limits are exhausted
export const areAllLimitsExhausted = (remainingLimits) => {
  return (
    remainingLimits.posts === 0 &&
    remainingLimits.likes === 0 &&
    remainingLimits.comments === 0
  );
};

// Decrement daily count for specific action (safely)
export const decrementDailyCount = async (userId, actionType) => {
  try {
    // First check if the daily limit record is for today
    // We don't want to decrement if the record is stale (from yesterday)
    // because that would give them an extra action today for deleting yesterday's post
    const user = await User.findById(userId);
    if (!user) return false;

    const today = new Date().toDateString();
    const userDate = new Date(user.dailyLimits.date).toDateString();

    if (today !== userDate) {
      // Record is old, so we shouldn't decrement it (it will be reset to 0 anyway on next action)
      return false;
    }

    const updateField = `dailyLimits.${actionType}`;
    // Only decrement if greater than 0
    if (user.dailyLimits[actionType] > 0) {
      await User.findByIdAndUpdate(userId, {
        $inc: { [updateField]: -1 },
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error decrementing daily count:", error);
    return false;
  }
};
