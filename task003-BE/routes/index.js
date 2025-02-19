const express = require("express");
const router = express.Router();
const authRoutes = require("./auth");
const airtableRoutes = require("./airtable");

router.get("/", (req, res) => {
  res.json({ message: "Welcome to the API" });
});

// Public routes
router.use("/auth", authRoutes);

// Add Airtable routes
router.use("/airtable", airtableRoutes);

module.exports = router;
