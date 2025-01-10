const mongoose = require("mongoose"); // Erase if already required

// Declare the Schema of the Mongo model
const userSchema = new mongoose.Schema(
  {
    slug: { type: String, default: "" },
    email: { type: String, default: "" },
    password: { type: String, default: "" },
    name: { type: String, default: "" },
    photo: { type: String, default: "/avatar.jpeg" },
    isVerified: { type: Boolean, default: false },
    type_login: {
      type: String,
      default: "local",
      enum: ["local", "google"],
    },
    google_id: { type: String, default: "" },
    facebook_id: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

//Export the model
module.exports = mongoose.model("user", userSchema);
