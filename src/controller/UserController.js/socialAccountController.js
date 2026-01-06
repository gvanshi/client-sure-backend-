import SocialAccount from "../../models/SocialAccount.js";

// Get user's social accounts
export const getSocialAccounts = async (req, res) => {
  try {
    const accounts = await SocialAccount.find({ user_id: req.user.id });
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching accounts', error: error.message });
  }
};

// Add new social account
export const addSocialAccount = async (req, res) => {
  try {
    const { platform, username, url } = req.body;
    
    const account = new SocialAccount({
      user_id: req.user.id,
      platform,
      username,
      url
    });
    
    await account.save();
    res.status(201).json({ message: 'Account added successfully', account });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Account for this platform already exists' });
    }
    res.status(500).json({ message: 'Error adding account', error: error.message });
  }
};

// Delete social account
export const deleteSocialAccount = async (req, res) => {
  try {
    const { id } = req.params;
    
    const account = await SocialAccount.findOneAndDelete({ 
      _id: id, 
      user_id: req.user.id 
    });
    
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    
    res.json({ message: 'Account removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error removing account', error: error.message });
  }
};