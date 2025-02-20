const User = require("../models/User");

exports.withAirtableAuth = async (req, res, next) => {
  try {
    console.log("Session in middleware:", {
      sessionId: req.session.id,
      hasUser: !!req.session.user,
      userId: req.session.user?._id,
    });

    // First check session
    if (req.session?.user?._id) {
      const user = await User.findById(req.session.user._id);
      if (user) {
        console.log("Found user from session:", user._id);
        req.user = user;
        return next();
      } else {
        console.log("User from session not found in DB");
      }
    }

    // If no session, check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // Find user by token
    const user = await User.findOne({ airtableToken: token });
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Store user in session and request
    req.session.user = user;
    req.user = user;
    await req.session.save();

    console.log("Updated session with user:", {
      sessionId: req.session.id,
      userId: user._id,
    });

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
};

async function refreshAirtableToken(user) {
  // Implementation of token refresh logic
  // ... (similar to what's in your airtable.js route)
  return updatedUser;
}
