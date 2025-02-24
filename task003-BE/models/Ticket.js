const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  airtableId: String,
  baseId: String,
  tableId: String,
  userId: mongoose.Schema.Types.ObjectId,
  fields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  createdTime: Date,
  lastModifiedTime: Date,
});

ticketSchema.index({ userId: 1, baseId: 1 });
ticketSchema.index({ airtableId: 1 }, { unique: true });

module.exports = mongoose.model("Ticket", ticketSchema);
