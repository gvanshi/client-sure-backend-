import jwt from "jsonwebtoken";


export const authenticateAdmin = (req, res, next) => {
  try {
    let token = req.cookies?.adminToken; 
    
    // ✅ Clean Bearer token properly
    if (req.headers.authorization) {
      const headerToken = req.headers.authorization.replace(/^Bearer\s+/, "");
      token = token || headerToken;
    }
    
    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin role required." });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

