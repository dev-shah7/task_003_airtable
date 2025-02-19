const express = require("express");
const router = express.Router();

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

module.exports = router;
