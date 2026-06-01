import { initMiddleNameField } from "./middle-name-field.js";

const INITIAL_FORM_STATE = {
  firstName: "",
  middleName: "",
  lastName: "",
  emailAddress: "",
  password: "",
  passwordConfirm: "",
  phoneNumber: "09",
  region: "",
  province: "",
  cityMunicipality: "",
  barangay: "",
  zipCode: "",
  streetHouse: "",
  birthDate: "",
  gender: "",
  civilStatus: "",
  educationalAttainment: "",
  emergencyName: "",
  emergencyPhone: "09",
  programType: "",
  selectedProgram: "",
  preferredSchedule: "",
};

const FALLBACK_PROGRAM_OPTIONS = [
  "Automotive Servicing NC I",
  "Automotive Servicing (Engine Repair) NC II",
  "Driving NC II",
  "Driving NC III (Passenger Bus / Straight Truck)",
  "Rice Machinery Operations NC II",
];

function loadRegistrationConfig() {
  const el = document.getElementById("registration-config");
  if (!el?.textContent) {
    return { enrollmentOpen: true, programs: FALLBACK_PROGRAM_OPTIONS };
  }
  try {
    const data = JSON.parse(el.textContent);
    const programs = Array.isArray(data.programs) && data.programs.length ? data.programs : FALLBACK_PROGRAM_OPTIONS;
    return {
      enrollmentOpen: data.enrollmentOpen !== false,
      programs,
    };
  } catch {
    return { enrollmentOpen: true, programs: FALLBACK_PROGRAM_OPTIONS };
  }
}

const registrationConfig = loadRegistrationConfig();
const PROGRAM_OPTIONS = registrationConfig.programs;

const VALID_PROGRAM_TYPES = new Set(["training_with_assessment", "assessment_only"]);

const SCHEDULE_OPTIONS = [
  { id: "mon_fri_8_5", label: "Mondays - Fridays (8am - 5pm)" },
  { id: "sat_sun_8_5", label: "Saturdays - Sundays (8am - 5pm)" },
  { id: "mon_fri_5_9", label: "Mondays - Fridays (5pm - 9pm)" },
  { id: "sat_sun_5_9", label: "Saturdays - Sundays (5pm - 9pm)" },
];

const VALID_SCHEDULE_IDS = new Set(SCHEDULE_OPTIONS.map((o) => o.id));

const PROGRAM_TYPE_LABELS = {
  training_with_assessment: "Training with Assessment",
  assessment_only: "Assessment Only",
};

function getPresetProgramType() {
  const raw = new URLSearchParams(window.location.search).get("program_type");
  return raw && VALID_PROGRAM_TYPES.has(raw) ? raw : "";
}

function updateRegisterPathBanner(programType) {
  const type = programType || "";
  const label = PROGRAM_TYPE_LABELS[type] || "";

  document.querySelectorAll("#register-path-banner, #register-path-banner-inline").forEach((banner) => {
    const valueEl = banner.querySelector(".register-path-banner__value");
    if (!type || !label) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.classList.remove(
      "register-path-banner--training",
      "register-path-banner--assessment"
    );
    banner.classList.add(
      type === "assessment_only"
        ? "register-path-banner--assessment"
        : "register-path-banner--training"
    );
    if (valueEl) valueEl.textContent = label;
  });
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Philippine mobile: 11 digits total, 09 + 9 more digits (e.g. 09171234567). */
const PH_MOBILE_PATTERN = /^09\d{9}$/;
const PHONE_HINT = "The number is not a valid Philippine mobile number.";
const EMAIL_TAKEN_MSG =
  "This email is already registered. Please sign in or use a different email.";

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

function phoneDigitsEntered(value) {
  const len = (value || "").length;
  return len <= 2 ? 0 : len - 2;
}

function wirePasswordToggles(root) {
  root.querySelectorAll(".register-password-toggle").forEach((btn) => {
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

function isStep1Complete(formData, emailAvailable = null) {
  const phoneOk = isPhilippineMobileComplete(formData.phoneNumber);
  const emergencyOk = isPhilippineMobileComplete(formData.emergencyPhone);
  const passwordOk = (formData.password?.length || 0) >= 8;
  const passwordsMatch =
    passwordOk && formData.password === formData.passwordConfirm;
  const emailOk =
    formData.emailAddress?.trim() &&
    emailPattern.test(formData.emailAddress.trim()) &&
    emailAvailable !== false;
  return Boolean(
    formData.firstName?.trim() &&
      formData.lastName?.trim() &&
      emailOk &&
      passwordOk &&
      passwordsMatch &&
      phoneOk &&
      formData.region &&
      formData.province &&
      formData.cityMunicipality &&
      formData.barangay &&
      formData.birthDate &&
      formData.gender &&
      formData.civilStatus &&
      formData.emergencyName?.trim() &&
      emergencyOk
  );
}

function isStep2Complete(formData) {
  return Boolean(formData.programType && formData.selectedProgram);
}

function isStep3Complete(formData) {
  if (formData.programType === "assessment_only") return true;
  return Boolean(
    formData.preferredSchedule && VALID_SCHEDULE_IDS.has(formData.preferredSchedule)
  );
}

function buildRegistrationPayload(formData) {
  return {
    first_name: formData.firstName.trim(),
    middle_name: (formData.middleName || "").trim(),
    last_name: formData.lastName.trim(),
    email: formData.emailAddress.trim().toLowerCase(),
    phone_number: formData.phoneNumber,
    region_code: formData.region,
    province_code: formData.province,
    city_code: formData.cityMunicipality,
    barangay_code: formData.barangay,
    zip_code: (formData.zipCode || "").trim(),
    street_house: (formData.streetHouse || "").trim(),
    birth_date: formData.birthDate,
    gender: formData.gender,
    civil_status: formData.civilStatus,
    educational_attainment: (formData.educationalAttainment || "").trim(),
    emergency_name: formData.emergencyName.trim(),
    emergency_phone: formData.emergencyPhone,
    program_type: formData.programType,
    selected_program: formData.selectedProgram,
    preferred_schedule: formData.preferredSchedule,
    password: formData.password,
    password_confirm: formData.passwordConfirm,
  };
}

let regions = [];
let provinces = [];
let cities = [];
let barangays = [];

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("register-wizard");
  if (!root) return;

  wirePasswordToggles(root);

  const staticBase = root.dataset.staticBase || "/static/";
  [regions, provinces, cities, barangays] = await Promise.all([
    fetch(`${staticBase}data/address/region.json`).then((r) => r.json()),
    fetch(`${staticBase}data/address/province.json`).then((r) => r.json()),
    fetch(`${staticBase}data/address/city.json`).then((r) => r.json()),
    fetch(`${staticBase}data/address/barangay.json`).then((r) => r.json()),
  ]);

  let currentStep = 1;
  const presetProgramType = getPresetProgramType();
  let formData = { ...INITIAL_FORM_STATE, programType: presetProgramType };
  updateRegisterPathBanner(formData.programType);
  let emailAvailable = null;
  let emailCheckRequestId = 0;
  const touched = {};
  const programTypeSection = document.getElementById("program-type-section");
  const checkEmailUrl = root.dataset.checkEmailUrl || "/register/check-email/";

  const stepEls = [1, 2, 3, 4].map((n) => document.getElementById(`register-step-${n}`));
  const stepperItems = document.querySelectorAll("[data-stepper-step]");
  const stepConnectors = document.querySelectorAll("[data-step-connector]");
  const continueBtn = document.getElementById("step1-continue");

  function isAssessmentOnlyFlow() {
    return formData.programType === "assessment_only";
  }

  function getVisibleStepNumbers() {
    return isAssessmentOnlyFlow() ? [1, 2, 4] : [1, 2, 3, 4];
  }

  function normalizeTargetStep(step) {
    if (step === 3 && isAssessmentOnlyFlow()) return 4;
    return step;
  }

  function syncStepVisibility() {
    // Hide schedule step indicator/module for assessment-only flow.
    const assessmentOnly = isAssessmentOnlyFlow();
    const step3Indicator = document.querySelector('[data-stepper-step="3"]');
    const step3Card = document.getElementById("register-step-3");
    if (step3Indicator) step3Indicator.classList.toggle("d-none", assessmentOnly);
    if (step3Card) step3Card.classList.toggle("d-none", assessmentOnly);
    if (stepConnectors.length >= 3) {
      // Assessment-only: keep only the first connector.
      stepConnectors[1].classList.toggle("d-none", assessmentOnly);
      stepConnectors[2].classList.toggle("d-none", assessmentOnly);
    }
    // Renumber visible steps for cleaner assessment-only UX: 1, 2, 3.
    stepperItems.forEach((el) => {
      const stepNum = Number(el.dataset.stepperStep);
      const circle = el.querySelector("[data-step-circle]");
      if (!circle) return;
      if (assessmentOnly) {
        if (stepNum === 4) {
          circle.textContent = "3";
        } else {
          circle.textContent = String(stepNum);
        }
      } else {
        circle.textContent = String(stepNum);
      }
    });
    root.classList.toggle("register-flow-assessment-only", assessmentOnly);
  }

  function scrollTop() {
    window.scrollTo(0, 0);
  }

  function updateStepper() {
    const visibleSteps = getVisibleStepNumbers();
    const currentIdx = visibleSteps.indexOf(currentStep);
    stepperItems.forEach((el) => {
      const num = Number(el.dataset.stepperStep);
      const circle = el.querySelector("[data-step-circle]");
      const label = el.querySelector("[data-step-label]");
      const idx = visibleSteps.indexOf(num);
      const active = idx >= 0 && currentIdx >= idx;
      circle?.classList.toggle("active", active);
      circle?.classList.toggle("inactive", !active);
      if (label) {
        label.classList.toggle("text-vtiac", active);
        label.classList.toggle("text-muted", !active);
      }
    });
    if (isAssessmentOnlyFlow() && stepConnectors.length >= 3) {
      const step2Idx = visibleSteps.indexOf(2);
      const firstActive = currentIdx >= step2Idx;
      stepConnectors[0].classList.toggle("active", firstActive);
      stepConnectors[0].classList.toggle("inactive", !firstActive);
      return;
    }

    stepConnectors.forEach((connector, index) => {
      const prevStep = index + 1;
      const nextStep = index + 2;
      const prevIdx = visibleSteps.indexOf(prevStep);
      const nextIdx = visibleSteps.indexOf(nextStep);
      if (prevIdx < 0 || nextIdx < 0) return;
      const active = currentIdx >= nextIdx;
      connector.classList.toggle("active", active);
      connector.classList.toggle("inactive", !active);
    });
  }

  function showStep(step) {
    currentStep = normalizeTargetStep(step);
    stepEls.forEach((el, i) => {
      const stepNum = i + 1;
      const shouldShow = stepNum === currentStep;
      el?.classList.toggle("hidden-step", !shouldShow);
    });
    syncStepVisibility();
    updateStepper();
    updateRegisterPathBanner(formData.programType);
    if (step === 1) updateContinueBtn();
    if (step === 2) updateStep2ContinueBtn();
    if (currentStep === 3) renderScheduleList();
  }

  function updateContinueBtn() {
    if (!continueBtn) return;
    const ok = isStep1Complete(formData, emailAvailable);
    continueBtn.disabled = !ok;
  }

  async function checkEmailAvailability(email) {
    const normalized = (email || "").trim().toLowerCase();
    if (!emailPattern.test(normalized)) {
      emailAvailable = null;
      return null;
    }

    const requestId = ++emailCheckRequestId;
    try {
      const url = new URL(checkEmailUrl, window.location.origin);
      url.searchParams.set("email", normalized);
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Email check failed");
      const data = await res.json();
      if (requestId !== emailCheckRequestId) return null;
      emailAvailable = Boolean(data.available);
      return data;
    } catch {
      if (requestId === emailCheckRequestId) {
        emailAvailable = null;
      }
      return null;
    }
  }

  function fillSelect(select, options, placeholder) {
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
  }

  function populateAddressSelects() {
    const regionSel = document.getElementById("field-region");
    const provinceSel = document.getElementById("field-province");
    const citySel = document.getElementById("field-city");
    const barangaySel = document.getElementById("field-barangay");

    fillSelect(
      regionSel,
      regions.map((r) => ({ value: r.region_code, label: r.region_name })),
      "Select region"
    );

    const filteredProvinces = provinces.filter((p) => p.region_code === formData.region);
    fillSelect(
      provinceSel,
      filteredProvinces.map((p) => ({ value: p.province_code, label: p.province_name })),
      "Select province"
    );
    provinceSel.disabled = !formData.region;

    const filteredCities = cities.filter((c) => c.province_code === formData.province);
    fillSelect(
      citySel,
      filteredCities.map((c) => ({ value: c.city_code, label: c.city_name })),
      "Select city/municipality"
    );
    citySel.disabled = !formData.province;

    const filteredBarangays = barangays.filter((b) => b.city_code === formData.cityMunicipality);
    fillSelect(
      barangaySel,
      filteredBarangays.map((b) => ({ value: b.brgy_code, label: b.brgy_name })),
      "Select barangay"
    );
    barangaySel.disabled = !formData.cityMunicipality;

    if (formData.region) regionSel.value = formData.region;
    if (formData.province) provinceSel.value = formData.province;
    if (formData.cityMunicipality) citySel.value = formData.cityMunicipality;
    if (formData.barangay) barangaySel.value = formData.barangay;
  }

  function getFieldError(field) {
    if (!touched[field]) return null;
    const value = formData[field];
    if (!value || value === "09") return "This field is required";
    if (field === "emailAddress") {
      const trimmed = (value || "").trim();
      if (!trimmed) return "This field is required";
      if (!emailPattern.test(trimmed)) return "Invalid email";
      if (emailAvailable === false) return EMAIL_TAKEN_MSG;
    }
    if (field === "password" && value.length < 8) return "Password must be at least 8 characters";
    if (field === "passwordConfirm" && value !== formData.password) return "Passwords do not match";
    if (field === "phoneNumber" || field === "emergencyPhone") {
      if (!isPhilippineMobileComplete(value)) {
        if (!value || value === "09") return "This field is required";
        return PHONE_HINT;
      }
    }
    return null;
  }

  function updatePhoneHint(inputId, value) {
    const hint = document.getElementById(`${inputId}-hint`);
    if (!hint) return;
    const entered = phoneDigitsEntered(value);
    if (isPhilippineMobileComplete(value)) {
      hint.textContent = "Valid 11-digit mobile number.";
      hint.classList.remove("text-muted");
      hint.classList.add("text-success");
    } else {
      hint.textContent = `${PHONE_HINT} ${entered}/9 digits after 09.`;
      hint.classList.add("text-muted");
      hint.classList.remove("text-success");
    }
  }

  function showFieldError(fieldId, message) {
    const err = document.querySelector(`[data-error-for="${fieldId}"]`);
    const input = document.getElementById(fieldId);
    if (err) {
      err.textContent = message || "";
      err.classList.toggle("d-none", !message);
      err.classList.toggle("d-block", Boolean(message));
    }
    if (input) {
      input.classList.toggle("is-invalid", Boolean(message));
    }
  }

  function bindTextField(id, field) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", (e) => {
      formData[field] = e.target.value;
      updateContinueBtn();
    });
    el.addEventListener("blur", () => {
      touched[field] = true;
      showFieldError(id, getFieldError(field));
      updateContinueBtn();
    });
  }

  function bindPhoneField(id, field) {
    const el = document.getElementById(id);
    if (!el) return;
    const apply = (raw) => {
      formData[field] = normalizePhilippineMobile(raw);
      el.value = formData[field];
      updatePhoneHint(id, formData[field]);
      updateContinueBtn();
    };
    apply(formData[field] || "09");
    el.addEventListener("input", (e) => apply(e.target.value));
    el.addEventListener("blur", () => {
      touched[field] = true;
      apply(el.value);
      showFieldError(id, getFieldError(field));
      updateContinueBtn();
    });
  }

  function bindEmailField() {
    const el = document.getElementById("field-email");
    if (!el) return;
    let debounceTimer;

    const runCheck = async () => {
      const data = await checkEmailAvailability(formData.emailAddress);
      if (touched.emailAddress) {
        showFieldError("field-email", getFieldError("emailAddress"));
      }
      updateContinueBtn();
      return data;
    };

    el.addEventListener("input", (e) => {
      formData.emailAddress = e.target.value;
      emailAvailable = null;
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        void runCheck();
      }, 450);
      updateContinueBtn();
    });

    el.addEventListener("blur", () => {
      touched.emailAddress = true;
      formData.emailAddress = el.value;
      clearTimeout(debounceTimer);
      void runCheck();
    });
  }

  bindTextField("field-firstName", "firstName");
  bindTextField("field-middleName", "middleName");
  bindTextField("field-lastName", "lastName");
  initMiddleNameField({
    inputId: "field-middleName",
    onChange: (noMiddle, value) => {
      formData.middleName = noMiddle ? "" : value;
      updateContinueBtn();
    },
  });
  bindEmailField();
  bindTextField("field-password", "password");
  bindTextField("field-passwordConfirm", "passwordConfirm");
  bindPhoneField("field-phone", "phoneNumber");
  bindTextField("field-birthDate", "birthDate");
  bindTextField("field-emergencyName", "emergencyName");
  bindPhoneField("field-emergencyPhone", "emergencyPhone");

  ["field-gender", "field-civilStatus"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("change", (e) => {
      const field = id === "field-gender" ? "gender" : "civilStatus";
      formData[field] = e.target.value;
      updateContinueBtn();
    });
    el?.addEventListener("blur", () => {
      const field = id === "field-gender" ? "gender" : "civilStatus";
      touched[field] = true;
      showFieldError(id, getFieldError(field));
    });
  });

  function onAddressChange(field, value) {
    if (field === "region") {
      formData.region = value;
      formData.province = "";
      formData.cityMunicipality = "";
      formData.barangay = "";
    } else if (field === "province") {
      formData.province = value;
      formData.cityMunicipality = "";
      formData.barangay = "";
    } else if (field === "cityMunicipality") {
      formData.cityMunicipality = value;
      formData.barangay = "";
    } else {
      formData.barangay = value;
    }
    populateAddressSelects();
    updateContinueBtn();
  }

  ["field-region", "field-province", "field-city", "field-barangay"].forEach((id) => {
    const el = document.getElementById(id);
    const fieldMap = {
      "field-region": "region",
      "field-province": "province",
      "field-city": "cityMunicipality",
      "field-barangay": "barangay",
    };
    el?.addEventListener("change", (e) => onAddressChange(fieldMap[id], e.target.value));
    el?.addEventListener("blur", () => {
      touched[fieldMap[id]] = true;
      showFieldError(id, getFieldError(fieldMap[id]));
    });
  });

  populateAddressSelects();

  document.getElementById("step1-continue")?.addEventListener("click", async () => {
    const email = (formData.emailAddress || "").trim();
    touched.emailAddress = true;
    if (!emailPattern.test(email)) {
      showFieldError("field-email", "Invalid email (missing @ or domain)");
      updateContinueBtn();
      return;
    }

    const emailCheck = await checkEmailAvailability(email);
    if (!emailCheck?.available) {
      showFieldError(
        "field-email",
        emailCheck?.message || EMAIL_TAKEN_MSG
      );
      updateContinueBtn();
      document.getElementById("field-email")?.focus();
      return;
    }

    if (!isStep1Complete(formData, emailAvailable)) return;
    scrollTop();
    showStep(2);
    renderProgramList();
  });

  document.getElementById("step2-back")?.addEventListener("click", () => {
    scrollTop();
    document.getElementById("register-submit-error")?.classList.add("d-none");
    showStep(1);
  });

  function applyPresetProgramTypeUI() {
    if (!presetProgramType) return;
    programTypeSection?.classList.add("d-none");
    const programListSection = document.getElementById("program-list-section");
    programListSection?.classList.remove("hidden-step");
  }

  function renderProgramList() {
    const list = document.getElementById("program-list");
    const section = document.getElementById("program-list-section");
    if (!list || !section) return;
    applyPresetProgramTypeUI();
    section.classList.toggle("hidden-step", !formData.programType);
    list.innerHTML = "";
    PROGRAM_OPTIONS.forEach((program) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "program-option-btn btn w-100 text-start p-3 rounded-3 border" +
        (formData.selectedProgram === program ? " selected" : "");
      btn.innerHTML = `<span class="d-flex justify-content-between align-items-center w-100"><span>${program}</span>${formData.selectedProgram === program ? '<span class="text-vtiac fw-bold">✔</span>' : ""}</span>`;
      btn.addEventListener("click", () => {
        formData.selectedProgram = program;
        renderProgramList();
        updateStep2ContinueBtn();
      });
      list.appendChild(btn);
    });
    updateProgramTypeUI();
    updateStep2ContinueBtn();
  }

  function renderScheduleList() {
    const list = document.getElementById("schedule-list");
    if (!list) return;
    list.innerHTML = "";
    SCHEDULE_OPTIONS.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "program-option-btn btn w-100 text-start p-3 rounded-3 border" +
        (formData.preferredSchedule === option.id ? " selected" : "");
      btn.innerHTML = `<span class="d-flex justify-content-between align-items-center w-100"><span>${option.label}</span>${formData.preferredSchedule === option.id ? '<span class="text-vtiac fw-bold">✔</span>' : ""}</span>`;
      btn.addEventListener("click", () => {
        formData.preferredSchedule = option.id;
        renderScheduleList();
        updateStep3SubmitBtn();
      });
      list.appendChild(btn);
    });
    updateStep3SubmitBtn();
  }

  function updateProgramTypeUI() {
    document.querySelectorAll("[data-program-type]").forEach((btn) => {
      const type = btn.dataset.programType;
      const selected = formData.programType === type;
      btn.classList.remove("selected-training", "selected-assessment");
      if (selected) {
        btn.classList.add(type === "training_with_assessment" ? "selected-training" : "selected-assessment");
      }
      const mark = btn.querySelector("[data-check]");
      if (mark) mark.classList.toggle("d-none", !selected);
    });
    if (isAssessmentOnlyFlow()) {
      formData.preferredSchedule = "";
    }
    syncStepVisibility();
    updateRegisterPathBanner(formData.programType);
    updateStep2ContinueBtn();
  }

  if (!presetProgramType) {
    document.querySelectorAll("[data-program-type]").forEach((btn) => {
      btn.addEventListener("click", () => {
        formData.programType = btn.dataset.programType;
        formData.selectedProgram = "";
        renderProgramList();
      });
    });
  }

  const step2ContinueBtn = document.getElementById("step2-continue");
  const step3SubmitBtn = document.getElementById("step3-submit");

  function updateStep2ContinueBtn() {
    if (!step2ContinueBtn) return;
    step2ContinueBtn.disabled = !isStep2Complete(formData);
    step2ContinueBtn.textContent = isAssessmentOnlyFlow()
      ? "Submit Registration"
      : "Continue to Schedule";
  }

  function updateStep3SubmitBtn() {
    if (!step3SubmitBtn) return;
    const ok = isStep3Complete(formData) && !step3SubmitBtn.dataset.loading;
    step3SubmitBtn.disabled = !ok;
  }

  function submitRegistrationPost() {
    const postForm = document.getElementById("registration-post-form");
    if (!postForm) return;
    const payload = buildRegistrationPayload(formData);
    postForm.querySelectorAll('input[data-wizard-field="1"]').forEach((el) => el.remove());
    Object.entries(payload).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value ?? "";
      input.dataset.wizardField = "1";
      postForm.appendChild(input);
    });
    if (step3SubmitBtn) {
      step3SubmitBtn.dataset.loading = "1";
      step3SubmitBtn.disabled = true;
      step3SubmitBtn.textContent = "Submitting…";
    }
    postForm.submit();
  }

  step2ContinueBtn?.addEventListener("click", () => {
    if (!isStep2Complete(formData)) return;
    document.getElementById("register-submit-error")?.classList.add("d-none");
    if (isAssessmentOnlyFlow()) {
      (async () => {
        const emailCheck = await checkEmailAvailability(formData.emailAddress);
        if (!emailCheck?.available) {
          const submitError = document.getElementById("register-submit-error");
          if (submitError) {
            submitError.textContent = emailCheck?.message || EMAIL_TAKEN_MSG;
            submitError.classList.remove("d-none");
          }
          scrollTop();
          showStep(1);
          touched.emailAddress = true;
          showFieldError("field-email", emailCheck?.message || EMAIL_TAKEN_MSG);
          document.getElementById("field-email")?.focus();
          return;
        }
        submitRegistrationPost();
      })();
      return;
    }
    scrollTop();
    showStep(3);
    renderScheduleList();
  });

  document.getElementById("step3-back")?.addEventListener("click", () => {
    scrollTop();
    document.getElementById("register-submit-error-step3")?.classList.add("d-none");
    showStep(2);
    renderProgramList();
  });

  step3SubmitBtn?.addEventListener("click", async () => {
    if (!isStep2Complete(formData) || !isStep3Complete(formData)) return;

    const emailCheck = await checkEmailAvailability(formData.emailAddress);
    if (!emailCheck?.available) {
      const submitError = document.getElementById("register-submit-error-step3");
      if (submitError) {
        submitError.textContent = emailCheck?.message || EMAIL_TAKEN_MSG;
        submitError.classList.remove("d-none");
      }
      scrollTop();
      showStep(1);
      touched.emailAddress = true;
      showFieldError("field-email", emailCheck?.message || EMAIL_TAKEN_MSG);
      document.getElementById("field-email")?.focus();
      return;
    }

    document.getElementById("register-submit-error-step3")?.classList.add("d-none");
    submitRegistrationPost();
  });

  if (root.dataset.showConfirmation === "1") {
    showStep(4);
  } else if (!registrationConfig.enrollmentOpen) {
    root.querySelectorAll("[data-stepper-step], #register-step-1, #register-step-2, #register-step-3").forEach((el) => {
      el.classList.add("d-none");
    });
  } else {
    showStep(1);
  }
});
