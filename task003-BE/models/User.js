const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  displayName: String,
  airtableUserId: {
    type: String,
    sparse: true,
    unique: true,
  },
  airtableToken: {
    type: String,
    select: false,
  },
  airtableRefreshToken: {
    type: String,
    select: false,
  },
  airtableScopes: [String],
  airtableTokenExpiry: Date,
});

userSchema.index({ airtableUserId: 1 }, { unique: true, sparse: true });

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    displayName: this.displayName,
    airtableUserId: this.airtableUserId,
    hasAirtableAccess: !!this.airtableToken,
    airtableScopes: this.airtableScopes,
  };
};

mongoose.connection.on("connected", async () => {
  try {
    await mongoose.connection.collections.users?.dropIndexes();
    console.log("Dropped all indexes from users collection");
  } catch (error) {
    console.log("No indexes to drop or collection does not exist");
  }
});

module.exports = mongoose.model("User", userSchema);
