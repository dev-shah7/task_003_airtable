const axios = require("axios");

exports.getBaseTables = async (req, res) => {
  console.log("Fetching tables for base...");
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const { baseId } = req.params;

    if (!baseId) {
      return res.status(400).json({ error: "Base ID is required" });
    }

    console.log("Using token:", token);
    console.log("Using baseId:", baseId);

    try {
      // Fetch tables from Airtable
      const response = await axios.get(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          validateStatus: (status) => status < 500,
        }
      );

      console.log("Airtable API Response Status:", response.status);

      if (response.status === 401) {
        return res.status(401).json({
          error: "Invalid or expired Airtable token",
          details: response.data,
        });
      }

      if (!response.data.tables) {
        console.error("Unexpected Airtable response:", response.data);
        return res.status(500).json({
          error: "Invalid response from Airtable",
          details: response.data,
        });
      }

      res.json({
        success: true,
        tables: response.data.tables,
      });
    } catch (apiError) {
      console.error("Airtable API error:", apiError.response?.data || apiError);
      res.status(apiError.response?.status || 500).json({
        error: "Failed to fetch tables from Airtable",
        details: apiError.response?.data || apiError.message,
      });
    }
  } catch (error) {
    console.error("Get tables error:", error);
    res.status(500).json({
      error: "Failed to get tables",
      details: error.message,
    });
  }
};
