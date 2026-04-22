const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    telegramId: Number,
    items: [
      {
        name: String,
        name_ru: String,
        price: Number,
        quantity: Number,
        category: String,
      },
    ],
    total: Number,
    userInfo: Object,
    orderType: String,
    tableNumber: String,
    status: { type: String, default: "Yangi" },
    rating: { type: Number, default: null },
    ratingComment: { type: String, default: "" },
    restaurantId: { type: String, required: true },
  },
  { timestamps: true }
);

orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, status: 1 });
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ telegramId: 1, restaurantId: 1 });
orderSchema.index({ restaurantId: 1, rating: 1 });

module.exports = mongoose.model("Order", orderSchema);