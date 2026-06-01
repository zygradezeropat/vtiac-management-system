/**
 * Student Settings — profile + password (server-backed).
 */

import { initStaffPortalSettings } from "./staff-portal-settings.js";

document.addEventListener("DOMContentLoaded", () => {
  initStaffPortalSettings({
    passwordToggleClass: "student-password-toggle",
    displayNameId: "staff-display-name",
    initialsId: "staff-initials",
  });
});
