/**
 * ServiX — Cache Middleware
 * 
 * In-memory cache (RAM) — server ishlayotgan vaqtda xotirada saqlaydi.
 * Har bir so'rov har safar MongoDB ga bormaydi — cache dan oladi.
 * 
 * Qo'llaniladigan joylar:
 *   - /admin/categories (kategoriyalar)
 *   - /admin/products (mahsulotlar)
 *   - /admin/stats/fast (dashboard statistika)
 *   - /admin/me (admin ma'lumotlari)
 * 
 * Qanday ishlaydi:
 *   1. Foydalanuvchi /admin/categories ga so'rov yuboradi
 *   2. Middleware cache ni tekshiradi — agar bor va vaqt o'tmagan bo'lsa — cache dan beradi
 *   3. Agar yo'q bo'lsa — route ishlaydi, natija cache ga saqlanadi
 *   4. Keyingi so'rov cache dan 1-2 ms da keladi (DB so'rovi 50-200 ms)
 * 
 * Qachon cache tozalanadi:
 *   - TTL (Time To Live) vaqti o'tganda — avtomatik
 *   - Mahsulot/kategoriya qo'shilgan-o'chirilgan-tahrirlaganda — qo'lda (invalidate)
 */

const cache = new Map();
const stats = { hits: 0, misses: 0 };

/**
 * Cache ga yozish
 * @param {string} key - unikal kalit (masalan: "categories:imperial")
 * @param {any} value - saqlanadigan qiymat
 * @param {number} ttlMs - necha millisekunddan keyin eskiradi (default: 30 soniya)
 */
function setCache(key, value, ttlMs = 30000) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Cache dan o'qish
 * @returns {any|null} - qiymat yoki null (eskirgan/yo'q)
 */
function getCache(key) {
  const entry = cache.get(key);
  if (!entry) {
    stats.misses++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    stats.misses++;
    return null;
  }
  stats.hits++;
  return entry.value;
}

/**
 * Cache ni tozalash (mahsulot/kategoriya o'zgarganda chaqiriladi)
 * @param {string} pattern - prefiks (masalan: "categories:imperial" barcha kategoriya cache larini tozalaydi)
 */
function invalidateCache(pattern) {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
      count++;
    }
  }
  return count;
}

/**
 * Barcha cache ni tozalash
 */
function clearAllCache() {
  const size = cache.size;
  cache.clear();
  return size;
}

/**
 * Express middleware — cache bor bo'lsa beradi, yo'q bo'lsa route ishlaydi
 * @param {string|function} keyOrFn - cache kaliti yoki (req) => key funksiya
 * @param {number} ttlMs - TTL millisekundda (default: 30000)
 */
function cacheMiddleware(keyOrFn, ttlMs = 30000) {
  return (req, res, next) => {
    // Faqat GET so'rovlar uchun
    if (req.method !== "GET") return next();

    // Cache kaliti — string yoki funksiya
    const key = typeof keyOrFn === "function" ? keyOrFn(req) : keyOrFn;
    if (!key) return next();

    // Cache dan o'qish
    const cached = getCache(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // Cache yo'q — route ishlaydi, res.json ni o'rnini egallaymiz
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Faqat muvaffaqiyatli javoblarni cache ga yozamiz
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setCache(key, data, ttlMs);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache statistikasi (debug uchun)
 */
function getCacheStats() {
  return {
    size: cache.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits + stats.misses > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1) + "%" : "0%",
  };
}

module.exports = {
  setCache,
  getCache,
  invalidateCache,
  clearAllCache,
  cacheMiddleware,
  getCacheStats,
};