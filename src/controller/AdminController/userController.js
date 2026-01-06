import User from '../../models/User.js';

// GET /api/admin/users
export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate('subscription.planId')
      .select('-passwordHash -resetTokenHash')
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
      .populate('subscription.planId')
      .select('-passwordHash -resetTokenHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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
      return res.status(404).json({ error: 'User not found' });
    }

    user.tokens = tokens;
    await user.save();
    res.json({ message: 'User tokens updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};