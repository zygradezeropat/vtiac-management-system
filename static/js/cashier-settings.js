/**
 * Cashier Settings — profile + password (server-backed).
 */

import { initStaffPortalSettings } from "./staff-portal-settings.js";

document.addEventListener("DOMContentLoaded", () => {
  initStaffPortalSettings({ passwordToggleClass: "cashier-password-toggle" });
});
