const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    id: Number,
    name: String,
    name_ru: String,
    price: Number,
    category: String,
    image: String,
    active: { type: Boolean, default: true },
    restaurantId: { type: String, required: true },
  },
  { timestamps: true }
);

productSchema.index({ id: 1, restaurantId: 1 }, { unique: true });
productSchema.index({ restaurantId: 1, category: 1, active: 1 });
productSchema.index({ restaurantId: 1, active: 1 });

module.exports = mongoose.model("Product", productSchema);