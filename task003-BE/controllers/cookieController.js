const puppeteer = require("puppeteer");

let browserInstance = null;
let pageInstance = null;

const initializeBrowser = async () => {
  try {
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

    await pageInstance.goto(`${process.env.AIRTABLE_URL}/login`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    await pageInstance.waitForSelector('input[type="email"]', {
      timeout: 30000,
    });
    await pageInstance.type('input[type="email"]', process.env.AIRTABLE_EMAIL);

    await pageInstance.click('button[type="submit"]');

    await pageInstance.waitForSelector('input[type="password"]', {
      timeout: 30000,
    });
    await pageInstance.type(
      'input[type="password"]',
      process.env.AIRTABLE_PASSWORD
    );

    await Promise.all([
      pageInstance.click('button[type="submit"]'),
      pageInstance
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 60000,
        })
        .catch(() => {}),
    ]);

    try {
      const mfaInput = await pageInstance.waitForSelector(
        'input[placeholder*="digit code"]',
        {
          timeout: 5000,
        }
      );

      if (mfaInput) {
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
      await pageInstance.type('input[name="code"]', mfaCode);

      await pageInstance.click(
        "div.link-quiet.rounded.py1.px2.blue.text-white.display.pointer.center"
      );

      await pageInstance.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      await pageInstance.evaluate(
        () => new Promise((r) => setTimeout(r, 10000))
      );

      const url = await pageInstance.url();
      if (!url.includes("airtable.com")) {
        throw new Error("Not on Airtable domain after MFA");
      }

      const cookies = await pageInstance.cookies();
      console.log(
        "Retrieved cookies:",
        cookies.map((c) => c.name)
      );

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

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

module.exports = {
  getAirtableCookies,
  submitMFACode,
};
