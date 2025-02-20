const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { withAirtableAuth } = require("../middleware/airtable");

router.get("/status", (req, res) => {
  if (req.isAuthenticated() && req.user) {
    // Store Airtable tokens in session if they exist
    if (req.user.airtableToken) {
      req.session.airtableToken = req.user.airtableToken;
      req.session.airtableRefreshToken = req.user.airtableRefreshToken;
    }

    res.json({
      isAuthenticated: true,
      user: req.user.toSafeObject(),
    });
  } else {
    res.json({ isAuthenticated: false, user: null });
  }
});

router.get("/whoami", withAirtableAuth, authController.whoami);

router.get("/session-test", (req, res) => {
  console.log("Current session:", {
    id: req.session.id,
    user: req.session.user,
    cookie: req.session.cookie,
  });

  res.json({
    sessionId: req.session.id,
    user: req.session.user,
    hasSession: !!req.session.user,
  });
});

// Add this route to test session storage
router.get("/test-session", async (req, res) => {
  try {
    // Store something in session
    if (!req.session.testData) {
      req.session.testData = {
        timestamp: Date.now(),
        random: Math.random(),
      };
      await req.session.save();
      console.log("Created new session data:", req.session.testData);
    }

    console.log("Current session state:", {
      id: req.session.id,
      testData: req.session.testData,
      user: req.session.user,
      cookie: req.session.cookie,
    });

    res.json({
      message: "Session test",
      sessionId: req.session.id,
      testData: req.session.testData,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Session test error:", error);
    res.status(500).json({ error: "Session test failed" });
  }
});

module.exports = router;
