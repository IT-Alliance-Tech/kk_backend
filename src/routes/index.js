import { Router } from "express";

import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import productRoutes from "./product.routes.js";
import brandRoutes from "./brand.routes.js";
import orderRoutes from "./order.routes.js";
import uploadRoutes from "./upload.routes.js";
import categoryRoutes from "./category.routes.js";
import cartRoutes from "./cart.routes.js";
import couponsRoutes from "./coupons.routes.js";
import reviewRoutes from "./review.routes.js";
import homepageRoutes from "./homepage.routes.js";
import returnRoutes from "./return.routes.js";
import paymentRoutes from "./payment.routes.js";

// ADMIN AUTH
import adminAuthRoutes from "./admin.auth.routes.js";
import adminContactRoutes from "./admin.contact.routes.js";
import adminHomepageRoutes from "./admin.homepage.routes.js";
import adminHeroRoutes from "./admin.hero.routes.js";

// CONTACT
import contactRoutes from "./contact.routes.js";
import contactInfoRoutes from "./contactInfo.routes.js";

// USER DASHBOARD: User profile and dashboard routes
import userProfileRoutes from "./userProfile.routes.js";
import userDashboardRoutes from "./userDashboard.routes.js";
import userAddressRoutes from "./userAddress.routes.js";

// ADAPTERS (leave them as they are)
// ⭐ NEW IMPORT — Admin Product Routes
import adminProductRoutes from "./adminProductRoutes.js";
import adminProductVariantRoutes from "./adminProductVariant.routes.js";
import searchRoutes from "./search.routes.js";

// ALIASES (leave them untouched)
import authAliases from "./aliases.auth.js";
import brandAliases from "./aliases.brand.js";
import orderAliases from "./aliases.order.js";
import rootAliases from "./aliases.root.js";

const router = Router();

// Category, Contact
router.use("/categories", categoryRoutes);
router.use("/contact", contactRoutes);
router.use("/contact-info", contactInfoRoutes);
router.use("/search", searchRoutes);

// Homepage lightweight endpoints
router.use("/homepage", homepageRoutes);

// User Auth
router.use("/auth", authRoutes);
router.use("/auth", authAliases);

// ⭐ Admin Login
router.use("/admin", adminAuthRoutes);

// ⭐ Admin Products API
router.use("/admin/products", adminProductRoutes);

// ⭐ Admin Product Variants API
router.use("/admin/products", adminProductVariantRoutes);

// ⭐ Admin Contact Submissions API
router.use("/admin/contact-submissions", adminContactRoutes);

// ⭐ Admin Homepage Management API
router.use("/admin/homepage", adminHomepageRoutes);

// ⭐ Admin Hero Images Management API
router.use("/admin/hero-images", adminHeroRoutes);

if (process.env.FEATURE_ADMIN_ORDERS === "true") {
  (async () => {
    const mod = await import("./admin.order.routes.js");
    const adminOrdersRouter = mod.default || mod.router || mod;
    router.use("/admin/orders", adminOrdersRouter);
  })();
}

if (process.env.FEATURE_ADMIN_INVOICES === "true") {
  (async () => {
    const mod = await import("./admin.invoice.routes.js");
    const adminInvoicesRouter = mod.default || mod.router || mod;
    router.use("/admin/invoices", adminInvoicesRouter);
  })();
}

if (process.env.FEATURE_ADMIN_USERS === "true") {
  (async () => {
    const mod = await import("./admin.user.routes.js");
    const adminUsersRouter = mod.default || mod.router || mod;
    router.use("/admin/users", adminUsersRouter);
  })();
}

// ⭐ Admin Returns Management API
import adminReturnRoutes from "./admin.return.routes.js";
router.use("/admin/returns", adminReturnRoutes);

// ⭐ Admin Delivery Management API
import adminDeliveryRoutes from "./admin.delivery.routes.js";
router.use("/admin/delivery", adminDeliveryRoutes);

// Main User Routes
router.use("/users", userRoutes);
router.use("/products", productRoutes);

// Reviews
router.use("/reviews", reviewRoutes);

// USER DASHBOARD: Mount user profile and dashboard routes
router.use("/user", userProfileRoutes);
router.use("/user", userDashboardRoutes);
router.use("/user", userAddressRoutes);

router.use("/cart", cartRoutes);

// Public coupons route
router.use("/coupons", couponsRoutes);

router.use("/brands", brandRoutes);
router.use("/brands", brandAliases);

router.use("/orders", orderRoutes);
router.use("/orders", orderAliases);

router.use("/returns", returnRoutes);

router.use("/upload", uploadRoutes);

router.use("/payment", paymentRoutes);

// Root alias mounts
router.use("/", rootAliases);

export default router;
