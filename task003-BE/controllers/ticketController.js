const Ticket = require("../models/Ticket");
const axios = require("axios");
const cheerio = require("cheerio");
const TicketRevision = require("../models/TicketRevision");

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
    const { offset = 0, pageSize: requestedPageSize } = req.query; // Get pageSize from query params

    // Validate and limit pageSize
    const pageSize = Math.max(parseInt(requestedPageSize) || 15, 1);

    if (!baseId) {
      return res.status(400).json({ error: "Base ID is required" });
    }

    // Get auth token from headers
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.split(" ")[1];

    // Fetch tickets from Airtable with pagination
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

    if (response.status === 401) {
      return res.status(401).json({
        error: "Invalid or expired Airtable token",
        details: response.data,
      });
    }

    if (!response.data.records) {
      return res.status(500).json({
        error: "Invalid response from Airtable",
        details: response.data,
      });
    }

    // Map Airtable records to our format
    const tickets = response.data.records.map((record) => ({
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
    }));

    res.json({
      success: true,
      tickets,
      offset: response.data.offset, // Include offset for next page
      hasMore: !!response.data.offset, // Boolean indicating if there are more records
    });
  } catch (error) {
    console.error("Failed to fetch user tickets:", error);
    res.status(500).json({
      error: "Failed to fetch tickets",
      details: error.message,
    });
  }
};

function extractFieldChanges(diffRowHtml) {
  const $ = cheerio.load(diffRowHtml);
  const fieldChanges = {};

  const columnType = $(".micro.strong.caps").text().trim();

  if (columnType) {
    const columnDataType = $(".historicalCellValue").attr("data-columntype");

    switch (columnDataType) {
      case "collaborator":
        // Handle collaborator/assignee changes
        const newAssigneeElement = $(
          ".greenLight2 .flex-auto.truncate"
        ).first();
        const oldAssigneeElement = $(
          ".strikethrough .flex-auto.truncate"
        ).first();

        const newAssignee = newAssigneeElement
          .closest(".flex-inline:not(.strikethrough)")
          .find(".flex-auto.truncate")
          .text()
          .trim();
        const oldAssignee = oldAssigneeElement.text().trim();

        fieldChanges[columnType] = {
          oldValue: oldAssignee || null,
          newValue: newAssignee || null,
        };
        break;

      case "select":
        // Handle select inputs (Status, Priority)
        const addedValue = $(".greenLight2 .flex-auto.truncate-pre")
          .text()
          .trim();
        const removedValue = $(
          ".grayLight2 .flex-auto.truncate-pre, .redLight2 .flex-auto.truncate-pre"
        )
          .text()
          .trim();
        fieldChanges[columnType] = {
          oldValue: removedValue || null,
          newValue: addedValue || null,
        };
        break;

      case "multilineText":
        // Handle multiline text fields (Description)
        const oldText = $(".text-red-dark1.strikethrough").text().trim();
        const newText = $(".greenLight2").text().trim();
        fieldChanges[columnType] = {
          oldValue: oldText || null,
          newValue: newText || null,
        };
        break;

      case "richText":
        // Handle rich text fields (Resolution notes)
        const richText = $(".richText.greenLight2").text().trim();
        fieldChanges[columnType] = {
          oldValue: null,
          newValue: richText || null,
        };
        break;

      case "date":
        // Handle date fields (Closed at)
        const dateValue = $(".greenLight2 .flex.flex-auto").text().trim();
        fieldChanges[columnType] = {
          oldValue: null,
          newValue: dateValue || null,
        };
        break;

      default:
        // Default handler for other field types
        const oldValue = $(".text-red-dark1").text().trim();
        const newValue = $(".greenLight2").text().trim();
        fieldChanges[columnType] = {
          oldValue: oldValue || null,
          newValue: newValue || null,
        };
    }
  }

  console.log(`Extracted changes for ${columnType}:`, fieldChanges[columnType]);
  return fieldChanges;
}

exports.getTicketRevisionHistory = async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log("Fetching revision history for ticket:", ticketId);

    const authCookies = req.cookies.authCookies
      ? JSON.parse(req.cookies.authCookies)
      : null;

    if (!authCookies) {
      return res.status(400).json({
        error: "No authentication cookies found",
        details: "Please ensure you are logged in",
      });
    }

    const cookieString = Object.entries(authCookies)
      .map(([name, value]) => `${name}=${value}`)
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

    let response = await axios.get(
      `https://airtable.com/v0.3/row/${ticketId}/readRowActivitiesAndComments`,
      {
        params,
        headers: {
          Cookie: cookieString,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-Airtable-Client": "web",
          "X-Airtable-Client-Version": "1.0.0",
          "x-time-zone": "UTC",
          "x-airtable-application-id": "appA0Q5Vu9k7N0pgv",
          Origin: "https://airtable.com",
          Referer: "https://airtable.com/",
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
      }
    );

    if (response.status === 403) {
      if (!req.session?.mfaCode) {
        return res.status(403).json({
          error: "Authentication required",
          mfaRequired: true,
        });
      }

      // Use the MFA code in your cookie fetching logic
      await getAirtableCookies(req, res, req.session.mfaCode);

      const newAuthCookies = req.cookies.authCookies
        ? JSON.parse(req.cookies.authCookies)
        : null;

      if (!newAuthCookies) {
        return res.status(400).json({
          error: "No authentication cookies found after refetching",
          details: "Please ensure you are logged in",
        });
      }

      const newCookieString = Object.entries(newAuthCookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");

      response = await axios.get(
        `https://airtable.com/v0.3/row/${ticketId}/readRowActivitiesAndComments`,
        {
          params,
          headers: {
            Cookie: newCookieString,
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-Airtable-Client": "web",
            "X-Airtable-Client-Version": "1.0.0",
            "x-time-zone": "UTC",
            "x-airtable-application-id": "appA0Q5Vu9k7N0pgv",
            Origin: "https://airtable.com",
            Referer: "https://airtable.com/",
          },
          maxRedirects: 0,
          validateStatus: (status) => status < 500,
        }
      );
    }

    const revisionData = response.data?.data?.rowActivityInfoById || {};
    console.log("revision data: ", revisionData);
    const formattedRevisions = [];

    // Process each activity
    for (const [activityId, activity] of Object.entries(revisionData)) {
      // Check if this activity already exists and was recently updated
      const existingRevision = await TicketRevision.findOne({
        activityId,
        $or: [
          // Check if it's a new record (created in last minute)
          {
            createdAt: {
              $gt: new Date(Date.now() - 60000), // 1 minute ago
            },
          },
          // Or if it was updated in last minute
          {
            updatedAt: {
              $gt: new Date(Date.now() - 60000),
            },
          },
        ],
      });

      // Skip if we recently processed this activity
      if (existingRevision) {
        console.log(`Skipping recently processed activity: ${activityId}`);
        continue;
      }

      const extractedData = extractFieldChanges(activity.diffRowHtml);
      if (Object.keys(extractedData).length > 0) {
        const columnType = Object.keys(extractedData)[0];
        const { oldValue, newValue } = extractedData[columnType];

        // Check if the values are actually different
        if (oldValue !== newValue) {
          // Check if we already have this exact change recorded
          const duplicateCheck = await TicketRevision.findOne({
            issueId: ticketId,
            columnType,
            oldValue,
            newValue,
            createdDate: new Date(activity.createdTime),
          });

          if (!duplicateCheck) {
            formattedRevisions.push({
              activityId,
              issueId: ticketId,
              columnType,
              oldValue,
              newValue,
              createdDate: new Date(activity.createdTime),
              authoredBy: activity.originatingUserId,
            });
          } else {
            console.log(`Skipping duplicate change for ${columnType}`);
          }
        }
      }
    }

    // Store only new revisions in MongoDB
    if (formattedRevisions.length > 0) {
      try {
        const bulkOps = formattedRevisions.map((revision) => ({
          updateOne: {
            filter: {
              activityId: revision.activityId,
              issueId: revision.issueId,
              columnType: revision.columnType,
              createdDate: revision.createdDate,
            },
            update: { $setOnInsert: revision },
            upsert: true,
          },
        }));

        const result = await TicketRevision.bulkWrite(bulkOps);
        console.log(
          `Processed ${formattedRevisions.length} revisions:`,
          `${result.upsertedCount} new, ${result.modifiedCount} existing`
        );
      } catch (error) {
        console.error("Error storing revisions:", error);
      }
    } else {
      console.log("No new revisions to store");
    }

    // Get all revisions for this ticket from the database
    const allRevisions = await TicketRevision.find({ issueId: ticketId })
      .sort({ createdDate: -1 })
      .lean();

    res.json({
      success: true,
      revisions: allRevisions,
    });
  } catch (error) {
    console.error("Error fetching revision history:", error);
    res.status(500).json({
      error: "Failed to fetch revision history",
      details: error.message,
    });
  }
};
