const mongoose = require("mongoose");

const ticketRevisionSchema = new mongoose.Schema(
  {
    activityId: { type: String, required: true, unique: true },
    issueId: { type: String, required: true },
    columnType: { type: String, required: true },
    oldValue: { type: String },
    newValue: { type: String },
    createdDate: { type: Date, required: true },
    authoredBy: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TicketRevision", ticketRevisionSchema);
