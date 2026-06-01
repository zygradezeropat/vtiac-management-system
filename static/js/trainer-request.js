import { initMiddleNameField } from "./middle-name-field.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_MOBILE_PATTERN = /^09\d{9}$/;
const PHONE_HINT = "Enter 11 digits including 09 (example: 09171234567).";

function normalizePhilippineMobile(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits.length) return "09";
  if (digits.startsWith("9") && !digits.startsWith("09")) {
    digits = `0${digits}`;
  }
  if (!digits.startsWith("09")) {
    digits = digits.startsWith("0") ? `09${digits.slice(2)}` : `09${digits}`;
  }
  return `09${digits.slice(2, 11)}`;
}

function isPhilippineMobileComplete(value) {
  return PH_MOBILE_PATTERN.test(value || "");
}

function getCheckedQualifications() {
  const boxes = document.querySelectorAll("[data-qualification-checkbox]:checked");
  const other = document.getElementById("qual-other");
  const otherText = document.getElementById("field-otherSpecify")?.value?.trim() || "";
  let count = boxes.length;
  if (other?.checked && otherText) count += 1;
  if (other?.checked && !otherText) return { count: 0, needsOtherText: true };
  return { count, needsOtherText: false };
}

function isFormComplete() {
  const first = document.getElementById("field-firstName")?.value.trim();
  const last = document.getElementById("field-lastName")?.value.trim();
  const email = document.getElementById("field-email")?.value.trim();
  const phone = document.getElementById("field-phone")?.value || "";
  const password = document.getElementById("field-password")?.value || "";
  const confirm = document.getElementById("field-passwordConfirm")?.value || "";
  const highest = document.getElementById("field-otherQual")?.value.trim();
  const experience = document.getElementById("field-experience")?.value;
  const { count, needsOtherText } = getCheckedQualifications();

  return Boolean(
    first &&
      last &&
      email &&
      emailPattern.test(email) &&
      isPhilippineMobileComplete(phone) &&
      password.length >= 8 &&
      password === confirm &&
      count > 0 &&
      !needsOtherText &&
      highest &&
      experience
  );
}

function updateSubmitBtn() {
  const btn = document.getElementById("trainer-request-submit");
  if (btn) btn.disabled = !isFormComplete();
}

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("trainer-request-page");
  if (!root) return;

  const middleNameField = initMiddleNameField({ inputId: "field-middleName" });
  const requestForm = document.getElementById("trainer-request-form");
  requestForm?.addEventListener("submit", () => {
    middleNameField.prepareForSubmit();
  });

  const formPanel = document.getElementById("trainer-request-form-panel");
  const successPanel = document.getElementById("trainer-request-success-panel");

  if (root.dataset.showConfirmation === "1") {
    formPanel?.classList.add("hidden-step");
    successPanel?.classList.remove("hidden-step");
    const ref = root.dataset.referenceId || "";
    const refEl = document.getElementById("trainer-request-reference");
    if (refEl && ref) {
      refEl.textContent = ref;
      refEl.closest("[data-ref-block]")?.classList.remove("d-none");
    }
  }

  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      const isText = input.type === "text";
      input.type = isText ? "password" : "text";
      btn.setAttribute("aria-label", isText ? "Show password" : "Hide password");
    });
  });

  const phoneEl = document.getElementById("field-phone");
  if (phoneEl) {
    const applyPhone = (raw) => {
      phoneEl.value = normalizePhilippineMobile(raw);
      updateSubmitBtn();
    };
    applyPhone(phoneEl.value || "09");
    phoneEl.addEventListener("input", (e) => applyPhone(e.target.value));
  }

  const otherCheck = document.getElementById("qual-other");
  const otherSpecify = document.getElementById("field-otherSpecify");
  otherCheck?.addEventListener("change", () => {
    if (otherSpecify) {
      otherSpecify.disabled = !otherCheck.checked;
      if (!otherCheck.checked) otherSpecify.value = "";
    }
    updateSubmitBtn();
  });

  document.querySelectorAll("[data-qualification-checkbox], #qual-other").forEach((el) => {
    el.addEventListener("change", updateSubmitBtn);
  });

  ["field-firstName", "field-middleName", "field-lastName", "field-email", "field-password", "field-passwordConfirm", "field-otherQual", "field-otherSpecify"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateSubmitBtn);
  });
  document.getElementById("field-experience")?.addEventListener("change", updateSubmitBtn);

  updateSubmitBtn();
});
