const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const qs = require("qs");
const User = require("../models/User");
const { withAirtableAuth } = require("../middleware/airtable");

// Store authorization states temporarily with cleanup
const authorizationCache = {};

// Cleanup old cache entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  Object.entries(authorizationCache).forEach(([state, data]) => {
    if (now - data.timestamp > 15 * 60 * 1000) {
      // 15 minutes
      delete authorizationCache[state];
    }
  });
}, 15 * 60 * 1000);

// Initialize Airtable OAuth routes
router.get("/auth", (req, res) => {
  // Prevents others from impersonating Airtable
  const state = crypto.randomBytes(100).toString("base64url");

  // Prevents others from impersonating you
  const codeVerifier = crypto.randomBytes(96).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  // Store in cache with user ID and timestamp
  authorizationCache[state] = {
    codeVerifier,
    userId: req.user?._id,
    timestamp: Date.now(),
  };

  // Build authorization URL with correct API version
  const authUrl = new URL(`${process.env.AIRTABLE_URL}/oauth2/v1/authorize`);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("client_id", process.env.AIRTABLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", process.env.AIRTABLE_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", process.env.AIRTABLE_SCOPE);

  console.log("Initiating Airtable OAuth flow:");
  console.log("State:", state);
  console.log("Code Verifier:", codeVerifier);
  console.log("Code Challenge:", codeChallenge);
  console.log("Authorization URL:", authUrl.toString());

  res.redirect(authUrl.toString());
});

router.get("/callback", async (req, res) => {
  console.log("Received Airtable callback:");
  console.log("Query params:", req.query);

  const { state, code, error, error_description } = req.query;

  // Validate state and retrieve cached data
  const cached = authorizationCache[state];
  if (!cached) {
    console.error("Invalid state - no matching cache entry found");
    return res.redirect(`${process.env.PUBLIC_APP_URL}?error=invalid_state`);
  }

  console.log("Found cached data:", {
    userId: cached.userId,
    timestamp: cached.timestamp,
    codeVerifier: cached.codeVerifier,
  });

  // Clean up cache entry
  delete authorizationCache[state];

  // Check for OAuth errors
  if (error) {
    console.error("OAuth error received:", { error, error_description });
    return res.redirect(
      `${process.env.PUBLIC_APP_URL}?error=${error}&description=${error_description}`
    );
  }

  try {
    const encodedCredentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString("base64");

    console.log("Exchanging code for tokens...");
    console.log("Code:", code);
    console.log("Code Verifier:", cached.codeVerifier);

    // Exchange code for tokens
    const response = await axios({
      method: "POST",
      url: `${process.env.AIRTABLE_URL}/oauth2/v1/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encodedCredentials}`,
      },
      data: qs.stringify({
        code_verifier: cached.codeVerifier,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.AIRTABLE_REDIRECT_URI,
      }),
    });

    console.log("Token exchange successful:");
    console.log("Access Token:", response.data.access_token);
    console.log("Refresh Token:", response.data.refresh_token);
    console.log("Scopes:", response.data.scope);
    console.log("Token Type:", response.data.token_type);
    console.log("Expires In:", response.data.expires_in);

    // Update user with Airtable tokens
    if (cached.userId) {
      const updatedUser = await User.findByIdAndUpdate(
        cached.userId,
        {
          airtableToken: response.data.access_token,
          airtableRefreshToken: response.data.refresh_token,
          airtableScopes: response.data.scope.split(" "),
        },
        { new: true }
      );

      console.log("Updated user in database:", {
        id: updatedUser._id,
        scopes: updatedUser.airtableScopes,
        hasToken: !!updatedUser.airtableToken,
        hasRefreshToken: !!updatedUser.airtableRefreshToken,
      });
    }

    // Redirect to success page
    res.redirect(`${process.env.PUBLIC_APP_URL}`);
  } catch (error) {
    console.error("Token exchange error:");
    console.error("Error response:", error.response?.data);
    console.error("Error details:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers,
    });
    console.error("Full error:", error);

    res.redirect(`${process.env.PUBLIC_APP_URL}?error=token_exchange_failed`);
  }
});

router.post("/refresh-token", async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(req.user._id);
    if (!user?.airtableRefreshToken) {
      return res.status(400).json({ error: "No refresh token available" });
    }

    const encodedCredentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString("base64");

    // Refresh token using correct API version
    const response = await axios({
      method: "POST",
      url: `${process.env.AIRTABLE_URL}/v0/oauth2/token`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encodedCredentials}`,
      },
      data: qs.stringify({
        grant_type: "refresh_token",
        refresh_token: user.airtableRefreshToken,
      }),
    });

    // Update user with new tokens
    await User.findByIdAndUpdate(user._id, {
      airtableToken: response.data.access_token,
      airtableRefreshToken: response.data.refresh_token,
      airtableScopes: response.data.scope.split(" "),
    });

    res.json({ success: true });
  } catch (error) {
    console.error(
      "Airtable token refresh error:",
      error.response?.data || error
    );
    res.status(401).json({ error: "Failed to refresh token" });
  }
});

router.post("/disconnect", async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $unset: {
        airtableToken: "",
        airtableRefreshToken: "",
        airtableScopes: "",
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting Airtable:", error);
    res.status(500).json({ error: "Failed to disconnect Airtable" });
  }
});

// Protected Airtable routes
router.get("/bases", withAirtableAuth, async (req, res) => {
  try {
    const response = await axios.get("https://api.airtable.com/v0/meta/bases", {
      headers: {
        Authorization: `Bearer ${req.airtableToken}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bases" });
  }
});

// Protected Airtable API routes
router.get("/records/:baseId/:tableId", withAirtableAuth, async (req, res) => {
  try {
    const { baseId, tableId } = req.params;
    const response = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${tableId}`,
      {
        headers: {
          Authorization: `Bearer ${req.airtableToken}`,
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Airtable API error:", error.response?.data || error);
    res.status(error.response?.status || 500).json({
      error: "Failed to fetch records",
      details: error.response?.data,
    });
  }
});

router.post("/records/:baseId/:tableId", withAirtableAuth, async (req, res) => {
  try {
    const { baseId, tableId } = req.params;
    const { fields } = req.body;

    const response = await axios.post(
      `https://api.airtable.com/v0/${baseId}/${tableId}`,
      {
        records: [{ fields }],
      },
      {
        headers: {
          Authorization: `Bearer ${req.airtableToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("Airtable API error:", error.response?.data || error);
    res.status(error.response?.status || 500).json({
      error: "Failed to create record",
      details: error.response?.data,
    });
  }
});

router.patch(
  "/records/:baseId/:tableId/:recordId",
  withAirtableAuth,
  async (req, res) => {
    try {
      const { baseId, tableId, recordId } = req.params;
      const { fields } = req.body;

      const response = await axios.patch(
        `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`,
        { fields },
        {
          headers: {
            Authorization: `Bearer ${req.airtableToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Airtable API error:", error.response?.data || error);
      res.status(error.response?.status || 500).json({
        error: "Failed to update record",
        details: error.response?.data,
      });
    }
  }
);

router.delete(
  "/records/:baseId/:tableId/:recordId",
  withAirtableAuth,
  async (req, res) => {
    try {
      const { baseId, tableId, recordId } = req.params;

      const response = await axios.delete(
        `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`,
        {
          headers: {
            Authorization: `Bearer ${req.airtableToken}`,
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Airtable API error:", error.response?.data || error);
      res.status(error.response?.status || 500).json({
        error: "Failed to delete record",
        details: error.response?.data,
      });
    }
  }
);

module.exports = router;
