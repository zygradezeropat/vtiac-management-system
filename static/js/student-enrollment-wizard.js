/**
 * Page-to-page wizard for the TESDA enrollment form (training variant).
 */


// Handles step navigation, progress updates, and per-step validation before Next.

const STEP_ISSUES = {
  2: ["complete all required profile fields", "select Region, Province, City, and Barangay", "enter a valid contact number (11 digits starting with 09)"],
  3: ["complete all required personal information fields", "select employment type if wage-employed or underemployed"],
  4: ["select at least one client classification"],
  5: ["specify disability types when Multiple Disabilities is selected"],
  9: ["agree to the privacy consent"],
  10: ["upload a 1×1 photo (JPEG or PNG, max 5MB)"],
};

/**
 * @param {HTMLFormElement} form
 * @param {object} helpers - validation helpers from student-enrollment.js
 */
export function initEnrollmentWizard(form, helpers) {
  const wizardRoot = document.getElementById("student-enrollment-wizard");
  if (!wizardRoot || form.dataset.formVariant === "assessment_only") {
    return null;
  }

  const totalSteps = Number(wizardRoot.dataset.totalSteps) || 10;
  const stepEls = Array.from(wizardRoot.querySelectorAll("[data-enrollment-step]"));
  const backBtn = document.getElementById("enrollment-wizard-back");
  const nextBtn = document.getElementById("enrollment-wizard-next");
  const submitBtn = document.getElementById("enrollment-continue-btn");
  const navButtons = document.querySelector(".student-enroll-wizard-nav__buttons");
  const stepCounterEl = document.getElementById("enrollment-wizard-step-counter");
  const stepTitleEl = document.getElementById("enrollment-wizard-step-title");
  const formProgressFill = document.getElementById("enrollment-form-progress-fill");
  const formProgressLabel = document.getElementById("enrollment-form-progress-label");
  const formProgressBar = document.getElementById("enrollment-form-progress");

  let currentStep = 1;

  function getStepEl(step) {
    return wizardRoot.querySelector(`[data-enrollment-step="${step}"]`);
  }

  function scrollToWizardTop() {
    const target = document.querySelector(".student-enroll-wizard-nav") || wizardRoot;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateProgressUI() {
    const percent = Math.round((currentStep / totalSteps) * 100);
    if (formProgressFill) {
      formProgressFill.style.width = `${percent}%`;
    }
    if (formProgressBar) {
      formProgressBar.setAttribute("aria-valuenow", String(percent));
    }
    if (formProgressLabel) {
      formProgressLabel.textContent = `${percent}%`;
    }
    if (stepCounterEl) {
      stepCounterEl.textContent = `Step ${currentStep} of ${totalSteps}`;
    }
    const activeStep = getStepEl(currentStep);
    if (stepTitleEl && activeStep) {
      stepTitleEl.textContent = activeStep.dataset.stepTitle || `Section ${currentStep}`;
    }
  }

  function updateNavButtons() {
    const isFirstStep = currentStep <= 1;
    backBtn?.classList.toggle("d-none", isFirstStep);
    nextBtn?.classList.toggle("d-none", currentStep >= totalSteps);
    submitBtn?.classList.toggle("d-none", currentStep < totalSteps);
    navButtons?.classList.toggle("student-enroll-wizard-nav__buttons--step-first", isFirstStep);
  }

  function showStep(step) {
    currentStep = Math.min(Math.max(step, 1), totalSteps);
    stepEls.forEach((el) => {
      const stepNum = Number(el.dataset.enrollmentStep);
      el.classList.toggle("hidden-step", stepNum !== currentStep);
    });
    updateProgressUI();
    updateNavButtons();
    scrollToWizardTop();
  }

  function validateCurrentStep() {
    return helpers.validateWizardStep(form, currentStep);
  }

  function showStepAlert(step) {
    const alertEl = document.getElementById("enrollment-form-alert");
    const alertTextEl = document.getElementById("enrollment-form-alert-text");
    if (!alertEl || !alertTextEl) return;

    const issues = helpers.collectWizardStepIssues(form, currentStep);
    const fallback = STEP_ISSUES[step] || ["complete all required fields on this page"];
    alertTextEl.textContent =
      issues.length > 0
        ? `Please fix the following: ${issues.join("; ")}.`
        : `Please ${fallback.join(", ")}.`;
    alertEl.classList.remove("d-none");
    alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  backBtn?.addEventListener("click", () => {
    document.getElementById("enrollment-form-alert")?.classList.add("d-none");
    showStep(currentStep - 1);
  });

  nextBtn?.addEventListener("click", () => {
    helpers.updateRequiredFieldStates(form, currentStep);
    if (!validateCurrentStep()) {
      showStepAlert(currentStep);
      const stepEl = getStepEl(currentStep);
      const firstInvalid = stepEl?.querySelector(
        ".is-invalid, .student-enroll-classifications--invalid"
      );
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    document.getElementById("enrollment-form-alert")?.classList.add("d-none");
    showStep(currentStep + 1);
  });

  showStep(1);

  return {
    getCurrentStep: () => currentStep,
    showStep,
    goToFirstInvalidStep(formEl) {
      for (let step = 1; step <= totalSteps; step += 1) {
        if (!helpers.validateWizardStep(formEl, step)) {
          helpers.updateRequiredFieldStates(formEl, step);
          showStep(step);
          return step;
        }
      }
      return null;
    },
  };
}
