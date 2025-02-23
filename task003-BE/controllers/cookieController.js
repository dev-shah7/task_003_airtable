const puppeteer = require("puppeteer");

const AIRTABLE_BASE_URL = "https://airtable.com/login";

const getAirtableCookies = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: null,
      protocolTimeout: 180000, // Increase protocol timeout to 3 minutes
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    console.log("Navigating to login page...");
    await page.goto(AIRTABLE_BASE_URL, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("Entering email...");
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await page.type('input[type="email"]', process.env.AIRTABLE_EMAIL);

    console.log("Clicking continue...");
    await page.click('button[type="submit"]');

    console.log("Waiting for password field...");
    await page.waitForSelector('input[type="password"]', { timeout: 30000 });
    await page.type('input[type="password"]', process.env.AIRTABLE_PASSWORD);

    console.log("Submitting login...");
    await Promise.all([
      page.click('button[type="submit"]'),
      page
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 60000,
        })
        .catch(() => {}), // Catch navigation timeout
    ]);

    // Check for "Verify it's you" challenge
    try {
      console.log("Checking for verification challenge...");
      const verifyButton = await page.waitForSelector(
        'button:has-text("Press and hold button")',
        {
          timeout: 5000,
        }
      );

      if (verifyButton) {
        console.log("Found verification button, pressing and holding...");
        const button = await page.$('button:has-text("Press and hold button")');

        // Simulate press and hold for 3 seconds
        await page.evaluate((btn) => {
          return new Promise((resolve) => {
            // Trigger mousedown
            btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

            // Hold for 3 seconds then trigger mouseup
            setTimeout(() => {
              btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
              resolve();
            }, 3000);
          });
        }, button);

        // Wait for verification to complete
        await page
          .waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 30000,
          })
          .catch(() => {});
      }
    } catch (verifyError) {
      console.log("No verification challenge found, continuing...");
    }

    // Add a small delay to ensure cookies are set
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get cookies in smaller batches if needed
    console.log("Retrieving cookies...");
    const cookies = await Promise.race([
      page.cookies(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Cookie retrieval timeout")), 30000)
      ),
    ]);

    console.log("Retrieved cookies count:", cookies.length);
    console.log(
      "Cookie names:",
      cookies.map((c) => c.name)
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
      }
    });

    if (!cookieValues["__Host-airtable-session"]) {
      throw new Error(
        "Essential session cookie missing! Login might have failed."
      );
    }

    res.cookie("authCookies", JSON.stringify(cookieValues), {
      httpOnly: true,
      secure: true,
      sameSite: "None",
    });

    res.json({
      success: true,
      message: "Cookies retrieved and set",
      cookies: cookieValues,
    });
  } catch (error) {
    console.error("Error in cookie retrieval:", error);
    res.status(500).json({
      error: "Failed to retrieve Airtable cookies",
      details: error.message,
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
    }
  }
};

module.exports = {
  getAirtableCookies,
};
