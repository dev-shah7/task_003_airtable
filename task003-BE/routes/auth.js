const express = require("express");
const passport = require("passport");
const router = express.Router();
const { isAuthenticated, isNotAuthenticated } = require("../middleware/auth");

// Public routes
router.get(
  "/google",
  isNotAuthenticated,
  passport.authenticate("google", {
    scope: ["email", "profile"],
  })
);

router.get(
  "/google/callback",
  isNotAuthenticated,
  passport.authenticate("google", {
    failureRedirect: "/login-failed",
  }),
  (req, res) => {
    res.redirect(process.env.PUBLIC_APP_URL);
  }
);

// Protected routes
router.get("/status", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      isAuthenticated: true,
      user: req.user,
    });
  } else {
    res.json({
      isAuthenticated: false,
      user: null,
    });
  }
});

router.get("/logout", isAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Error logging out" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Example of a protected route
router.get("/profile", isAuthenticated, (req, res) => {
  res.json({
    user: req.user,
    message: "This is a protected route",
  });
});

module.exports = router;
