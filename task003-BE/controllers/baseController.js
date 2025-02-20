const Base = require("../models/Base");
const User = require("../models/User");
const axios = require("axios");

exports.syncBases = async (req, res) => {
  console.log("Session user:", req.session?.user);
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log("Using token:", token);

    // Fetch bases from Airtable with proper API version
    try {
      const response = await axios.get(
        "https://api.airtable.com/v0/meta/bases",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          validateStatus: (status) => status < 500, // Don't throw on 4xx errors
        }
      );

      if (response.status === 401) {
        return res.status(401).json({
          error: "Invalid or expired Airtable token",
          details: response.data,
        });
      }

      if (!response.data.bases) {
        console.error("Unexpected Airtable response:", response.data);
        return res.status(500).json({
          error: "Invalid response from Airtable",
          details: response.data,
        });
      }

      console.log("Fetched bases from Airtable:", response.data.bases);

      // Store bases in MongoDB
      if (req.session?.user?._id) {
        const userId = req.session.user._id;
        console.log("Using session user ID:", userId);

        // Delete existing bases for this user
        await Base.deleteMany({ userId });
        console.log("Deleted existing bases for user");

        const basesToCreate = response.data.bases.map((base) => ({
          id: base.id,
          name: base.name,
          permissionLevel: base.permissionLevel,
          userId,
        }));

        const createdBases = await Base.insertMany(basesToCreate);
        console.log("Created new bases:", createdBases);

        res.json({
          success: true,
          bases: createdBases,
        });
      } else {
        console.log("No user ID found in session");
        res.status(401).json({ error: "User not authenticated" });
      }
    } catch (apiError) {
      console.error("Airtable API error:", apiError.response?.data || apiError);
      res.status(apiError.response?.status || 500).json({
        error: "Failed to fetch bases from Airtable",
        details: apiError.response?.data || apiError.message,
      });
    }
  } catch (error) {
    console.error("Sync bases error:", error);
    res.status(500).json({
      error: "Failed to sync bases",
      details: error.message,
    });
  }
};

exports.getUserBases = async (req, res) => {
  try {
    if (!req.session?.user?._id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userId = req.session.user._id;
    const bases = await Base.find({ userId });
    console.log("Found bases for user:", bases);

    res.json({
      success: true,
      bases,
    });
  } catch (error) {
    console.error("Failed to fetch user bases:", error);
    res.status(500).json({
      error: "Failed to fetch bases",
      details: error.message,
    });
  }
};
