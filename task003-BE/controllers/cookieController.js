const puppeteer = require("puppeteer");

const AIRTABLE_BASE_URL = "https://airtable.com";

exports.getAirtableCookies = async (req, res) => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: null,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    // Set API key in headers
    await page.setExtraHTTPHeaders({
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });

    // Navigate directly to API endpoint
    await page.goto(`${AIRTABLE_BASE_URL}/api/v0/meta/bases`, {
      waitUntil: "networkidle0",
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const cookies = await page.cookies();
    console.log("All cookies:", cookies);

    // Get all required cookies
    const requiredCookies = [
      "connect.sid",
      "airtable.sid",
      "AWSALBTG",
      "AWSALBTGCORS",
      "brw",
      "brwConsent",
    ];

    const cookieValues = {};
    requiredCookies.forEach((name) => {
      const cookie = cookies.find((c) => c.name === name);
      if (cookie) {
        cookieValues[name] = cookie.value;
      }
    });

    // Set all cookies in response headers
    const cookieHeaders = Object.entries(cookieValues).map(
      ([name, value]) =>
        `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=None`
    );

    res.setHeader("Set-Cookie", cookieHeaders);

    res.json({
      success: true,
      message: "Cookies set successfully",
      debug: cookieValues,
    });
  } catch (error) {
    console.error("Error retrieving Airtable cookies:", error);
    res.status(500).json({
      error: "Failed to retrieve Airtable cookies",
      details: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

exports.validateCookies = async (req, res) => {
  let browser;
  try {
    const { cookies } = req.body;

    if (!cookies) {
      return res.status(400).json({ error: "Cookies are required" });
    }

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Set the cookies
    const cookieArray = cookies.split(";").map((cookie) => {
      const [name, value] = cookie.trim().split("=");
      return { name, value, domain: "airtable.com" };
    });

    await page.setCookie(...cookieArray);

    // Try to access Airtable
    const response = await page.goto(`${AIRTABLE_BASE_URL}/meta/schema`, {
      waitUntil: "networkidle0",
    });

    res.json({
      success: true,
      valid: response.status() === 200,
    });
  } catch (error) {
    res.json({
      success: false,
      valid: false,
      error: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};
