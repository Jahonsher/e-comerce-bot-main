const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    name_ru: String,
    emoji: { type: String, default: "🍽" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    restaurantId: { type: String, required: true },
  },
  { timestamps: true }
);

categorySchema.index({ restaurantId: 1, order: 1 });
categorySchema.index({ restaurantId: 1, active: 1 });

module.exports = mongoose.model("Category", categorySchema);