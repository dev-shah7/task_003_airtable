const User = require("../models/User");

exports.whoami = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error("Whoami error:", error);
    res.status(500).json({ error: "Failed to get user details" });
  }
};
