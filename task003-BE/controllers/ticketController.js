const Ticket = require("../models/Ticket");
const axios = require("axios");

exports.syncTickets = async (req, res) => {
  console.log("Starting ticket sync...");
  console.log("Session user:", req.session?.user);
  try {
    // Extract token and baseId from request
    const authHeader = req.headers.authorization;
    const { baseId } = req.params;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    if (!baseId) {
      return res.status(400).json({ error: "Base ID is required" });
    }

    const token = authHeader.split(" ")[1];
    console.log("Using token:", token);
    console.log("Using baseId:", baseId);

    try {
      // Fetch tickets from Airtable
      const response = await axios.get(
        `https://api.airtable.com/v0/${baseId}/tickets`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          validateStatus: (status) => status < 500,
        }
      );

      console.log("Airtable API Response Status:", response.status);
      console.log(
        "Airtable API Response Data:",
        JSON.stringify(response.data, null, 2)
      );

      if (response.status === 401) {
        return res.status(401).json({
          error: "Invalid or expired Airtable token",
          details: response.data,
        });
      }

      if (!response.data.records) {
        console.error("Unexpected Airtable response:", response.data);
        return res.status(500).json({
          error: "Invalid response from Airtable",
          details: response.data,
        });
      }

      // Store tickets in MongoDB
      if (req.session?.user?._id) {
        const userId = req.session.user._id;
        console.log("Using session user ID:", userId);

        // Delete existing tickets for this user and base
        const deleteResult = await Ticket.deleteMany({ userId, baseId });
        console.log("Delete result:", deleteResult);

        // Map Airtable records to ticket documents
        const ticketsToCreate = response.data.records.map((record) => {
          console.log("Processing record:", record.id);
          return {
            airtableId: record.id,
            title: record.fields.Title || "",
            description: record.fields.Description || "",
            priority: record.fields.Priority || "",
            status: record.fields.Status || "",
            createdTime: record.fields["Created time"] || null,
            statusLastChanged: record.fields["Status last changed"] || null,
            daysToClose: record.fields["Days to close"] || 0,
            daysUntilSLABreach: record.fields["Days until SLA breach"] || "",
            daysOverSLA: record.fields["Days over SLA"] || 0,
            resolutionNotes: record.fields["Resolution notes"] || "",
            submittedBy: record.fields["Submitted by"] || {},
            assignee: record.fields.Assignee || {},
            category: record.fields.Category || [],
            employeeEquipment: record.fields["Employee Equipment"] || [],
            ticketId: record.fields.ID || null,
            userId,
            baseId,
          };
        });

        console.log(
          "Tickets to create:",
          JSON.stringify(ticketsToCreate, null, 2)
        );

        try {
          const createdTickets = await Ticket.insertMany(ticketsToCreate, {
            ordered: false,
          });
          console.log(`Successfully created ${createdTickets.length} tickets`);

          res.json({
            success: true,
            tickets: createdTickets,
          });
        } catch (dbError) {
          console.error("Database error while creating tickets:", dbError);
          // If some documents were inserted before the error
          if (dbError.insertedDocs?.length > 0) {
            console.log(
              `Partially successful: ${dbError.insertedDocs.length} tickets created`
            );
          }
          throw dbError;
        }
      } else {
        console.log("No user ID found in session");
        res.status(401).json({ error: "User not authenticated" });
      }
    } catch (apiError) {
      console.error("Airtable API error:", apiError.response?.data || apiError);
      res.status(apiError.response?.status || 500).json({
        error: "Failed to fetch tickets from Airtable",
        details: apiError.response?.data || apiError.message,
      });
    }
  } catch (error) {
    console.error("Sync tickets error:", error);
    res.status(500).json({
      error: "Failed to sync tickets",
      details: error.message,
    });
  }
};

exports.getUserTickets = async (req, res) => {
  try {
    if (!req.session?.user?._id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userId = req.session.user._id;
    const { baseId } = req.params;

    if (!baseId) {
      return res.status(400).json({ error: "Base ID is required" });
    }

    const tickets = await Ticket.find({ userId, baseId });
    console.log(`Found ${tickets.length} tickets for user and base`);

    res.json({
      success: true,
      tickets,
    });
  } catch (error) {
    console.error("Failed to fetch user tickets:", error);
    res.status(500).json({
      error: "Failed to fetch tickets",
      details: error.message,
    });
  }
};

exports.getTicketRevisionHistory = async (req, res) => {
  try {
    const { ticketId } = req.params;

    console.log("All cookies received:", req.cookies);

    // Get all required cookies
    const requiredCookies = [
      "connect.sid",
      "airtable.sid",
      "AWSALBTG",
      "AWSALBTGCORS",
      "brw",
      "brwConsent",
    ];

    const missingCookies = requiredCookies.filter((name) => !req.cookies[name]);
    if (missingCookies.length > 0) {
      return res.status(400).json({
        error: "Required cookies not found",
        debug: {
          missingCookies,
          availableCookies: Object.keys(req.cookies),
        },
      });
    }

    // Format cookies for request
    const cookieString = requiredCookies
      .map((name) => `${name}=${req.cookies[name]}`)
      .join("; ");

    const params = {
      stringifiedObjectParams: JSON.stringify({
        limit: 10,
        offset: null,
        shouldReturnDeserializedActivityItems: true,
        shouldIncludeRowActivityOrCommentUserObjById: true,
      }),
      requestId: `req${Math.random().toString(36).substring(2, 15)}`,
      secretSocketId: `soc${Math.random().toString(36).substring(2, 15)}`,
    };

    // Use airtable.com instead of www.airtable.com
    const response = await axios.get(
      `https://airtable.com/v0.3/row/${ticketId}/readRowActivitiesAndComments`,
      {
        params,
        headers: {
          Cookie: cookieString,
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Airtable-Client": "web",
          "X-Airtable-Client-Version": "1.0.0",
          Origin: "https://airtable.com",
          Referer: "https://airtable.com/",
        },
        maxRedirects: 0, // Prevent redirects
        validateStatus: (status) => status < 500, // Accept any status < 500
      }
    );

    console.log("Revision history response:", response.status, response.data);

    if (response.status === 403) {
      return res.status(403).json({
        error: "Access forbidden",
        details:
          "Unable to access revision history. Please check authentication.",
      });
    }

    res.json({ success: true, revisionHistory: response.data });
  } catch (error) {
    console.error("Error fetching revision history:", error);
    res.status(500).json({
      error: "Failed to fetch revision history",
      details: error.message,
    });
  }
};
