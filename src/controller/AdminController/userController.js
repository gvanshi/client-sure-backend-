import User from "../../models/User.js";

// GET /api/admin/users
export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate("subscription.planId")
      .select("-passwordHash -resetTokenHash")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/users/:id
export const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("subscription.planId")
      .select("-passwordHash -resetTokenHash");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/users/:id/tokens
export const updateUserTokens = async (req, res) => {
  try {
    const { tokens } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.tokens = tokens;
    await user.save();
    res.json({ message: "User tokens updated successfully", user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/users/:id/status
export const updateUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.subscription) {
      user.subscription = {};
    }

    user.subscription.isActive = isActive;

    // If activating and plan is expired or no end date, extend it by 30 days
    if (isActive) {
      const now = new Date();
      if (!user.subscription.endDate || user.subscription.endDate < now) {
        const thirtyDaysFromNow = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        user.subscription.endDate = thirtyDaysFromNow;
        console.log(`Extended subscription for ${user.email} by 30 days`);
      }
    }

    await user.save();

    // Populate plan details for response
    await user.populate("subscription.planId");

    res.json({
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      user,
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ error: error.message });
  }
};
