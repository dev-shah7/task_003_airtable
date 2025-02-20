const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    airtableId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    priority: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "",
    },
    createdTime: {
      type: Date,
      default: null,
    },
    statusLastChanged: {
      type: Date,
      default: null,
    },
    daysToClose: {
      type: Number,
      default: 0,
    },
    daysUntilSLABreach: {
      type: String,
      default: "",
    },
    daysOverSLA: {
      type: Number,
      default: 0,
    },
    resolutionNotes: {
      type: String,
      default: "",
    },
    submittedBy: {
      id: String,
      email: String,
      name: String,
    },
    assignee: {
      id: String,
      email: String,
      name: String,
    },
    category: {
      type: [String],
      default: [],
    },
    employeeEquipment: {
      type: [String],
      default: [],
    },
    ticketId: {
      type: Number,
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    baseId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Index for faster queries
ticketSchema.index({ userId: 1, baseId: 1 });
ticketSchema.index({ airtableId: 1 }, { unique: true });

module.exports = mongoose.model("Ticket", ticketSchema);
