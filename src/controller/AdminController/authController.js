import jwt from 'jsonwebtoken';

// Hardcoded admin credentials
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123'
};

// POST /api/admin/login
export const adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('Received credentials:', { username, password });

    if (username !== ADMIN_CREDENTIALS.username || password !== ADMIN_CREDENTIALS.password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.json({ 
      message: 'Login successful',
      token: token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/admin/logout
export const adminLogout = (req, res) => {
  res.clearCookie('adminToken');
  res.json({ message: 'Logout successful' });
};