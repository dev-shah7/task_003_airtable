const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const axios = require("axios");
const qs = require("qs");
const User = require("../models/User");
const { withAirtableAuth } = require("../middleware/airtable");
const baseController = require("../controllers/baseController");
const ticketController = require("../controllers/ticketController");
const cookieController = require("../controllers/cookieController");

const authorizationCache = {};

setInterval(() => {
  const now = Date.now();
  Object.entries(authorizationCache).forEach(([state, data]) => {
    if (now - data.timestamp > 15 * 60 * 1000) {
      delete authorizationCache[state];
    }
  });
}, 15 * 60 * 1000);

router.get("/auth", async (req, res) => {
  try {
    let userId;
    const tempUser = await User.create({});
    userId = tempUser._id;

    const state = crypto.randomBytes(100).toString("base64url");

    const codeVerifier = crypto.randomBytes(96).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    authorizationCache[state] = {
      codeVerifier,
      userId: userId,
      timestamp: Date.now(),
    };

    console.log("Storing in auth cache:", {
      state,
      userId,
      timestamp: Date.now(),
    });

    const authUrl = new URL(`${process.env.AIRTABLE_URL}/oauth2/v1/authorize`);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("client_id", process.env.AIRTABLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", process.env.AIRTABLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", process.env.AIRTABLE_SCOPE);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error("Auth initialization error:", error);
    res.redirect(
      `${process.env.PUBLIC_APP_URL}?error=auth_initialization_failed`
    );
  }
});

router.get("/callback", async (req, res) => {
  console.log("Received Airtable callback:");
  console.log("Query params:", req.query);

  const { state, code, error, error_description } = req.query;

  const cached = authorizationCache[state];
  if (!cached) {
    console.error("Invalid state - no matching cache entry found");
    return res.redirect(`${process.env.PUBLIC_APP_URL}?error=invalid_state`);
  }

  delete authorizationCache[state];

  if (error) {
    console.error("OAuth error received:", { error, error_description });
    return res.redirect(
      `${process.env.PUBLIC_APP_URL}?error=${error}&description=${error_description}`
    );
  }

  console.log("Cached code:", cached);
  try {
    const encodedCredentials = Buffer.from(
      `${process.env.AIRTABLE_CLIENT_ID}:${process.env.AIRTABLE_CLIENT_SECRET}`
    ).toString("base64");

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

    if (cached.userId) {
      try {
        const userInfoResponse = await axios.get(
          `https://api.airtable.com/v0/meta/whoami`,
          {
            headers: {
              Authorization: `Bearer ${response.data.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const existingUser = await User.findOne({
          airtableUserId: userInfoResponse.data.id,
        });

        let updatedUser;
        if (existingUser) {
          updatedUser = await User.findByIdAndUpdate(
            existingUser._id,
            {
              airtableToken: response.data.access_token,
              airtableRefreshToken: response.data.refresh_token,
              airtableScopes: response.data.scope.split(" "),
              displayName: userInfoResponse.data.name || "Airtable User",
            },
            { new: true }
          );

          if (cached.userId !== existingUser._id.toString()) {
            await User.findByIdAndDelete(cached.userId);
          }
        } else {
          updatedUser = await User.findByIdAndUpdate(
            cached.userId,
            {
              airtableToken: response.data.access_token,
              airtableRefreshToken: response.data.refresh_token,
              airtableScopes: response.data.scope.split(" "),
              airtableUserId: userInfoResponse.data.id,
              displayName: userInfoResponse.data.name || "Airtable User",
            },
            { new: true }
          );
        }

        req.session.user = updatedUser;
        await req.session.save();

        console.log("Updated user session:", {
          sessionId: req.session.id,
          userId: updatedUser._id,
          airtableUserId: updatedUser.airtableUserId,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          "Failed to get/update user info:",
          error.response?.data || error
        );
      }
    }

    const encodedToken = encodeURIComponent(response.data.access_token);
    res.redirect(`${process.env.PUBLIC_APP_URL}?airtableToken=${encodedToken}`);
  } catch (error) {
    console.error("Token exchange error:", error.response?.data || error);
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

router.post("/sync-bases", baseController.syncBases);
router.get("/user-bases", withAirtableAuth, baseController.getUserBases);

router.post(
  "/bases/:baseId/tables/:tableId/sync-tickets",
  withAirtableAuth,
  ticketController.syncTickets
);
router.get(
  "/bases/:baseId/tables/:tableId/records",
  withAirtableAuth,
  ticketController.getUserTickets
);

router.post("/cookies", cookieController.getAirtableCookies);
router.post("/mfa", cookieController.submitMFACode);

module.exports = router;
