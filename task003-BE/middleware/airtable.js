const User = require("../models/User");

exports.withAirtableAuth = async (req, res, next) => {
  try {
    console.log("Session in middleware:", {
      sessionId: req.session.id,
      hasUser: !!req.session.user,
      userId: req.session.user?._id,
    });

    if (req.session?.user?._id) {
      const user = await User.findById(req.session.user._id);
      if (user) {
        req.user = user;
        return next();
      } else {
        console.log("User from session not found in DB");
      }
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const user = await User.findOne({ airtableToken: token });
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

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
