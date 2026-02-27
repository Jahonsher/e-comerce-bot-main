app.post("/order", async (req, res) => {
  try {
    const { telegramId, items, user } = req.body;

    if (!telegramId) {
      return res.status(400).json({ error: "telegramId yo‘q" });
    }

    if (!items || !items.length) {
      return res.status(400).json({ error: "items bo‘sh" });
    }

    const total = items.reduce(
      (sum, i) => sum + (i.price * i.quantity),
      0
    );

    const order = await Order.create({
      telegramId,
      items,
      total,
      userInfo: user || null
    });

    // Telegram xabarini try/catch ichida yuboramiz
    try {
      const text = items
        .map(i => `${i.name} - ${i.quantity} ta`)
        .join("\n");

      await bot.sendMessage(
        process.env.CHEF_ID,
        `🆕 Yangi buyurtma

${text}

💰 ${total} so'm`
      );
    } catch (tgErr) {
      console.log("Telegram error:", tgErr.message);
    }

    return res.json(order);

  } catch (err) {
    console.log("ORDER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});