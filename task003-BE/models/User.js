const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  displayName: String,
  airtableUserId: String,
  airtableToken: {
    type: String,
    select: false, // Won't be returned by default for security
  },
  airtableRefreshToken: {
    type: String,
    select: false,
  },
  airtableScopes: [String],
  airtableTokenExpiry: Date,
});

// Method to safely get user data without sensitive fields
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    displayName: this.displayName,
    airtableUserId: this.airtableUserId,
    hasAirtableAccess: !!this.airtableToken,
    airtableScopes: this.airtableScopes,
  };
};

module.exports = mongoose.model("User", userSchema);
