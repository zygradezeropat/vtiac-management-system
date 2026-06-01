/**
 * Trainer — Grading & Assessment demo (editable UC table per student).
 */

import { getCsrfToken } from "./staff-settings-modal.js";

const STORAGE_KEY = "vtiac_trainer_grades_demo";

function readConfig() {
  const el = document.getElementById("grading-config");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "{}");
  } catch {
    return null;
  }
}

function loadSavedGrades() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function seedDemoGrades() {
  return {
    "demo-juan-dela-cruz": {
      scores: {
        "uc-1": { written: 78, demo: 82, interview: 74 },
        "uc-2": { written: 88, demo: 85, interview: 90 },
        "uc-3": { written: 70, demo: 68, interview: 72 },
      },
      learning_outcomes: {
        "lo-1": true,
        "lo-2": true,
        "lo-3": false,
        "lo-4": false,
      },
      national_assessment: { result: "", date: "" },
    },
  };
}

function mergeDemoSeed(store, students) {
  const hasDemo = students.some((s) => s.key.startsWith("demo-"));
  if (!hasDemo) return store;
  const seed = seedDemoGrades();
  const merged = { ...store };
  Object.entries(seed).forEach(([key, value]) => {
    if (!merged[key]) merged[key] = value;
  });
  return merged;
}

function saveAllGrades(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SCORE_MIN = 0;
const SCORE_MAX = 100;

function parseScore(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < SCORE_MIN || num > SCORE_MAX) return null;
  return num;
}

function sanitizeScoreValue(value) {
  if (value === "" || value == null) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  if (num > SCORE_MAX) return SCORE_MAX;
  if (num < SCORE_MIN) return SCORE_MIN;
  return num;
}

function enforceScoreInput(input) {
  const raw = String(input.value ?? "").trim();
  if (raw === "") {
    input.classList.remove("trainer-score-input--invalid");
    input.setCustomValidity("");
    return;
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    input.classList.add("trainer-score-input--invalid");
    input.setCustomValidity("Enter a number from 0 to 100.");
    return;
  }

  if (num > SCORE_MAX) {
    input.value = String(SCORE_MAX);
    input.classList.remove("trainer-score-input--invalid");
    input.setCustomValidity("");
    return;
  }

  if (num < SCORE_MIN) {
    input.value = String(SCORE_MIN);
    input.classList.remove("trainer-score-input--invalid");
    input.setCustomValidity("");
    return;
  }

  input.classList.remove("trainer-score-input--invalid");
  input.setCustomValidity("");
}

function bindScoreInput(input, rowEl, passingAverage, onChange) {
  input.addEventListener("input", () => {
    enforceScoreInput(input);
    updateRowCalculations(rowEl, passingAverage);
    onChange();
  });
  input.addEventListener("blur", () => {
    enforceScoreInput(input);
    updateRowCalculations(rowEl, passingAverage);
    onChange();
  });
}

function hasInvalidScoreInputs() {
  return Boolean(
    document.querySelector(".trainer-score-input.trainer-score-input--invalid")
  );
}

function computeAverage(written, demo, interview) {
  const scores = [written, demo, interview].filter((s) => s != null);
  if (scores.length !== 3) return null;
  return scores.reduce((sum, s) => sum + s, 0) / 3;
}

function formatAverage(avg) {
  if (avg == null) return "—";
  return avg.toFixed(1);
}

function statusFromAverage(avg, passingAverage) {
  if (avg == null) return { label: "—", className: "trainer-grade-badge--pending" };
  if (avg >= passingAverage) {
    return { label: "C", className: "trainer-grade-badge--competent" };
  }
  return { label: "NYC", className: "trainer-grade-badge--nyc" };
}

function emptyStudentRecord(learningOutcomes) {
  return {
    scores: {},
    learning_outcomes: Object.fromEntries(
      learningOutcomes.map((lo) => [lo.id, false])
    ),
    national_assessment: { result: "", date: "" },
  };
}

function getStudentRecord(store, studentKey, learningOutcomes) {
  if (!store[studentKey]) {
    store[studentKey] = emptyStudentRecord(learningOutcomes);
  }
  return store[studentKey];
}

function countGradedUcs(record, ucs) {
  return ucs.filter((uc) => {
    const row = record.scores[uc.id] || {};
    return (
      parseScore(row.written) != null &&
      parseScore(row.demo) != null &&
      parseScore(row.interview) != null
    );
  }).length;
}

function renderProgressChart(student, ucs, record, passingAverage) {
  const container = document.getElementById("progress-chart-content");
  if (!container) return;

  if (!student) {
    container.innerHTML = '<p class="text-muted mb-0">Select a student to view progress chart</p>';
    return;
  }

  const rows = ucs.map((uc) => {
    const row = record.scores[uc.id] || {};
    const written = parseScore(row.written);
    const demo = parseScore(row.demo);
    const interview = parseScore(row.interview);
    const avg = computeAverage(written, demo, interview);
    const status = statusFromAverage(avg, passingAverage);
    const pct = avg != null ? Math.round(avg) : 0;
    const barClass =
      avg == null
        ? "trainer-progress-bar__fill--empty"
        : avg >= passingAverage
          ? "trainer-progress-bar__fill--competent"
          : "trainer-progress-bar__fill--nyc";

    return `
      <div class="trainer-progress-row">
        <div class="trainer-progress-row__head">
          <span class="trainer-progress-row__code">${escapeHtml(uc.code)}</span>
          <span class="trainer-progress-row__title">${escapeHtml(uc.title)}</span>
          <span class="trainer-grade-badge ${status.className}">${status.label}</span>
        </div>
        <div class="trainer-progress-bar" role="presentation">
          <div class="trainer-progress-bar__fill ${barClass}" style="width: ${pct}%"></div>
        </div>
        <div class="trainer-progress-row__meta">
          <span>Avg: ${formatAverage(avg)}</span>
          <span>W: ${written ?? "—"} · D: ${demo ?? "—"} · I: ${interview ?? "—"}</span>
        </div>
      </div>
    `;
  });

  const graded = countGradedUcs(record, ucs);
  const competent = ucs.filter((uc) => {
    const row = record.scores[uc.id] || {};
    const avg = computeAverage(
      parseScore(row.written),
      parseScore(row.demo),
      parseScore(row.interview)
    );
    return avg != null && avg >= passingAverage;
  }).length;

  container.innerHTML = `
    <div class="trainer-progress-summary">
      <div>
        <p class="trainer-progress-summary__name">${escapeHtml(student.name)}</p>
        <p class="trainer-progress-summary__program">${escapeHtml(student.program)}</p>
      </div>
      <div class="trainer-progress-summary__stats">
        <span><strong>${graded}</strong> / ${ucs.length} UCs graded</span>
        <span><strong>${competent}</strong> Competent</span>
        <span><strong>${graded - competent}</strong> NYC</span>
      </div>
    </div>
    <div class="trainer-progress-list">${rows.join("")}</div>
  `;
}

function updateRowCalculations(rowEl, passingAverage) {
  const written = parseScore(rowEl.querySelector('[data-field="written"]')?.value);
  const demo = parseScore(rowEl.querySelector('[data-field="demo"]')?.value);
  const interview = parseScore(rowEl.querySelector('[data-field="interview"]')?.value);
  const avg = computeAverage(written, demo, interview);
  const status = statusFromAverage(avg, passingAverage);

  const avgEl = rowEl.querySelector("[data-average]");
  const badgeEl = rowEl.querySelector("[data-status]");
  if (avgEl) avgEl.textContent = formatAverage(avg);
  if (badgeEl) {
    badgeEl.textContent = status.label;
    badgeEl.className = `trainer-grade-badge ${status.className}`;
  }
}

function renderUcTable(ucs, record, passingAverage, onChange) {
  const container = document.getElementById("uc-grading-list");
  if (!container) return;

  const rows = ucs
    .map((uc) => {
      const saved = record.scores[uc.id] || {};
      const written = sanitizeScoreValue(saved.written ?? "");
      const demo = sanitizeScoreValue(saved.demo ?? "");
      const interview = sanitizeScoreValue(saved.interview ?? "");
      const avg = computeAverage(parseScore(written), parseScore(demo), parseScore(interview));
      const status = statusFromAverage(avg, passingAverage);

      return `
        <tr data-uc-id="${escapeHtml(uc.id)}">
          <td class="trainer-uc-cell">
            <span class="trainer-uc-cell__code">${escapeHtml(uc.code)}</span>
            <span class="trainer-uc-cell__title">${escapeHtml(uc.title)}</span>
          </td>
          <td>
            <input
              type="number"
              class="form-control form-control-sm trainer-score-input"
              min="0"
              max="100"
              step="1"
              inputmode="numeric"
              title="Score must be between 0 and 100"
              data-field="written"
              value="${written !== "" ? escapeHtml(String(written)) : ""}"
              placeholder="0–100"
              aria-label="${escapeHtml(uc.code)} written score"
            />
          </td>
          <td>
            <input
              type="number"
              class="form-control form-control-sm trainer-score-input"
              min="0"
              max="100"
              step="1"
              inputmode="numeric"
              title="Score must be between 0 and 100"
              data-field="demo"
              value="${demo !== "" ? escapeHtml(String(demo)) : ""}"
              placeholder="0–100"
              aria-label="${escapeHtml(uc.code)} demo score"
            />
          </td>
          <td>
            <input
              type="number"
              class="form-control form-control-sm trainer-score-input"
              min="0"
              max="100"
              step="1"
              inputmode="numeric"
              title="Score must be between 0 and 100"
              data-field="interview"
              value="${interview !== "" ? escapeHtml(String(interview)) : ""}"
              placeholder="0–100"
              aria-label="${escapeHtml(uc.code)} interview score"
            />
          </td>
          <td class="text-center fw-semibold" data-average>${formatAverage(avg)}</td>
          <td class="text-center">
            <span class="trainer-grade-badge ${status.className}" data-status>${status.label}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="trainer-grading-toolbar">
      <p class="trainer-grading-progress mb-0" id="grading-progress-text" aria-live="polite"></p>
    </div>
    <div class="table-responsive">
      <table class="table trainer-table trainer-grading-table mb-0">
        <thead>
          <tr>
            <th>Unit Competency</th>
            <th class="text-center">Written</th>
            <th class="text-center">Demo</th>
            <th class="text-center">Interview</th>
            <th class="text-center">Average</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("tbody tr").forEach((rowEl) => {
    rowEl.querySelectorAll(".trainer-score-input").forEach((input) => {
      enforceScoreInput(input);
      bindScoreInput(input, rowEl, passingAverage, onChange);
    });
  });
}

function renderLearningOutcomes(learningOutcomes, record, onChange) {
  const container = document.getElementById("learning-outcomes-list");
  if (!container) return;

  container.innerHTML = `
    <div class="trainer-learning-outcomes">
      ${learningOutcomes
        .map(
          (lo) => `
        <label class="trainer-learning-outcome">
          <input
            type="checkbox"
            data-lo-id="${escapeHtml(lo.id)}"
            ${record.learning_outcomes[lo.id] ? "checked" : ""}
          />
          <span>${escapeHtml(lo.label)}</span>
        </label>
      `
        )
        .join("")}
    </div>
  `;

  container.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", onChange);
  });
}

function syncNationalAssessment(record) {
  const resultEl = document.getElementById("national-assessment-result");
  const dateEl = document.getElementById("national-assessment-date");
  const retakeSection = document.getElementById("retake-section");
  if (resultEl) resultEl.value = record.national_assessment.result || "";
  if (dateEl) dateEl.value = record.national_assessment.date || "";
  if (retakeSection) {
    retakeSection.classList.toggle("hidden", record.national_assessment.result !== "failed");
  }
}

function collectScoresFromTable(ucs) {
  const scores = {};
  ucs.forEach((uc) => {
    const rowEl = document.querySelector(`tr[data-uc-id="${uc.id}"]`);
    if (!rowEl) return;
    scores[uc.id] = {
      written: parseScore(rowEl.querySelector('[data-field="written"]')?.value),
      demo: parseScore(rowEl.querySelector('[data-field="demo"]')?.value),
      interview: parseScore(rowEl.querySelector('[data-field="interview"]')?.value),
    };
  });
  return scores;
}

function collectLearningOutcomes(learningOutcomes) {
  const result = {};
  learningOutcomes.forEach((lo) => {
    const input = document.querySelector(`input[data-lo-id="${lo.id}"]`);
    result[lo.id] = Boolean(input?.checked);
  });
  return result;
}

function updateProgressText(ucs, record) {
  const el = document.getElementById("grading-progress-text");
  if (!el) return;
  const graded = countGradedUcs(record, ucs);
  el.textContent = `${graded} of ${ucs.length} unit competencies graded`;
}

function showToast(message, isError = false) {
  let toast = document.getElementById("grading-save-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "grading-save-toast";
    toast.className = "trainer-grading-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle("trainer-grading-toast--error", isError);
  toast.classList.add("trainer-grading-toast--visible");
  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(() => {
    toast.classList.remove("trainer-grading-toast--visible");
  }, 2800);
}

function buildSavePayload(activeStudent, activeUcs, learningOutcomes, resultEl, dateEl) {
  return {
    student_key: activeStudent.key,
    student_name: activeStudent.name,
    program: activeStudent.program,
    scores: collectScoresFromTable(activeUcs),
    learning_outcomes: collectLearningOutcomes(learningOutcomes),
    national_assessment: {
      result: resultEl?.value || "",
      date: dateEl?.value || "",
    },
  };
}

function validateBeforeSave(activeUcs, payload) {
  document.querySelectorAll(".trainer-score-input").forEach(enforceScoreInput);
  if (hasInvalidScoreInputs()) {
    showToast("Each score must be a number from 0 to 100.", true);
    return false;
  }
  return true;
}

function showSaveConfirmModal(activeStudent) {
  const modalEl = document.getElementById("gradingSaveConfirmModal");
  if (!modalEl || typeof bootstrap === "undefined") {
    return null;
  }

  const nameEl = document.getElementById("grading-save-student-name");
  const programEl = document.getElementById("grading-save-student-program");
  const errorEl = document.getElementById("grading-save-modal-error");

  if (nameEl) nameEl.textContent = activeStudent.name;
  if (programEl) programEl.textContent = activeStudent.program;
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }

  return bootstrap.Modal.getOrCreateInstance(modalEl);
}

async function saveGradesToDatabase(saveUrl, payload) {
  const response = await fetch(saveUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
      "X-Requested-With": "XMLHttpRequest",
    },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });

  let result = {};
  try {
    result = await response.json();
  } catch {
    result = { ok: false, message: "Unexpected server response." };
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(result.message || "Could not save grades. Please try again.");
  }

  return result;
}

function initGradingPage() {
  const config = readConfig();
  if (!config) return;

  const selectEl = document.getElementById("grading-student-select");
  const containerEl = document.getElementById("grading-container");
  const saveBtn = document.getElementById("saveGradesBtn");
  const resultEl = document.getElementById("national-assessment-result");
  const dateEl = document.getElementById("national-assessment-date");
  const retakeSection = document.getElementById("retake-section");
  const retakeBtn = document.getElementById("scheduleRetakeBtn");

  const { students, competencies_by_program: competenciesByProgram, learning_outcomes: learningOutcomes, passing_average: passingAverage, save_url: saveUrl, records_url: recordsUrl } =
    config;

  const gradeStore = mergeDemoSeed(loadSavedGrades(), students);
  let activeStudent = null;
  let activeUcs = [];
  let pendingSavePayload = null;

  const confirmModal = document.getElementById("gradingSaveConfirmModal");
  const confirmBtn = document.getElementById("gradingSaveConfirmBtn");
  const modalErrorEl = document.getElementById("grading-save-modal-error");

  students.forEach((student) => {
    const option = document.createElement("option");
    option.value = student.key;
    option.textContent = `${student.name} — ${student.program}`;
    selectEl?.appendChild(option);
  });

  function persistCurrentStudent() {
    if (!activeStudent) return;
    const record = getStudentRecord(gradeStore, activeStudent.key, learningOutcomes);
    record.scores = collectScoresFromTable(activeUcs);
    record.learning_outcomes = collectLearningOutcomes(learningOutcomes);
    record.national_assessment = {
      result: resultEl?.value || "",
      date: dateEl?.value || "",
    };
    saveAllGrades(gradeStore);
    updateProgressText(activeUcs, record);
    renderProgressChart(activeStudent, activeUcs, record, passingAverage);
  }

  function loadStudent(studentKey) {
    activeStudent = students.find((s) => s.key === studentKey) || null;
    if (!activeStudent) {
      containerEl?.classList.add("hidden");
      renderProgressChart(null, [], {}, passingAverage);
      return;
    }

    activeUcs = competenciesByProgram[activeStudent.program] || [];
    const record = getStudentRecord(gradeStore, activeStudent.key, learningOutcomes);

    containerEl?.classList.remove("hidden");
    renderUcTable(activeUcs, record, passingAverage, persistCurrentStudent);
    renderLearningOutcomes(learningOutcomes, record, persistCurrentStudent);
    syncNationalAssessment(record);
    updateProgressText(activeUcs, record);
    renderProgressChart(activeStudent, activeUcs, record, passingAverage);
  }

  selectEl?.addEventListener("change", () => {
    loadStudent(selectEl.value);
  });

  resultEl?.addEventListener("change", () => {
    retakeSection?.classList.toggle("hidden", resultEl.value !== "failed");
    persistCurrentStudent();
  });
  dateEl?.addEventListener("change", persistCurrentStudent);

  retakeBtn?.addEventListener("click", () => {
    showToast("Retake scheduling will be available in a future update.");
  });

  saveBtn?.addEventListener("click", () => {
    if (!activeStudent) {
      showToast("Select a student first.", true);
      return;
    }

    const payload = buildSavePayload(
      activeStudent,
      activeUcs,
      learningOutcomes,
      resultEl,
      dateEl
    );

    if (!validateBeforeSave(activeUcs, payload)) {
      return;
    }

    pendingSavePayload = payload;
    const modal = showSaveConfirmModal(activeStudent);
    if (modal) {
      modal.show();
      return;
    }

    showToast("Save confirmation is unavailable.", true);
  });

  confirmBtn?.addEventListener("click", async () => {
    if (!pendingSavePayload || !saveUrl) {
      showToast("Unable to save grades right now.", true);
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    if (modalErrorEl) {
      modalErrorEl.textContent = "";
      modalErrorEl.classList.add("hidden");
    }

    try {
      const result = await saveGradesToDatabase(saveUrl, pendingSavePayload);
      const record = getStudentRecord(
        gradeStore,
        activeStudent.key,
        learningOutcomes
      );
      record.scores = pendingSavePayload.scores;
      record.learning_outcomes = pendingSavePayload.learning_outcomes;
      record.national_assessment = pendingSavePayload.national_assessment;
      saveAllGrades(gradeStore);
      updateProgressText(activeUcs, record);
      renderProgressChart(activeStudent, activeUcs, record, passingAverage);

      if (confirmModal && typeof bootstrap !== "undefined") {
        bootstrap.Modal.getOrCreateInstance(confirmModal).hide();
      }

      const incomplete = activeUcs.some((uc) => {
        const row = record.scores[uc.id] || {};
        return (
          parseScore(row.written) == null ||
          parseScore(row.demo) == null ||
          parseScore(row.interview) == null
        );
      });

      if (incomplete) {
        showToast(`${result.message} Some UCs still have missing scores.`);
      } else {
        showToast(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save grades.";
      if (modalErrorEl) {
        modalErrorEl.textContent = message;
        modalErrorEl.classList.remove("hidden");
      } else {
        showToast(message, true);
      }
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Yes, save grades";
    }
  });

  confirmModal?.addEventListener("hidden.bs.modal", () => {
    pendingSavePayload = null;
    if (modalErrorEl) {
      modalErrorEl.textContent = "";
      modalErrorEl.classList.add("hidden");
    }
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Yes, save grades";
    }
  });

  document.getElementById("printProgressChartBtn")?.addEventListener("click", () => {
    if (!activeStudent) {
      showToast("Select a student to print the progress chart.", true);
      return;
    }
    window.print();
  });

  async function bootstrapGrading() {
    if (recordsUrl) {
      try {
        const response = await fetch(recordsUrl, {
          headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
        });
        const payload = await response.json();
        if (response.ok && payload.ok && Array.isArray(payload.records)) {
          payload.records.forEach((record) => {
            gradeStore[record.student_key] = {
              scores: record.scores || {},
              learning_outcomes: {
                ...Object.fromEntries(learningOutcomes.map((lo) => [lo.id, false])),
                ...(record.learning_outcomes || {}),
              },
              national_assessment: record.national_assessment || { result: "", date: "" },
            };
          });
          saveAllGrades(gradeStore);
        }
      } catch {
        /* keep local/demo grades if server load fails */
      }
    }

    const params = new URLSearchParams(window.location.search);
    const preselect = params.get("student");
    if (preselect) {
      const match = students.find(
        (s) => s.key === preselect || s.name.toLowerCase() === preselect.toLowerCase()
      );
      if (match && selectEl) {
        selectEl.value = match.key;
        loadStudent(match.key);
        return;
      }
    }

    if (students.length === 1 && selectEl) {
      selectEl.value = students[0].key;
      loadStudent(students[0].key);
    }
  }

  bootstrapGrading();
}

initGradingPage();
