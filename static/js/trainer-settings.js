/**
 * Trainer Settings — profile + password (server-backed).
 */

import { initAddressCascade } from "./address-cascade.js";
import { postSettingsForm, showSettingsModal } from "./staff-settings-modal.js";

function parseAddressSeed(seedEl) {
  if (!seedEl?.textContent?.trim()) return {};
  try {
    return JSON.parse(seedEl.textContent);
  } catch {
    return {};
  }
}

function wirePasswordToggles(root) {
  root.querySelectorAll(".trainer-password-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.classList.toggle("bi-eye", !show);
        icon.classList.toggle("bi-eye-slash", show);
      }
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

function setSubmitting(form, button, submitting) {
  if (!button) return;
  button.disabled = submitting;
  if (submitting) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = "Saving…";
  } else if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const profileForm = document.getElementById("profile-form");
  const passwordForm = document.getElementById("password-form");
  const seedEl = document.getElementById("settings-address-seed");
  const profileUrl = profileForm?.dataset.profileUrl;
  const passwordUrl = passwordForm?.dataset.passwordUrl;

  wirePasswordToggles(document);

  let addressCascade = null;
  if (profileForm) {
    const staticBase = profileForm.dataset.staticBase || "/static/";
    const serverSeed = parseAddressSeed(seedEl);

    addressCascade = await initAddressCascade({
      staticBase,
      selectors: {
        region: "profile-region",
        province: "profile-province",
        city: "profile-city",
        barangay: "profile-barangay",
      },
      initial: serverSeed,
    });
  }

  profileForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!profileUrl) return;

    if (!addressCascade?.isComplete()) {
      showSettingsModal({
        title: "Incomplete address",
        message:
          "Please complete Region, Province, City/Municipality, and Barangay.",
        variant: "error",
      });
      return;
    }

    const submitBtn = profileForm.querySelector('[type="submit"]');
    setSubmitting(profileForm, submitBtn, true);

    const addressState = addressCascade.getState();
    const formData = new FormData(profileForm);
    formData.set("region", addressState.region || "");
    formData.set("province", addressState.province || "");
    formData.set(
      "cityMunicipality",
      addressState.cityMunicipality || addressState.city || "",
    );
    formData.set("barangay", addressState.barangay || "");

    try {
      const result = await postSettingsForm(profileUrl, formData);
      const nameEl = document.getElementById("user-name");
      const initialsEl = document.getElementById("user-initials");
      if (nameEl && result.display_name) nameEl.textContent = result.display_name;
      if (initialsEl && result.initials) initialsEl.textContent = result.initials;

      showSettingsModal({
        title: "Profile saved",
        message: result.message || "Your profile was updated successfully.",
        variant: "success",
      });
    } catch (err) {
      showSettingsModal({
        title: "Could not save profile",
        message: err.message || "Please check your entries and try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(profileForm, submitBtn, false);
    }
  });

  passwordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!passwordUrl) return;

    const submitBtn = passwordForm.querySelector('[type="submit"]');
    setSubmitting(passwordForm, submitBtn, true);

    try {
      const result = await postSettingsForm(
        passwordUrl,
        new FormData(passwordForm),
      );
      passwordForm.reset();
      showSettingsModal({
        title: "Password updated",
        message: result.message || "Your password was changed successfully.",
        variant: "success",
      });
    } catch (err) {
      showSettingsModal({
        title: "Could not update password",
        message: err.message || "Please verify your current password and try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(passwordForm, submitBtn, false);
    }
  });
});
