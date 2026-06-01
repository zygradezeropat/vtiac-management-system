/**
 * Trainer Settings — profile + password (server-backed).
 */

import { initStaffPortalSettings } from "./staff-portal-settings.js";

document.addEventListener("DOMContentLoaded", () => {
  initStaffPortalSettings({
    passwordToggleClass: "trainer-password-toggle",
    displayNameId: "user-name",
    initialsId: "user-initials",
  });
});
