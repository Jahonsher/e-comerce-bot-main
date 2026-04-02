const mongoose = require("mongoose");

// ===== RESTAURANT =====
const restaurantSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    name: String,
    businessType: { type: String, default: "restaurant" },
    blocked: { type: Boolean, default: false },
    blockReason: { type: String, default: "" },
  },
  { timestamps: true }
);
const Restaurant = mongoose.model("Restaurant", restaurantSchema);

// ===== BRANCH =====
const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    restaurantId: { type: String, required: true },
    address: String,
    lat: Number,
    lng: Number,
    radius: { type: Number, default: 100 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const Branch = mongoose.model("Branch", branchSchema);

// ===== EMPLOYEE =====
const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: String,
    position: String,
    username: { type: String, unique: true },
    password: String,
    restaurantId: { type: String, required: true },
    role: {
      type: String,
      enum: ["employee", "waiter", "chef"],
      default: "employee",
    },
    tables: [String],
    workStart: { type: String, default: "09:00" },
    workEnd: { type: String, default: "18:00" },
    salary: { type: Number, default: 0 },
    telegramId: Number,
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    weeklyOff: { type: String, default: "sunday" },
    photo: String,
    faceDescriptor: [Number],
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const Employee = mongoose.model("Employee", employeeSchema);

// ===== ATTENDANCE =====
const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    restaurantId: { type: String, required: true },
    date: { type: String, required: true },
    checkIn: String,
    checkOut: String,
    checkInPhoto: String,
    checkInLat: Number,
    checkInLng: Number,
    lateMinutes: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    status: { type: String, default: "keldi" },
    isWeeklyOff: { type: Boolean, default: false },
    overtimeMinutes: { type: Number, default: 0 },
    note: String,
  },
  { timestamps: true }
);
const Attendance = mongoose.model("Attendance", attendanceSchema);

// ===== INVENTORY =====
const inventorySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    restaurantId: { type: String, required: true },
    productName: String,
    unit: { type: String, default: "dona" },
    currentStock: { type: Number, default: 0 },
    minStock: { type: Number, default: 5 },
    maxStock: { type: Number, default: 1000 },
    costPrice: { type: Number, default: 0 },
    lastRestocked: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
inventorySchema.index({ productId: 1, restaurantId: 1 }, { unique: true });
const Inventory = mongoose.model("Inventory", inventorySchema);

// ===== INVENTORY LOG =====
const inventoryLogSchema = new mongoose.Schema(
  {
    inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Inventory" },
    restaurantId: { type: String, required: true },
    type: { type: String, enum: ["in", "out", "adjust"], required: true },
    quantity: { type: Number, required: true },
    note: String,
    createdBy: String,
  },
  { timestamps: true }
);
const InventoryLog = mongoose.model("InventoryLog", inventoryLogSchema);

// ===== NOTIFICATION =====
const notificationSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: String,
    icon: { type: String, default: "🔔" },
    read: { type: Boolean, default: false },
    targetRole: { type: String, default: "admin" },
    targetId: String,
    data: Object,
  },
  { timestamps: true }
);
const Notification = mongoose.model("Notification", notificationSchema);

// ===== SHOT (Ofitsiant tizimi) =====
const shotSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    tableNumber: { type: String, required: true },
    waiterId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee" },
    waiterName: String,
    status: { type: String, enum: ["open", "closed"], default: "open" },
    items: [
      {
        name: String,
        name_ru: String,
        price: Number,
        quantity: Number,
        addedBy: {
          type: String,
          enum: ["customer", "waiter"],
          default: "customer",
        },
        sentToKitchen: { type: Boolean, default: false },
        kitchenStatus: {
          type: String,
          enum: ["pending", "cooking", "ready"],
          default: "pending",
        },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    total: { type: Number, default: 0 },
    customerTelegramId: Number,
    openedAt: { type: Date, default: Date.now },
    closedAt: Date,
  },
  { timestamps: true }
);
shotSchema.index({ restaurantId: 1, status: 1 });
shotSchema.index({ restaurantId: 1, tableNumber: 1, status: 1 });
const Shot = mongoose.model("Shot", shotSchema);

// ===== AUDIT LOG =====
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actor: { type: String, required: true },
    actorRole: { type: String, default: "superadmin" },
    restaurantId: String,
    details: String,
    ip: String,
  },
  { timestamps: true }
);
const AuditLog = mongoose.model("AuditLog", auditLogSchema);

// ===== PAYMENT =====
const paymentSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ["subscription", "custom", "refund"],
      default: "subscription",
    },
    method: { type: String, default: "cash" },
    days: { type: Number, default: 30 },
    note: String,
    createdBy: String,
  },
  { timestamps: true }
);
const Payment = mongoose.model("Payment", paymentSchema);

// ===== SUPERADMIN NOTIFICATION =====
const saNotifSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: String,
    icon: { type: String, default: "🔔" },
    read: { type: Boolean, default: false },
    data: Object,
  },
  { timestamps: true }
);
const SANotification = mongoose.model("SANotification", saNotifSchema);

module.exports = {
  Restaurant,
  Branch,
  Employee,
  Attendance,
  Inventory,
  InventoryLog,
  Notification,
  Shot,
  AuditLog,
  Payment,
  SANotification,
};