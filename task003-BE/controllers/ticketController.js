const Ticket = require("../models/Ticket");
const axios = require("axios");
const cheerio = require("cheerio");
const TicketRevision = require("../models/TicketRevision");

exports.syncTickets = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { baseId, tableId } = req.params;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    if (!baseId || !tableId) {
      return res
        .status(400)
        .json({ error: "Base ID and Table ID are required" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const response = await axios.get(
        `https://api.airtable.com/v0/${baseId}/${tableId}`,
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

      if (req.session?.user?._id) {
        const userId = req.session.user._id;

        await Ticket.deleteMany({ userId, baseId, tableId });

        const ticketsToCreate = response.data.records.map((record) => ({
          airtableId: record.id,
          baseId,
          tableId,
          userId,
          fields: new Map(Object.entries(record.fields)),
          createdTime: record.createdTime,
          lastModifiedTime: record.lastModifiedTime,
        }));

        try {
          const createdTickets = await Ticket.insertMany(ticketsToCreate, {
            ordered: false,
          });

          for (const ticket of createdTickets) {
            try {
              const revisionResponse = await axios.get(
                `https://airtable.com/v0.3/row/${ticket.airtableId}/readRowActivitiesAndComments`,
                {
                  params: {
                    stringifiedObjectParams: JSON.stringify({
                      limit: 100,
                      offset: null,
                      shouldReturnDeserializedActivityItems: true,
                      shouldIncludeRowActivityOrCommentUserObjById: true,
                    }),
                  },
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                }
              );

              if (revisionResponse.data?.data?.rowActivityInfoById) {
                const revisions = Object.entries(
                  revisionResponse.data.data.rowActivityInfoById
                )
                  .map(([activityId, activity]) => {
                    const changes = extractFieldChanges(activity.diffRowHtml);
                    return {
                      activityId,
                      issueId: ticket.airtableId,
                      ...changes[Object.keys(changes)[0]],
                      createdDate: new Date(activity.createdTime),
                      authoredBy: activity.originatingUserId,
                    };
                  })
                  .filter((revision) => revision.oldValue || revision.newValue);

                if (revisions.length > 0) {
                  await TicketRevision.insertMany(revisions);
                }
              }
            } catch (revisionError) {
              console.error(
                `Error fetching revisions for ticket ${ticket.airtableId}:`,
                revisionError
              );
            }
          }

          res.json({
            success: true,
            tickets: createdTickets,
          });
        } catch (dbError) {
          console.error("Database error while creating tickets:", dbError);
          throw dbError;
        }
      } else {
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
    const { baseId, tableId } = req.params;
    const {
      pageSize = 5,
      offset,
      sortField,
      sortDirection,
      filterModel,
    } = req.query;

    if (!baseId || !tableId) {
      return res
        .status(400)
        .json({ error: "Base ID and Table ID are required" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.split(" ")[1];

    const response = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${tableId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: {
          pageSize: Math.min(parseInt(pageSize), 100),
          offset,
          ...(sortField &&
            sortDirection && {
              sort: JSON.stringify([
                { field: sortField, direction: sortDirection },
              ]),
            }),
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

    const records = response.data.records.map((record) => ({
      airtableId: record.id,
      baseId,
      tableId,
      userId,
      fields: record.fields,
      createdTime: record.fields["Created time"] || null,
      lastModifiedTime: record.fields["Last modified time"] || null,
    }));

    for (const record of records) {
      await Ticket.findOneAndUpdate({ airtableId: record.airtableId }, record, {
        upsert: true,
        new: true,
      });
    }

    const fieldMetadata = Object.keys(records[0]?.fields || {}).map(
      (fieldName) => ({
        field: fieldName,
        headerName: fieldName,
        sortable: true,
        filter: true,
        resizable: true,
      })
    );

    res.json({
      success: true,
      data: records,
      metadata: {
        fields: fieldMetadata,
      },
      pagination: {
        offset: response.data.offset,
        hasMore: !!response.data.offset,
        pageSize: parseInt(pageSize),
        totalRecords: response.data.records?.length || 0,
      },
    });
  } catch (error) {
    console.error("Failed to fetch records:", error);
    res.status(500).json({
      error: "Failed to fetch records",
      details: error.message,
    });
  }
};

function extractFieldChanges(diffRowHtml) {
  try {
    const $ = cheerio.load(diffRowHtml);
    const changes = {};

    const columnHeader = $(".micro.strong");
    const columnType = columnHeader.text().trim();
    const columnId = columnHeader.attr("columnId");
    const dataColumnType = $(".historicalCellValue").attr("data-columntype");

    if (!columnType) return changes;

    switch (dataColumnType) {
      case "select":
        const tokens = $(".cellToken");
        let oldValue = null;
        let newValue = null;

        tokens.each((i, elem) => {
          const $token = $(elem);
          const isRemoved = $token.css("text-decoration") === "line-through";
          const value = $token
            .find(".flex-auto.truncate-pre")
            .attr("title")
            ?.trim();

          if (isRemoved) {
            oldValue = value;
          } else {
            newValue = value;
          }
        });

        changes[columnType] = {
          oldValue,
          newValue,
          columnId,
          type: dataColumnType,
        };
        break;

      case "text":
      case "multilineText":
        const oldText = $(".text-red-dark1.strikethrough").text().trim();
        const newText = $(".greenLight2").not(".strikethrough").text().trim();
        const unchangedText = $(".unchangedPart").text().trim();

        changes[columnType] = {
          oldValue: oldText ? `${unchangedText} ${oldText}`.trim() : null,
          newValue: newText ? `${unchangedText} ${newText}`.trim() : null,
          columnId,
          type: dataColumnType,
        };
        break;

      case "collaborator":
        const oldCollaborator = $(".strikethrough .flex-auto.truncate")
          .text()
          .trim();
        const newCollaborator = $(
          ".cellToken:not(.strikethrough) .flex-auto.truncate"
        )
          .text()
          .trim();

        changes[columnType] = {
          oldValue: oldCollaborator || null,
          newValue: newCollaborator || null,
          columnId,
          type: dataColumnType,
        };
        break;

      case "date":
        const oldDate = $(".text-red-dark1.strikethrough .flex.flex-auto")
          .text()
          .trim();
        const newDate = $(".greenLight2 .flex.flex-auto").text().trim();

        changes[columnType] = {
          oldValue: oldDate || null,
          newValue: newDate || null,
          columnId,
          type: dataColumnType,
        };
        break;

      default:
        if ($(".historicalCellValue.nullToValue").length) {
          const newValue = $(".greenLight2").text().trim();
          changes[columnType] = {
            oldValue: null,
            newValue: newValue || null,
            columnId,
            type: dataColumnType || "text",
          };
        } else {
          const oldValue = $(".text-red-dark1").text().trim();
          const newValue = $(".greenLight2")
            .not(".strikethrough")
            .text()
            .trim();
          changes[columnType] = {
            oldValue: oldValue || null,
            newValue: newValue || null,
            columnId,
            type: dataColumnType || "text",
          };
        }
    }

    console.log(`Extracted changes for ${columnType}:`, changes[columnType]);
    return changes;
  } catch (error) {
    console.error("Error extracting field changes:", error);
    return {};
  }
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
    console.log("response: ", JSON.stringify(response.data, null, 2));
    console.log("revision data: ", revisionData);
    const formattedRevisions = [];

    for (const [activityId, activity] of Object.entries(revisionData)) {
      const existingRevision = await TicketRevision.findOne({
        activityId,
        $or: [
          {
            createdAt: {
              $gt: new Date(Date.now() - 60000),
            },
          },
          {
            updatedAt: {
              $gt: new Date(Date.now() - 60000),
            },
          },
        ],
      });

      if (existingRevision) {
        console.log(`Skipping recently processed activity: ${activityId}`);
        continue;
      }

      const extractedData = extractFieldChanges(activity.diffRowHtml);
      if (Object.keys(extractedData).length > 0) {
        const columnType = Object.keys(extractedData)[0];
        const { oldValue, newValue } = extractedData[columnType];

        if (oldValue !== newValue) {
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
