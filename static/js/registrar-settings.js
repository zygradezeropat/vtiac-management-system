/**
 * Registrar Settings — profile + password (demo).
 */

import { initAddressCascade } from "./address-cascade.js";

const PROFILE_STORAGE_KEY = "vtiac_registrar_profile";

function loadSavedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function saveProfile(data) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data));
}

function parseAddressSeed(seedEl) {
  if (!seedEl?.textContent?.trim()) return {};
  try {
    return JSON.parse(seedEl.textContent);
  } catch {
    return {};
  }
}

function normalizeSavedAddress(saved) {
  if (!saved?.address) return null;
  if (typeof saved.address === "object") return saved.address;
  return null;
}

function wirePasswordToggles(root) {
  root.querySelectorAll(".registrar-password-toggle").forEach((btn) => {
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

document.addEventListener("DOMContentLoaded", async () => {
  const profileForm = document.getElementById("profile-form");
  const passwordForm = document.getElementById("password-form");
  const seedEl = document.getElementById("settings-address-seed");

  wirePasswordToggles(document);

  let addressCascade = null;
  if (profileForm) {
    const staticBase = profileForm.dataset.staticBase || "/static/";
    const serverSeed = parseAddressSeed(seedEl);
    const saved = loadSavedProfile();
    const savedAddress = normalizeSavedAddress(saved);
    const initial = savedAddress || serverSeed;

    addressCascade = await initAddressCascade({
      staticBase,
      selectors: {
        region: "profile-region",
        province: "profile-province",
        city: "profile-city",
        barangay: "profile-barangay",
      },
      initial,
    });

    if (saved) {
      const fields = ["firstName", "lastName", "email", "phone"];
      fields.forEach((name) => {
        const el = profileForm.elements[name];
        if (el && saved[name] != null) el.value = saved[name];
      });
      const street = profileForm.elements.streetHouse;
      if (street && saved.address?.streetHouse) street.value = saved.address.streetHouse;
      if (savedAddress) addressCascade.setState(savedAddress);
    }
  }

  profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!addressCascade?.isComplete()) {
      window.alert("Please complete Region, Province, City/Municipality, and Barangay.");
      return;
    }
    const addressState = addressCascade.getState();
    const streetHouse = profileForm.elements.streetHouse.value.trim();
    const data = {
      firstName: profileForm.elements.firstName.value.trim(),
      lastName: profileForm.elements.lastName.value.trim(),
      email: profileForm.elements.email.value.trim(),
      phone: profileForm.elements.phone.value.trim(),
      address: { ...addressState, streetHouse },
      addressLabel: addressCascade.formatLabel(streetHouse),
    };
    saveProfile(data);
    const display = `${data.firstName} ${data.lastName}`.trim();
    const nameEl = document.getElementById("staff-display-name");
    if (nameEl && display) nameEl.textContent = display;
    window.alert("Profile saved. (Demo — connect to staff profile API when ready.)");
  });

  passwordForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const current = passwordForm.elements.currentPassword.value;
    const next = passwordForm.elements.newPassword.value;
    const confirm = passwordForm.elements.confirmPassword.value;

    if (!current || !next || !confirm) return;
    if (next.length < 8) {
      window.alert("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      window.alert("New password and confirmation do not match.");
      return;
    }

    passwordForm.reset();
    window.alert("Password updated. (Demo — no server call yet.)");
  });
});
