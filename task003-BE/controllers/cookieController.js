const puppeteer = require("puppeteer");

const AIRTABLE_BASE_URL = "https://airtable.com/login";
let browserInstance = null;
let pageInstance = null;

const initializeBrowser = async () => {
  try {
    // Close any existing browser instance
    await cleanup();

    browserInstance = await puppeteer.launch({
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      defaultViewport: null,
      protocolTimeout: 180000,
    });
    return browserInstance;
  } catch (error) {
    console.error("Browser initialization error:", error);
    throw error;
  }
};

const getAirtableCookies = async (req, res) => {
  try {
    browserInstance = await initializeBrowser();
    pageInstance = await browserInstance.newPage();
    pageInstance.setDefaultNavigationTimeout(120000);
    pageInstance.setDefaultTimeout(120000);

    console.log("Navigating to login page...");
    await pageInstance.goto(AIRTABLE_BASE_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("Entering email...");
    await pageInstance.waitForSelector('input[type="email"]', {
      timeout: 30000,
    });
    await pageInstance.type('input[type="email"]', process.env.AIRTABLE_EMAIL);

    console.log("Clicking continue...");
    await pageInstance.click('button[type="submit"]');

    console.log("Waiting for password field...");
    await pageInstance.waitForSelector('input[type="password"]', {
      timeout: 30000,
    });
    await pageInstance.type(
      'input[type="password"]',
      process.env.AIRTABLE_PASSWORD
    );

    console.log("Submitting login...");
    await Promise.all([
      pageInstance.click('button[type="submit"]'),
      pageInstance
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 60000,
        })
        .catch(() => {}),
    ]);

    // Update MFA detection to look for authenticator input
    try {
      // Look specifically for the authenticator app input field
      const mfaInput = await pageInstance.waitForSelector(
        'input[placeholder*="digit code"]',
        {
          timeout: 5000,
        }
      );

      if (mfaInput) {
        console.log("Authenticator verification required");
        return res.status(202).json({
          status: "MFA_REQUIRED",
          message:
            "Please enter the authentication code from your authenticator app",
          type: "authenticator",
        });
      }
    } catch (mfaError) {
      console.log("No MFA verification required, continuing...");
    }

    // Rest of your existing cookie retrieval logic...
    return await completeCookieRetrieval(res);
  } catch (error) {
    console.error("Error in cookie retrieval:", error);
    await cleanup();
    res.status(500).json({
      error: "Failed to retrieve Airtable cookies",
      details: error.message,
    });
  }
};

const submitMFACode = async (req, res) => {
  try {
    if (!pageInstance) {
      throw new Error("No active login session found");
    }

    const { mfaCode } = req.body;
    if (!mfaCode) {
      throw new Error("MFA code is required");
    }

    try {
      console.log("Entering MFA code...");
      await pageInstance.type('input[name="code"]', mfaCode);

      console.log("Submitting MFA form...");
      await pageInstance.click(
        "div.link-quiet.rounded.py1.px2.blue.text-white.display.pointer.center"
      );

      // Wait for navigation to complete
      await pageInstance.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      console.log("Waiting for session to stabilize...");
      // Use evaluate to wait in the browser context
      await pageInstance.evaluate(
        () => new Promise((r) => setTimeout(r, 10000))
      );

      // Make sure we're on airtable.com domain
      const url = await pageInstance.url();
      if (!url.includes("airtable.com")) {
        throw new Error("Not on Airtable domain after MFA");
      }

      // Get all cookies from the page
      const cookies = await pageInstance.cookies();
      console.log(
        "Retrieved cookies:",
        cookies.map((c) => c.name)
      );

      // Try to get cookies multiple times if needed
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          return await completeCookieRetrieval(res);
        } catch (cookieError) {
          attempts++;
          if (attempts === maxAttempts) throw cookieError;
          console.log(
            `Cookie retrieval attempt ${attempts} failed, retrying...`
          );
          // Use evaluate for timeout
          await pageInstance.evaluate(
            () => new Promise((r) => setTimeout(r, 5000))
          );
        }
      }
    } catch (error) {
      console.error("MFA submission error:", error);
      throw new Error(`Failed to submit MFA code: ${error.message}`);
    }
  } catch (error) {
    console.error("Error in MFA submission:", error);
    await cleanup();
    res.status(500).json({
      success: false,
      error: "Failed to submit MFA code",
      details: error.message,
    });
  }
};

const completeCookieRetrieval = async (res) => {
  try {
    const cookies = await pageInstance.cookies();
    console.log(
      "Retrieving cookies from domains:",
      [...new Set(cookies.map((c) => c.domain))].join(", ")
    );

    const requiredCookies = [
      "connect.sid",
      "__Host-airtable-session",
      "__Host-airtable-session.sig",
      "brw",
      "AWSALBTG",
      "AWSALBTGCORS",
    ];

    const cookieValues = {};
    requiredCookies.forEach((name) => {
      const cookie = cookies.find((c) => c.name === name);
      if (cookie) {
        cookieValues[name] = cookie.value;
        console.log(`Found cookie: ${name}`);
      } else {
        console.log(`Missing cookie: ${name}`);
      }
    });

    if (!cookieValues["__Host-airtable-session"]) {
      throw new Error(
        "Essential session cookie missing! Login might have failed."
      );
    }

    await cleanup();

    res.cookie("authCookies", JSON.stringify(cookieValues), {
      httpOnly: true,
      secure: true,
      sameSite: "None",
    });

    return res.json({
      success: true,
      message: "Cookies retrieved and set",
      cookies: cookieValues,
    });
  } catch (error) {
    throw error;
  }
};

const cleanup = async () => {
  if (browserInstance) {
    try {
      const pages = await browserInstance.pages();
      await Promise.all(pages.map((page) => page.close()));
      await browserInstance.close();
    } catch (closeError) {
      console.error("Error closing browser:", closeError);
    } finally {
      browserInstance = null;
      pageInstance = null;
    }
  }
};

// Add this at the top of the file
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

module.exports = {
  getAirtableCookies,
  submitMFACode,
};
