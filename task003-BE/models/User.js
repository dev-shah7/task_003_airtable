const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  displayName: String,
  airtableUserId: {
    type: String,
    sparse: true, // Allow null values
    unique: true, // But ensure uniqueness for non-null values
  },
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

// Add index for airtableUserId
userSchema.index({ airtableUserId: 1 }, { unique: true, sparse: true });

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

// Drop any existing indexes before creating the model
mongoose.connection.on("connected", async () => {
  try {
    await mongoose.connection.collections.users?.dropIndexes();
    console.log("Dropped all indexes from users collection");
  } catch (error) {
    console.log("No indexes to drop or collection does not exist");
  }
});

module.exports = mongoose.model("User", userSchema);
