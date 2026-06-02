/**
 * Student enrollment — TESDA learner profile form (Step 1).
 */

import { initAddressCascade } from "./address-cascade.js";
import { createFilePreviewControls, initFilePreviewTriggers } from "./file-upload-preview.js";
import { initMiddleNameField } from "./middle-name-field.js";
import { initAssessmentTables } from "./student-enrollment-assessment-tables.js";
import { initEnrollmentProgramChange } from "./student-enrollment-program.js";
import { initMonthYearInputs } from "./month-year-input.js";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PH_MOBILE_RE = /^09\d{9}$/;
const ADDRESS_FIELD_IDS = ["field-region", "field-province", "field-city", "field-barangay"];

function parseAddressInitial() {
  const el = document.getElementById("enrollment-address-initial");
  if (!el?.textContent) return {};
  try {
    return JSON.parse(el.textContent);
  } catch {
    return {};
  }
}

function isEmpty(el) {
  if (!el) return true;
  if (el.type === "checkbox") return !el.checked;
  if (el.type === "file") return !el.files?.length;
  return !String(el.value || "").trim();
}

function hasClassificationSelected(form) {
  return form.querySelectorAll('input[name="client_classification"]:checked').length > 0;
}

function hasCheckboxGroupSelected(form, name) {
  return form.querySelectorAll(`input[name="${name}"]:checked`).length > 0;
}

function hasRadioGroupSelected(form, name) {
  return Boolean(form.querySelector(`input[name="${name}"]:checked`));
}

function employmentTypeRequired(form) {
  const status = form.querySelector("#field-employment")?.value || "";
  return status === "wage_employed" || status === "underemployed";
}

function normalizeContactNumber(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length >= 12) {
    digits = `0${digits.slice(2, 12)}`;
  } else if (digits.startsWith("9") && digits.length === 10) {
    digits = `0${digits}`;
  }
  return digits.slice(0, 11);
}

function isValidContactNumber(form) {
  const el = form.querySelector("#field-contact");
  if (!el || isEmpty(el)) return true;
  return PH_MOBILE_RE.test(normalizeContactNumber(el.value));
}

function isValidPhotoField(form) {
  const photo = form.querySelector("#field-photo");
  const hasExistingPhoto = form.dataset.hasPhoto === "1";
  if (!photo) return true;
  if (hasExistingPhoto && isEmpty(photo)) return true;
  const file = photo.files?.[0];
  if (!file) return false;
  if (file.size > MAX_PHOTO_BYTES) return false;
  const type = (file.type || "").toLowerCase();
  return type === "image/jpeg" || type === "image/png";
}

function enableAddressFieldsForSubmit() {
  ADDRESS_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

function isAddressComplete() {
  return ADDRESS_FIELD_IDS.every((id) => {
    const el = document.getElementById(id);
    return el && !isEmpty(el);
  });
}

/** First Middle Last [Extension] — matches typed full-name signature. */
function composeApplicantFullName(form, middleNameField) {
  const first = form.querySelector("#field-first-name")?.value.trim() || "";
  const last = form.querySelector("#field-last-name")?.value.trim() || "";
  const middle =
    middleNameField?.getValue?.() ??
    form.querySelector("#field-middle-name")?.value.trim() ??
    "";
  const extension = form.querySelector("#field-extension")?.value.trim() || "";
  const parts = [first, middle, last].filter(Boolean);
  let full = parts.join(" ");
  if (extension) {
    full = full ? `${full} ${extension}` : extension;
  }
  return full.trim();
}

/** Keep #field-signature in sync with First + Middle + Last + extension. */
function initApplicantSignatureAutoFill(form, middleNameField) {
  const signatureEl = form.querySelector("#field-signature");
  if (!signatureEl) {
    return () => {};
  }

  const sync = () => {
    const composed = composeApplicantFullName(form, middleNameField);
    if (!composed) return;
    if (signatureEl.value !== composed) {
      signatureEl.value = composed;
      signatureEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  ["#field-first-name", "#field-last-name", "#field-middle-name", "#field-extension"].forEach(
    (selector) => {
      const el = form.querySelector(selector);
      el?.addEventListener("input", sync);
      el?.addEventListener("change", sync);
    }
  );

  sync();
  return sync;
}

function syncEmploymentTypeField(form) {
  const wrap = document.getElementById("employment-type-wrap");
  const select = document.getElementById("field-employment-type");
  const mark = document.getElementById("employment-type-required-mark");
  if (!wrap || !select) return;

  const required = employmentTypeRequired(form);
  select.toggleAttribute("data-required", required);
  select.required = required;
  mark?.classList.toggle("d-none", !required);
  if (!required) {
    select.classList.remove("is-invalid");
  }
}

function validateAssessmentForm(form) {
  const required = form.querySelectorAll("[data-required]");
  for (const el of required) {
    if (el.type === "radio") {
      const name = el.name;
      if (!hasRadioGroupSelected(form, name)) return false;
      continue;
    }
    if (isEmpty(el)) return false;
  }

  if (!hasRadioGroupSelected(form, "assessment_type")) return false;
  if (!hasRadioGroupSelected(form, "assessment_client_type")) return false;

  const photo = form.querySelector("#field-photo");
  const hasExistingPhoto = form.dataset.hasPhoto === "1";
  if (!hasExistingPhoto && isEmpty(photo)) return false;
  if (!isValidPhotoField(form)) return false;
  if (!isValidContactNumber(form)) return false;
  if (!isAddressComplete()) return false;

  return true;
}

function validateTrainingForm(form) {
  const required = form.querySelectorAll("[data-required]");
  for (const el of required) {
    if (el.id === "field-employment-type" && !employmentTypeRequired(form)) continue;
    if (el.id === "field-disability-other") {
      const multipleChecked = form.querySelector(
        'input[name="disability_type"][data-multiple-disabilities="1"]:checked'
      );
      if (!multipleChecked) continue;
    }
    if (el.type === "radio") {
      if (!hasRadioGroupSelected(form, el.name)) return false;
      continue;
    }
    if (isEmpty(el)) return false;
  }

  if (!hasClassificationSelected(form)) return false;

  const photo = form.querySelector("#field-photo");
  const hasExistingPhoto = form.dataset.hasPhoto === "1";
  if (!hasExistingPhoto && isEmpty(photo)) return false;
  if (!isValidPhotoField(form)) return false;
  if (!isValidContactNumber(form)) return false;
  if (!isAddressComplete()) return false;

  return true;
}

function collectValidationIssues(form) {
  const variant = form.dataset.formVariant || "training";
  const issues = [];

  if (!isAddressComplete()) {
    issues.push("complete your Region, Province, City, and Barangay");
  }

  if (!isValidContactNumber(form)) {
    issues.push("enter a valid contact number (11 digits starting with 09, e.g. 09171234567)");
  }

  const photo = form.querySelector("#field-photo");
  const hasExistingPhoto = form.dataset.hasPhoto === "1";
  if (photo && !hasExistingPhoto && isEmpty(photo)) {
    issues.push("upload a 1×1 photo (JPEG or PNG)");
  } else if (photo?.files?.[0] && !isValidPhotoField(form)) {
    issues.push("use a JPEG or PNG photo no larger than 5MB");
  }

  if (variant !== "assessment_only" && !hasClassificationSelected(form)) {
    issues.push("select at least one client classification (Section 4)");
  }

  if (variant === "assessment_only") {
    if (!hasRadioGroupSelected(form, "assessment_type")) {
      issues.push("select an assessment type");
    }
    if (!hasRadioGroupSelected(form, "assessment_client_type")) {
      issues.push("select a client type");
    }
  }

  if (variant !== "assessment_only" && employmentTypeRequired(form)) {
    const employmentType = form.querySelector("#field-employment-type");
    if (employmentType && isEmpty(employmentType)) {
      issues.push("select an employment type");
    }
  }

  return issues;
}

function validateForm(form) {
  const variant = form.dataset.formVariant || "training";
  if (variant === "assessment_only") {
    return validateAssessmentForm(form);
  }
  return validateTrainingForm(form);
}

function shouldValidateRequiredField(form, el) {
  if (el.id === "field-employment-type" && !employmentTypeRequired(form)) return false;
  if (el.id === "field-disability-other") {
    const multipleChecked = form.querySelector(
      'input[name="disability_type"][data-multiple-disabilities="1"]:checked'
    );
    return Boolean(multipleChecked);
  }
  return true;
}

function updateRequiredFieldStates(form) {
  const variant = form.dataset.formVariant || "training";

  form.querySelectorAll("[data-required]").forEach((el) => {
    if (!shouldValidateRequiredField(form, el)) {
      el.classList.remove("is-invalid");
      return;
    }
    let invalid = false;
    if (el.type === "radio") {
      invalid = !hasRadioGroupSelected(form, el.name);
    } else {
      invalid = isEmpty(el);
    }
    el.classList.toggle("is-invalid", invalid);
  });

  const contact = form.querySelector("#field-contact");
  if (contact) {
    const contactInvalid = isEmpty(contact) || !isValidContactNumber(form);
    contact.classList.toggle("is-invalid", contactInvalid);
  }

  const photo = form.querySelector("#field-photo");
  const hasExistingPhoto = form.dataset.hasPhoto === "1";
  const photoInvalid =
    photo &&
    ((!hasExistingPhoto && isEmpty(photo)) || (photo.files?.[0] && !isValidPhotoField(form)));
  photo?.classList.toggle("is-invalid", Boolean(photoInvalid));

  ADDRESS_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    el?.classList.toggle("is-invalid", isEmpty(el));
  });

  if (variant === "assessment_only") {
    const typeGroup = document.getElementById("assessment-type-group");
    const clientGroup = document.getElementById("assessment-client-type-group");
    typeGroup?.classList.toggle(
      "student-enroll-classifications--invalid",
      !hasRadioGroupSelected(form, "assessment_type")
    );
    clientGroup?.classList.toggle(
      "student-enroll-classifications--invalid",
      !hasRadioGroupSelected(form, "assessment_client_type")
    );
    return;
  }

  const classGroup = document.getElementById("client-classifications-group");
  if (classGroup) {
    classGroup.classList.toggle(
      "student-enroll-classifications--invalid",
      !hasClassificationSelected(form)
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initFilePreviewTriggers(document);

  const photoInput = document.getElementById("field-photo");
  if (photoInput) {
    createFilePreviewControls(photoInput, {
      existingUrl: photoInput.dataset.previewExistingUrl || "",
      existingName: photoInput.dataset.previewExistingName || "1×1 Photo",
    });
  }

  const form = document.getElementById("student-enrollment-form");
  if (!form) return;

  let syncSignatureFromName = () => {};
  const middleNameField = initMiddleNameField({
    inputId: "field-middle-name",
    onChange: () => syncSignatureFromName(),
  });
  syncSignatureFromName = initApplicantSignatureAutoFill(form, middleNameField);

  const alertEl = document.getElementById("enrollment-form-alert");
  const staticBase = form.dataset.staticBase || "/static/";

  const variant = form.dataset.formVariant || "training";
  if (variant === "assessment_only") {
    initMonthYearInputs(form);
    initAssessmentTables(form);
  }
  if (variant !== "assessment_only") {
    initEnrollmentProgramChange(form);
    const employmentStatus = form.querySelector("#field-employment");
    employmentStatus?.addEventListener("change", () => {
      syncEmploymentTypeField(form);
      refreshValidation();
    });
    syncEmploymentTypeField(form);
  }

  const birthDateEl = form.querySelector("#field-birthdate");
  const ageEl = form.querySelector("#field-age");
  if (birthDateEl && ageEl) {
    const syncAge = () => {
      if (!birthDateEl.value) return;
      const born = new Date(birthDateEl.value);
      if (Number.isNaN(born.getTime())) return;
      const today = new Date();
      let age = today.getFullYear() - born.getFullYear();
      const monthDiff = today.getMonth() - born.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) {
        age -= 1;
      }
      if (age >= 0 && age <= 120) {
        ageEl.value = String(age);
      }
    };
    birthDateEl.addEventListener("change", syncAge);
    syncAge();
  }

  const alertTextEl = document.getElementById("enrollment-form-alert-text");

  const refreshValidation = () => {
    updateRequiredFieldStates(form);
    if (validateForm(form)) {
      alertEl?.classList.add("d-none");
    }
  };

  refreshValidation();

  initAddressCascade({
    staticBase,
    selectors: {
      region: "field-region",
      province: "field-province",
      city: "field-city",
      barangay: "field-barangay",
    },
    initial: parseAddressInitial(),
  })
    .then(() => {
      ADDRESS_FIELD_IDS.forEach((id) => {
        document.getElementById(id)?.addEventListener("change", refreshValidation);
      });
      refreshValidation();
    })
    .catch(() => {
      if (alertTextEl) {
        alertTextEl.textContent =
          "Could not load address lists. Refresh the page or check your connection, then try again.";
      }
      alertEl?.classList.remove("d-none");
    });

  form.addEventListener("submit", (e) => {
    enableAddressFieldsForSubmit();
    middleNameField.prepareForSubmit();
    syncSignatureFromName();
    updateRequiredFieldStates(form);
    const valid = validateForm(form);

    if (!valid) {
      e.preventDefault();
      const issues = collectValidationIssues(form);
      if (alertTextEl) {
        alertTextEl.textContent =
          issues.length > 0
            ? `Please fix the following: ${issues.join("; ")}.`
            : "Please complete all required fields before proceeding.";
      }
      alertEl?.classList.remove("d-none");
      const firstInvalid = form.querySelector(
        ".is-invalid, .student-enroll-classifications--invalid"
      );
      if (firstInvalid) {
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        alertEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    alertEl?.classList.add("d-none");
  });

  form.querySelectorAll("[data-required]").forEach((el) => {
    el.addEventListener("input", refreshValidation);
    el.addEventListener("change", refreshValidation);
  });

  form.querySelectorAll('input[name="client_classification"]').forEach((el) => {
    el.addEventListener("change", refreshValidation);
  });

  form.querySelectorAll('input[name="assessment_type"]').forEach((el) => {
    el.addEventListener("change", refreshValidation);
  });

  form.querySelectorAll('input[name="assessment_client_type"]').forEach((el) => {
    el.addEventListener("change", refreshValidation);
  });

  const disabilityOtherWrap = document.getElementById("disability-other-wrap");
  const disabilityOtherInput = document.getElementById("field-disability-other");

  if (variant === "assessment_only") {
    return;
  }

  function syncDisabilityOtherField() {
    const multipleChecked = form.querySelector(
      'input[name="disability_type"][data-multiple-disabilities="1"]:checked'
    );
    const show = Boolean(multipleChecked);
    disabilityOtherWrap?.classList.toggle("d-none", !show);
    if (disabilityOtherInput) {
      disabilityOtherInput.toggleAttribute("data-required", show);
      disabilityOtherInput.required = show;
      if (!show) {
        disabilityOtherInput.value = "";
        disabilityOtherInput.classList.remove("is-invalid");
      }
    }
  }

  form.querySelectorAll('input[name="disability_type"]').forEach((el) => {
    el.addEventListener("change", () => {
      syncDisabilityOtherField();
      refreshValidation();
    });
  });
  syncDisabilityOtherField();
});
