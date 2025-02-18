const express = require("express");
const router = express.Router();
const authRoutes = require("./auth");
const { isAuthenticated } = require("../middleware/auth");

router.get("/", (req, res) => {
  res.json({ message: "Welcome to the API" });
});

// Public routes
router.use("/auth", authRoutes);

// Protected routes example
router.get("/protected-resource", isAuthenticated, (req, res) => {
  res.json({
    message: "This is a protected resource",
    user: req.user,
  });
});

module.exports = router;
