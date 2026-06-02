/**
 * Trainer — Record Sheets (institutional assessment, encodable LO, progress chart).
 */

import { getCsrfToken } from "./staff-settings-modal.js";

const INSTITUTIONAL_UC_KEY = "institutional";
const SCORE_MIN = 0;
const SCORE_MAX = 100;
const UC_ASSESSMENT_COLSPAN = 5;

function readConfig() {
  const el = document.getElementById("sheets-config");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "{}");
  } catch {
    return null;
  }
}

function getCourseGroups(config) {
  return config?.course_groups || [];
}

function findCourseGroup(config, program) {
  return getCourseGroups(config).find((group) => group.program === program);
}

function findBatchMeta(state) {
  const group = findCourseGroup(state.config, state.selection.program);
  return group?.batches?.find((batch) => String(batch.id) === String(state.selection.batchId));
}

function getActiveStudents(state) {
  const { students, selection } = state;
  const { program, batchId } = selection;
  return students.filter((student) => {
    if (program && student.program !== program) return false;
    if (batchId && String(student.batch_id) !== String(batchId)) return false;
    return true;
  });
}

function updatePageSubtitle(program, batchMeta) {
  const subtitle = document.getElementById("trainer-sheets-page-subtitle");
  if (!subtitle) return;
  if (!program) {
    subtitle.textContent = "Grading, assessment, and achievement tracking";
    return;
  }
  const batchPart = batchMeta?.label ? ` · ${batchMeta.label}` : "";
  const schedulePart = batchMeta?.schedule ? ` (${batchMeta.schedule})` : "";
  subtitle.textContent = `Grading, assessment, and achievement tracking — ${program}${batchPart}${schedulePart}`;
}

function renderClassPicker(state, handlers) {
  const picker = document.getElementById("trainer-sheets-class-picker");
  const courseSelect = document.getElementById("trainer-sheets-course-select");
  const batchSelect = document.getElementById("trainer-sheets-batch-select");
  const metaEl = document.getElementById("trainer-sheets-class-meta");
  const groups = getCourseGroups(state.config);
  if (!picker || !courseSelect || !batchSelect) return;

  if (!groups.length) {
    picker.hidden = true;
    return;
  }
  picker.hidden = false;

  const { program, batchId } = state.selection;
  courseSelect.innerHTML = groups
    .map(
      (group) => `
        <option value="${escapeHtml(group.program)}"${group.program === program ? " selected" : ""}>
          ${escapeHtml(group.program)}
        </option>
      `,
    )
    .join("");

  const activeGroup = findCourseGroup(state.config, program) || groups[0];
  const batches = activeGroup?.batches || [];
  batchSelect.innerHTML = batches
    .map((batch) => {
      const count = batch.student_count ?? 0;
      const label = `${batch.label} (${count} student${count === 1 ? "" : "s"})`;
      return `
        <option value="${escapeHtml(batch.id)}"${String(batch.id) === String(batchId) ? " selected" : ""}>
          ${escapeHtml(label)}
        </option>
      `;
    })
    .join("");

  courseSelect.value = program;
  const matchedBatch = batches.find((batch) => String(batch.id) === String(batchId));
  batchSelect.value = matchedBatch
    ? String(matchedBatch.id)
    : String(batches[0]?.id || "");

  batchSelect.disabled = batches.length <= 1;

  const activeBatch = findBatchMeta(state);
  if (metaEl) {
    const count = state.activeStudents.length;
    metaEl.textContent = activeBatch
      ? `${count} student${count === 1 ? "" : "s"} · ${activeBatch.schedule || "Schedule TBA"}`
      : `${count} student${count === 1 ? "" : "s"}`;
  }

  if (!courseSelect.dataset.bound) {
    courseSelect.dataset.bound = "1";
    courseSelect.addEventListener("change", () => {
      handlers.onCourseSelect(courseSelect.value);
    });
    batchSelect.addEventListener("change", () => {
      handlers.onBatchSelect(batchSelect.value);
    });
  }
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseScore(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(num)));
  return clamped;
}

function computeAverage(written, demo, interview) {
  const scores = [written, demo, interview].filter((s) => s != null);
  if (scores.length !== 3) return null;
  return scores.reduce((sum, s) => sum + s, 0) / 3;
}

function resultFromAverage(avg) {
  if (avg == null) {
    return { label: "Incomplete", className: "trainer-result-badge--incomplete", key: "incomplete" };
  }
  if (avg >= 75) {
    return { label: "Competent", className: "trainer-result-badge--competent", key: "competent" };
  }
  if (avg >= 1) {
    return { label: "Failed", className: "trainer-result-badge--failed", key: "failed" };
  }
  return { label: "Incomplete", className: "trainer-result-badge--incomplete", key: "incomplete" };
}

function splitNameParts(student) {
  const first = (student.first_name || "").trim();
  const middle = (student.middle_name || "").trim();
  const last = (student.last_name || "").trim();
  if (first || last) {
    return { first, middle, last };
  }
  const parts = (student.name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "—", middle: "", last: "" };
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  if (parts.length === 2) return { first: parts[0], middle: "", last: parts[1] };
  return {
    first: parts[0],
    middle: parts.slice(1, -1).join(" "),
    last: parts[parts.length - 1],
  };
}

function getInstitutionalScores(record) {
  const row = record?.scores?.[INSTITUTIONAL_UC_KEY];
  if (row) return row;
  const scores = record?.scores || {};
  const firstUc = Object.keys(scores)[0];
  return firstUc ? scores[firstUc] : { written: null, demo: null, interview: null };
}

function getRecordSheetStructure(config, program) {
  const key = program || config.primary_program || "";
  return config.record_sheet_by_program?.[key] || [];
}

function flattenRecordSheetUnits(structure) {
  const units = [];
  (structure || []).forEach((category) => {
    (category.units || []).forEach((unit) => {
      units.push({ ...unit, category_label: category.label || "" });
    });
  });
  return units;
}

function getUcScores(record, ucId) {
  const row = record?.scores?.[ucId];
  if (row) {
    return {
      written: row.written ?? null,
      demo: row.demo ?? null,
      interview: row.interview ?? null,
    };
  }
  return { written: null, demo: null, interview: null };
}

function computeOverallRecordResult(record, units) {
  const averages = units
    .map((unit) => {
      const scores = getUcScores(record, unit.id);
      return computeAverage(
        parseScore(scores.written),
        parseScore(scores.demo),
        parseScore(scores.interview)
      );
    })
    .filter((avg) => avg != null);

  if (!averages.length) {
    return { avg: null, result: resultFromAverage(null) };
  }
  const overall = averages.reduce((sum, value) => sum + value, 0) / averages.length;
  return { avg: overall, result: resultFromAverage(overall) };
}

function computeUcResultFromScores(scores) {
  const avg = computeAverage(
    parseScore(scores?.written),
    parseScore(scores?.demo),
    parseScore(scores?.interview)
  );
  return { avg, result: resultFromAverage(avg) };
}

function renderUcSummaryCells(unit, scores) {
  const { avg, result } = computeUcResultFromScores(scores);
  return `
    <td class="text-center trainer-record-uc-average" data-uc-avg="${escapeHtml(unit.id)}">${avg == null ? "—" : avg.toFixed(1)}</td>
    <td class="text-center trainer-record-uc-result" data-uc-result="${escapeHtml(unit.id)}">
      <span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>
    </td>
  `;
}

function updateUcSummaryCells(rowEl, unit) {
  const scores = {
    written: parseScore(rowEl.querySelector(`[data-uc-id="${unit.id}"][data-field="written"]`)?.value),
    demo: parseScore(rowEl.querySelector(`[data-uc-id="${unit.id}"][data-field="demo"]`)?.value),
    interview: parseScore(rowEl.querySelector(`[data-uc-id="${unit.id}"][data-field="interview"]`)?.value),
  };
  const { avg, result } = computeUcResultFromScores(scores);
  const avgEl = rowEl.querySelector(`[data-uc-avg="${unit.id}"]`);
  const resultEl = rowEl.querySelector(`[data-uc-result="${unit.id}"]`);
  if (avgEl) avgEl.textContent = avg == null ? "—" : avg.toFixed(1);
  if (resultEl) {
    resultEl.innerHTML = `<span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>`;
  }
}

function renderScoreInput(student, unit, field, value, className) {
  const display =
    value !== "" && value != null ? escapeHtml(value) : "";
  return `
    <input
      type="number"
      min="0"
      max="100"
      step="1"
      inputmode="numeric"
      class="form-control form-control-sm trainer-score-input ${className || ""}"
      data-uc-id="${escapeHtml(unit.id)}"
      data-field="${field}"
      value="${display}"
      aria-label="${escapeHtml(field)} score for ${escapeHtml(student.name)} — ${escapeHtml(unit.title)}"
    />
  `;
}

function emptyRecord(learningOutcomes) {
  return {
    scores: {},
    learning_outcomes: Object.fromEntries(
      (learningOutcomes || []).map((lo) => [lo.id, false])
    ),
    national_assessment: { result: "", date: "" },
  };
}

function mergeRecord(existing, learningOutcomes) {
  const base = emptyRecord(learningOutcomes);
  if (!existing) return base;
  const national = { ...base.national_assessment, ...(existing.national_assessment || {}) };
  return {
    scores: { ...base.scores, ...(existing.scores || {}) },
    learning_outcomes: { ...base.learning_outcomes, ...(existing.learning_outcomes || {}) },
    national_assessment: national,
    remarks: existing.remarks ?? national.remarks ?? "",
  };
}

function getEncodableStructure(student, config) {
  const program = student?.program || "";
  return config.encodable_by_program?.[program] || [];
}

function getEncodableSheetStructure(config, program) {
  const key = program || config.primary_program || "";
  return config.encodable_by_program?.[key] || [];
}

function unitLoCount(unit) {
  const count = (unit.learning_outcomes || []).length;
  return count > 0 ? count : 1;
}

function categoryLoCount(category) {
  return (category.units || []).reduce((sum, unit) => sum + unitLoCount(unit), 0);
}

function flattenEncodableUnits(categories) {
  const units = [];
  (categories || []).forEach((category) => {
    (category.units || []).forEach((unit) => {
      units.push({ ...unit, category_label: category.label || "" });
    });
  });
  return units;
}

function getNonEncodableStructure(config, program) {
  const key = program || config.primary_program || "";
  return config.non_encodable_by_program?.[key] || [];
}

function learningOutcomeDefsForStudent(student, config) {
  const structure = getEncodableStructure(student, config);
  const los = [];
  const seen = new Set();
  structure.forEach((category) => {
    (category.units || []).forEach((unit) => {
      (unit.learning_outcomes || []).forEach((lo) => {
        if (seen.has(lo.id)) return;
        seen.add(lo.id);
        los.push(lo);
      });
    });
  });
  return los.length ? los : config.learning_outcomes || [];
}

function formatStudentEncodableName(student, index) {
  const { first, middle, last } = splitNameParts(student);
  const firstMiddle = [first, middle].filter(Boolean).join(" ");
  const lastUpper = (last || "—").toUpperCase();
  if (firstMiddle) {
    return `${index + 1}. ${lastUpper}, ${firstMiddle.toUpperCase()}`;
  }
  return `${index + 1}. ${(student.name || "—").toUpperCase()}`;
}

function formatRecordNameUpper(value) {
  return String(value ?? "—").trim().toUpperCase() || "—";
}

function unitLoProgress(record, unit) {
  const los = unit.learning_outcomes || [];
  if (!los.length) return { checked: 0, total: 0, percent: 0 };
  const checked = los.filter((lo) => record.learning_outcomes[lo.id]).length;
  return {
    checked,
    total: los.length,
    percent: Math.round((checked / los.length) * 100),
  };
}

function studentLoProgress(record, structure) {
  let checked = 0;
  let total = 0;
  structure.forEach((category) => {
    (category.units || []).forEach((unit) => {
      const progress = unitLoProgress(record, unit);
      checked += progress.checked;
      total += progress.total;
    });
  });
  return {
    checked,
    total,
    percent: total ? Math.round((checked / total) * 100) : 0,
  };
}

function encodableStatusKey(progress) {
  if (progress.total === 0 || progress.checked === 0) return "not-started";
  if (progress.checked >= progress.total) return "complete";
  return "in-progress";
}

function renderUnitCard(student, unit, record) {
  const progress = unitLoProgress(record, unit);
  const loItems = (unit.learning_outcomes || [])
    .map(
      (lo) => `
        <label class="trainer-encodable-lo">
          <input
            type="checkbox"
            class="form-check-input"
            data-lo-id="${escapeHtml(lo.id)}"
            ${record.learning_outcomes[lo.id] ? "checked" : ""}
          />
          <span>${escapeHtml(lo.label)}</span>
        </label>
      `
    )
    .join("");

  return `
    <article class="trainer-encodable-unit-card" data-unit-id="${escapeHtml(unit.id)}">
      <div class="trainer-encodable-unit-card__head">
        <h4 class="trainer-encodable-unit-card__title">${escapeHtml(unit.title)}</h4>
        <span class="trainer-encodable-unit-card__pct">${progress.percent}%</span>
      </div>
      <div class="trainer-encodable-unit-card__bar" role="presentation">
        <span class="trainer-encodable-unit-card__bar-fill" style="width: ${progress.percent}%"></span>
      </div>
      <div class="trainer-encodable-unit-card__los">${loItems}</div>
    </article>
  `;
}

function renderStudentEncodableCard(student, index, record, structure) {
  const progress = studentLoProgress(record, structure);
  const categoriesHtml = structure
    .map((category) => {
      const unitsHtml = (category.units || [])
        .map((unit) => renderUnitCard(student, unit, record))
        .join("");
      return `
        <section class="trainer-encodable-category">
          <h3 class="trainer-encodable-category__title">
            <span class="trainer-encodable-category__dot" aria-hidden="true"></span>
            ${escapeHtml(category.label)}
          </h3>
          <div class="trainer-encodable-unit-grid">${unitsHtml}</div>
        </section>
      `;
    })
    .join("");

  return `
    <article
      class="trainer-encodable-student-card"
      data-student-key="${escapeHtml(student.key)}"
      data-status="${encodableStatusKey(progress)}"
    >
      <button
        type="button"
        class="trainer-encodable-student-card__toggle"
        aria-expanded="false"
        aria-controls="encodable-body-${escapeHtml(student.key)}"
      >
        <span class="trainer-encodable-student-card__name">${escapeHtml(formatStudentEncodableName(student, index))}</span>
        <span class="trainer-encodable-student-card__meta">
          <span class="trainer-encodable-student-card__count" data-lo-count>${progress.checked}/${progress.total} LOs</span>
          <span class="trainer-encodable-student-card__pct" data-lo-pct>${progress.percent}%</span>
          <i class="bi bi-chevron-down trainer-encodable-student-card__chevron" aria-hidden="true"></i>
        </span>
      </button>
      <div class="trainer-encodable-student-card__bar" role="presentation">
        <span class="trainer-encodable-student-card__bar-fill" data-lo-bar style="width: ${progress.percent}%"></span>
      </div>
      <div
        class="trainer-encodable-student-card__body hidden"
        id="encodable-body-${escapeHtml(student.key)}"
        hidden
      >
        ${categoriesHtml || `<p class="text-muted small mb-0">No competencies configured for this program.</p>`}
      </div>
    </article>
  `;
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
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(num)));
  if (input.value !== String(clamped)) {
    input.value = String(clamped);
  }
  input.classList.remove("trainer-score-input--invalid");
  input.setCustomValidity("");
}

function showToast(message, isError = false) {
  let toast = document.getElementById("trainer-sheets-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "trainer-sheets-toast";
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

async function fetchRecords(recordsUrl) {
  const response = await fetch(recordsUrl, {
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    credentials: "same-origin",
  });
  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.message || "Could not load record sheets.");
  }
  return payload.records || [];
}

async function saveRecord(saveUrl, student, record) {
  const payload = {
    student_key: student.key,
    student_name: student.name,
    program: student.program,
    scores: record.scores || {},
    learning_outcomes: record.learning_outcomes || {},
    national_assessment: {
      ...(record.national_assessment || { result: "", date: "" }),
      remarks: record.remarks || record.national_assessment?.remarks || "",
    },
  };

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
    throw new Error(result.message || "Could not save scores.");
  }
  return result;
}

function updateRowResult(rowEl, units) {
  const unitList = units || [];
  let written = null;
  let demo = null;
  let interview = null;

  if (unitList.length) {
    unitList.forEach((unit) => updateUcSummaryCells(rowEl, unit));

    const overall = computeOverallRecordResult(
      { scores: collectRowScores(rowEl) },
      unitList
    );
    const avg = overall.avg;
    const result = overall.result;

    const avgEl = rowEl.querySelector("[data-average]");
    if (avgEl) avgEl.textContent = avg == null ? "—" : avg.toFixed(1);

    const resultEl = rowEl.querySelector("[data-result]");
    if (resultEl) {
      resultEl.innerHTML = `<span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>`;
    }

    const retakeBtn = rowEl.querySelector("[data-retake-btn]");
    if (retakeBtn) {
      retakeBtn.classList.toggle("hidden", result.key !== "failed");
    }

    rowEl.dataset.resultKey = result.key;
    return;
  }

  written = parseScore(rowEl.querySelector('[data-field="written"]')?.value);
  demo = parseScore(rowEl.querySelector('[data-field="demo"]')?.value);
  interview = parseScore(rowEl.querySelector('[data-field="interview"]')?.value);
  const avg = computeAverage(written, demo, interview);
  const result = resultFromAverage(avg);

  const avgEl = rowEl.querySelector("[data-average]");
  if (avgEl) avgEl.textContent = avg == null ? "—" : avg.toFixed(1);

  const resultEl = rowEl.querySelector("[data-result]");
  if (resultEl) {
    resultEl.innerHTML = `<span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>`;
    resultEl.dataset.resultKey = result.key;
  }

  const retakeBtn = rowEl.querySelector("[data-retake-btn]");
  if (retakeBtn) {
    retakeBtn.classList.toggle("hidden", result.key !== "failed");
  }

  rowEl.dataset.resultKey = result.key;
}

function collectRowScores(rowEl) {
  const scores = {};
  rowEl.querySelectorAll("[data-uc-id][data-field]").forEach((input) => {
    const ucId = input.dataset.ucId;
    const field = input.dataset.field;
    if (!ucId || !field) return;
    if (!scores[ucId]) scores[ucId] = {};
    scores[ucId][field] = parseScore(input.value);
  });

  if (Object.keys(scores).length) {
    return scores;
  }

  return {
    [INSTITUTIONAL_UC_KEY]: {
      written: parseScore(rowEl.querySelector('[data-field="written"]')?.value),
      demo: parseScore(rowEl.querySelector('[data-field="demo"]')?.value),
      interview: parseScore(rowEl.querySelector('[data-field="interview"]')?.value),
    },
  };
}

function renderRecordSheetTable(state, filters) {
  const { activeStudents, gradeStore, config } = state;
  const students = activeStudents;
  const { query, status } = filters;
  const programLabel = config.primary_program || students[0]?.program || "";
  const sheetStructure = getRecordSheetStructure(config, programLabel);
  const units = flattenRecordSheetUnits(sheetStructure);
  const useExcelLayout = units.length > 0;

  const labelEl = document.getElementById("record-sheet-program-label");
  if (labelEl && programLabel) {
    labelEl.textContent = useExcelLayout
      ? `TESDA Rating Sheet — Written / Demonstration / Interview per Unit of Competency — ${programLabel}`
      : `Institutional Assessment — Written Score / Demonstration / Interview — ${programLabel}`;
  }

  const filtered = students.filter((student) => {
    const names = splitNameParts(student);
    const haystack = `${names.first} ${names.middle} ${names.last} ${student.name}`.toLowerCase();
    const record = mergeRecord(gradeStore[student.key], config.learning_outcomes);
    const overall = useExcelLayout
      ? computeOverallRecordResult(record, units)
      : { result: resultFromAverage(computeAverage(
          parseScore(getInstitutionalScores(record).written),
          parseScore(getInstitutionalScores(record).demo),
          parseScore(getInstitutionalScores(record).interview)
        )) };
    const resultKey = overall.result.key;
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !status || resultKey === status;
    return matchesQuery && matchesStatus;
  });

  if (!students.length) {
    return `<p class="trainer-schedule-empty mb-0" role="status">No assigned students yet.</p>`;
  }
  if (!filtered.length) {
    return `<p class="trainer-schedule-empty mb-0" role="status">No students match your filters.</p>`;
  }

  if (!useExcelLayout) {
    return renderSimpleRecordSheetTable(filtered, gradeStore, config);
  }

  const categoryHeaderCells = sheetStructure
    .map((category) => {
      const count = (category.units || []).length;
      if (!count) return "";
      return `
        <th colspan="${count * UC_ASSESSMENT_COLSPAN}" class="trainer-record-category-head text-center">
          ${escapeHtml(category.label)}
        </th>
      `;
    })
    .join("");

  const unitHeaderCells = units
    .map(
      (unit) => `
        <th colspan="${UC_ASSESSMENT_COLSPAN}" class="trainer-record-page-head text-center">
          <span class="trainer-record-page-head__title">${escapeHtml(unit.title)}</span>
        </th>
      `
    )
    .join("");

  const subHeaderCells = units
    .map(
      () => `
        <th class="text-center trainer-record-assessment-sub trainer-record-assessment-sub--written">Written</th>
        <th class="text-center trainer-record-assessment-sub trainer-record-assessment-sub--demo">Demo</th>
        <th class="text-center trainer-record-assessment-sub trainer-record-assessment-sub--interview">Interview</th>
        <th class="text-center trainer-record-assessment-sub trainer-record-assessment-sub--average">Grade Average</th>
        <th class="text-center trainer-record-assessment-sub trainer-record-assessment-sub--result">Result</th>
      `
    )
    .join("");

  const rows = filtered
    .map((student, rowIndex) => {
      const names = splitNameParts(student);
      const record = mergeRecord(gradeStore[student.key], config.learning_outcomes);
      const overall = computeOverallRecordResult(record, units);
      const remarks = record.remarks || "";

      const scoreCells = units
        .map((unit) => {
          const scores = getUcScores(record, unit.id);
          return `
            <td class="text-center">${renderScoreInput(student, unit, "written", scores.written, "trainer-score-input--written")}</td>
            <td class="text-center">${renderScoreInput(student, unit, "demo", scores.demo, "trainer-score-input--demo")}</td>
            <td class="text-center">${renderScoreInput(student, unit, "interview", scores.interview, "trainer-score-input--interview")}</td>
            ${renderUcSummaryCells(unit, scores)}
          `;
        })
        .join("");

      return `
        <tr data-student-key="${escapeHtml(student.key)}" data-result-key="${overall.result.key}">
          <td class="text-center trainer-record-sticky trainer-record-sticky--no">${rowIndex + 1}</td>
          <td class="trainer-record-name trainer-record-sticky trainer-record-sticky--last">${escapeHtml(formatRecordNameUpper(names.last))}</td>
          <td class="trainer-record-name trainer-record-sticky trainer-record-sticky--first">${escapeHtml(formatRecordNameUpper(names.first))}</td>
          <td class="trainer-record-name trainer-record-sticky trainer-record-sticky--middle">${escapeHtml(formatRecordNameUpper(names.middle || ""))}</td>
          ${scoreCells}
          <td class="text-center trainer-record-average" data-average>${overall.avg == null ? "—" : overall.avg.toFixed(1)}</td>
          <td class="text-center" data-result>
            <span class="trainer-result-badge ${overall.result.className}">${escapeHtml(overall.result.label)}</span>
          </td>
          <td class="text-center">
            <button type="button" class="btn btn-sm trainer-btn-retake${overall.result.key === "failed" ? "" : " hidden"}" data-retake-btn>
              <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
              Retake
            </button>
          </td>
          <td class="trainer-record-remarks-col">
            <input type="text" class="form-control form-control-sm trainer-record-remarks-input" data-remarks placeholder="Add remarks..." value="${escapeHtml(remarks)}" aria-label="Remarks for ${escapeHtml(student.name)}" />
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="trainer-record-sheet-scroll">
      <table class="table trainer-table trainer-record-sheet-table trainer-record-sheet-table--excel mb-0" id="record-sheet-table">
        <thead>
          <tr>
            <th rowspan="3" class="text-center trainer-record-sticky trainer-record-sticky--no">No.</th>
            <th rowspan="3" class="trainer-record-sticky trainer-record-sticky--last">Last Name</th>
            <th rowspan="3" class="trainer-record-sticky trainer-record-sticky--first">First Name</th>
            <th rowspan="3" class="trainer-record-sticky trainer-record-sticky--middle">Middle Name</th>
            ${categoryHeaderCells}
            <th rowspan="3" class="text-center">Average</th>
            <th rowspan="3" class="text-center">Result</th>
            <th rowspan="3" class="text-center">Retake</th>
            <th rowspan="3" class="trainer-record-remarks-col">Remarks</th>
          </tr>
          <tr>${unitHeaderCells}</tr>
          <tr>${subHeaderCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderSimpleRecordSheetTable(filtered, gradeStore, config) {
  const rows = filtered
    .map((student, rowIndex) => {
      const names = splitNameParts(student);
      const record = mergeRecord(gradeStore[student.key], config.learning_outcomes);
      const scores = getInstitutionalScores(record);
      const written = scores.written ?? "";
      const demoScore = scores.demo ?? "";
      const interview = scores.interview ?? "";
      const avg = computeAverage(parseScore(written), parseScore(demoScore), parseScore(interview));
      const result = resultFromAverage(avg);
      const remarks = record.remarks || "";

      return `
        <tr data-student-key="${escapeHtml(student.key)}" data-result-key="${result.key}">
          <td class="text-center">${rowIndex + 1}</td>
          <td class="trainer-record-name">${escapeHtml(formatRecordNameUpper(names.last))}</td>
          <td class="trainer-record-name">${escapeHtml(formatRecordNameUpper(names.first))}</td>
          <td class="trainer-record-name">${escapeHtml(formatRecordNameUpper(names.middle || ""))}</td>
          <td class="text-center">
            <input type="number" min="0" max="100" step="1" inputmode="numeric" class="form-control form-control-sm trainer-score-input trainer-score-input--written" data-uc-id="${INSTITUTIONAL_UC_KEY}" data-field="written" value="${written !== "" && written != null ? escapeHtml(written) : ""}" aria-label="Written score for ${escapeHtml(student.name)}" />
          </td>
          <td class="text-center">
            <input type="number" min="0" max="100" step="1" inputmode="numeric" class="form-control form-control-sm trainer-score-input trainer-score-input--demo" data-uc-id="${INSTITUTIONAL_UC_KEY}" data-field="demo" value="${demoScore !== "" && demoScore != null ? escapeHtml(demoScore) : ""}" aria-label="Demonstration score for ${escapeHtml(student.name)}" />
          </td>
          <td class="text-center">
            <input type="number" min="0" max="100" step="1" inputmode="numeric" class="form-control form-control-sm trainer-score-input trainer-score-input--interview" data-uc-id="${INSTITUTIONAL_UC_KEY}" data-field="interview" value="${interview !== "" && interview != null ? escapeHtml(interview) : ""}" aria-label="Interview score for ${escapeHtml(student.name)}" />
          </td>
          <td class="text-center trainer-record-average" data-average>${avg == null ? "—" : avg.toFixed(1)}</td>
          <td class="text-center" data-result>
            <span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>
          </td>
          <td class="text-center">
            <button type="button" class="btn btn-sm trainer-btn-retake${result.key === "failed" ? "" : " hidden"}" data-retake-btn>
              <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
              Retake
            </button>
          </td>
          <td>
            <input type="text" class="form-control form-control-sm trainer-record-remarks-input" data-remarks placeholder="Add remarks..." value="${escapeHtml(remarks)}" aria-label="Remarks for ${escapeHtml(student.name)}" />
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="table-responsive">
      <table class="table trainer-table trainer-record-sheet-table mb-0" id="record-sheet-table">
        <thead>
          <tr>
            <th rowspan="2" class="text-center">No.</th>
            <th rowspan="2">Last Name</th>
            <th rowspan="2">First Name</th>
            <th rowspan="2">Middle Name</th>
            <th colspan="3" class="text-center trainer-record-assessment-head">Institutional Assessment</th>
            <th rowspan="2" class="text-center">Average</th>
            <th rowspan="2" class="text-center">Result</th>
            <th rowspan="2" class="text-center">Retake</th>
            <th rowspan="2">Remarks</th>
          </tr>
          <tr>
            <th class="text-center trainer-record-assessment-sub">Written Score</th>
            <th class="text-center trainer-record-assessment-sub">Demonstration</th>
            <th class="text-center trainer-record-assessment-sub">Interview</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function encodableResultFromUc(record, unit) {
  const row = record.scores?.[unit.id];
  if (!hasUcScoreRow(row)) {
    return { label: "—", className: "trainer-result-badge--empty", key: "incomplete" };
  }
  const result = competencyStatusForUnit(record, unit);
  if (result.key === "competent") {
    return { label: "Competent", className: "trainer-result-badge--competent", key: "competent" };
  }
  return { label: "Incompetent", className: "trainer-result-badge--incompetent", key: "incompetent" };
}

function renderEncodableStatusCell(result) {
  if (result.key === "incomplete") {
    return `<td class="text-center trainer-encodable-status-cell">—</td>`;
  }
  return `
    <td class="text-center trainer-encodable-status-cell">
      <span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>
    </td>
  `;
}

function renderEncodableLoCells(record, unit) {
  const result = encodableResultFromUc(record, unit);
  const los = unit.learning_outcomes || [];
  if (!los.length) {
    return renderEncodableStatusCell(result);
  }
  return los.map(() => renderEncodableStatusCell(result)).join("");
}

function renderEncodableSheet(state, filters) {
  const { activeStudents, gradeStore, config } = state;
  const students = activeStudents;
  const { query, status } = filters;

  const programLabel = config.primary_program || students[0]?.program || "";
  const sheetStructure = getEncodableSheetStructure(config, programLabel);
  const allUnits = flattenEncodableUnits(sheetStructure);

  const filtered = students.filter((student, index) => {
    const names = splitNameParts(student);
    const haystack = `${formatStudentEncodableName(student, index)} ${names.first} ${names.last} ${student.name}`.toLowerCase();
    const record = mergeRecord(
      gradeStore[student.key],
      learningOutcomeDefsForStudent(student, config)
    );
    const unitResults = allUnits.map((unit) => encodableResultFromUc(record, unit));
    const hasIncomplete = unitResults.some((r) => r.key === "incomplete");
    const hasIncompetent = unitResults.some((r) => r.key === "incompetent");
    let statusKey = "complete";
    if (hasIncomplete) statusKey = "incomplete";
    else if (hasIncompetent) statusKey = "incompetent";
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !status || statusKey === status;
    return matchesQuery && matchesStatus;
  });

  if (!students.length) {
    return `<p class="trainer-schedule-empty mb-0">No assigned students yet.</p>`;
  }
  if (!allUnits.length) {
    return `<p class="trainer-schedule-empty mb-0">No competencies configured for this class.</p>`;
  }
  if (!filtered.length) {
    return `<p class="trainer-schedule-empty mb-0">No students match your filters.</p>`;
  }

  const categoryHeaderCells = sheetStructure
    .map((category) => {
      const count = categoryLoCount(category);
      if (!count) return "";
      return `
        <th colspan="${count}" class="trainer-encodable-category-head text-center">
          ${escapeHtml(category.label)}
        </th>
      `;
    })
    .join("");

  const unitHeaderCells = allUnits
    .map(
      (unit) => `
        <th colspan="${unitLoCount(unit)}" class="trainer-encodable-unit-head text-center">
          <span class="trainer-encodable-unit-head__title">${escapeHtml(unit.title || "")}</span>
        </th>
      `
    )
    .join("");

  const loHeaderCells = allUnits
    .flatMap((unit) => {
      const los = unit.learning_outcomes || [];
      if (!los.length) {
        return `
          <th class="trainer-encodable-lo-head text-center">
            <span class="trainer-encodable-lo-head__title">—</span>
          </th>
        `;
      }
      return los.map(
        (lo) => `
          <th class="trainer-encodable-lo-head text-center">
            <span class="trainer-encodable-lo-head__title">${escapeHtml(lo.label)}</span>
          </th>
        `
      );
    })
    .join("");

  const rows = filtered
    .map((student, rowIndex) => {
      const names = splitNameParts(student);
      const record = mergeRecord(
        gradeStore[student.key],
        learningOutcomeDefsForStudent(student, config)
      );

      const competencyCells = allUnits
        .map((unit) => renderEncodableLoCells(record, unit))
        .join("");

      return `
        <tr>
          <td class="text-center trainer-encodable-name-col">${rowIndex + 1}</td>
          <td class="trainer-encodable-name-col">${escapeHtml(names.last || "—")}</td>
          <td class="trainer-encodable-name-col">${escapeHtml(names.first || "—")}</td>
          <td class="trainer-encodable-name-col">${escapeHtml(names.middle || "—")}</td>
          ${competencyCells}
        </tr>
      `;
    })
    .join("");

  return `
    <div class="trainer-encodable-scroll">
      <table class="table trainer-table trainer-encodable-sheet-table mb-0">
        <thead>
          <tr>
            <th rowspan="3" class="text-center trainer-encodable-name-col">No.</th>
            <th rowspan="3" class="trainer-encodable-name-col">Last Name</th>
            <th rowspan="3" class="trainer-encodable-name-col">First Name</th>
            <th rowspan="3" class="trainer-encodable-name-col">Middle Name</th>
            ${categoryHeaderCells}
          </tr>
          <tr>${unitHeaderCells}</tr>
          <tr>${loHeaderCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function hasUcScoreRow(row) {
  if (!row) return false;
  return [row.written, row.demo, row.interview].some((v) => v !== "" && v != null);
}

function competencyStatusForUnit(record, unit) {
  const row = record.scores?.[unit.id];
  let written = null;
  let demo = null;
  let interview = null;

  if (hasUcScoreRow(row)) {
    written = parseScore(row.written);
    demo = parseScore(row.demo);
    interview = parseScore(row.interview);
  } else {
    const inst = getInstitutionalScores(record);
    written = parseScore(inst.written);
    demo = parseScore(inst.demo);
    interview = parseScore(inst.interview);
  }

  return resultFromAverage(computeAverage(written, demo, interview));
}

function renderStatusPill(result) {
  return `<span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>`;
}

function isOverallResultsRowComplete(record, units) {
  if (!units?.length) return false;
  return units.every(
    (unit) => overallResultFromEncodableUnit(record, unit).key !== "incomplete"
  );
}

function renderNationalAssessmentSelect(record, studentName, disabled = false) {
  const current = (record?.national_assessment?.result || "").trim();
  const mutedClass = disabled ? " trainer-na-select-wrap--muted" : "";
  const disabledAttr = disabled ? " disabled" : "";
  const hint = disabled
    ? "Complete all competency results before selecting national assessment"
    : "Select national assessment result";
  return `
    <label class="trainer-na-select-wrap${mutedClass}">
      <select
        class="form-select form-select-sm trainer-na-select"
        data-national-assessment-result
        aria-label="National assessment result for ${escapeHtml(studentName || "student")}"
        title="${escapeHtml(hint)}"
        ${disabledAttr}
      >
        <option value="" ${!current ? "selected" : ""}>Select result</option>
        <option value="Not Yet Competent" ${current === "Not Yet Competent" ? "selected" : ""}>Not Yet Competent</option>
        <option value="Competent" ${current === "Competent" ? "selected" : ""}>Competent</option>
      </select>
      <i class="bi bi-chevron-down" aria-hidden="true"></i>
    </label>
  `;
}

function overallResultFromEncodableUnit(record, unit) {
  const row = record.scores?.[unit.id];
  if (!hasUcScoreRow(row)) {
    return { label: "—", className: "trainer-result-badge--empty", key: "incomplete" };
  }
  const result = competencyStatusForUnit(record, unit);
  if (result.key === "competent") {
    return { label: "Competent", className: "trainer-result-badge--competent", key: "competent" };
  }
  return { label: "Incompetent", className: "trainer-result-badge--incompetent", key: "incompetent" };
}

function overallResultStatusKey(record, units) {
  const results = (units || []).map((unit) => overallResultFromEncodableUnit(record, unit));
  if (!results.length) return "incomplete";
  if (results.some((result) => result.key === "incomplete")) return "incomplete";
  if (results.some((result) => result.key === "incompetent")) return "incompetent";
  return "competent";
}

function renderNonEncodableSheet(state, filters) {
  const { activeStudents, gradeStore, config } = state;
  const students = activeStudents;
  const { query, status } = filters;

  const program =
    config.primary_program || students.find((s) => s.program)?.program || "";
  const categories = getNonEncodableStructure(config, program);
  const allUnits = [];
  categories.forEach((category) => {
    (category.units || []).forEach((unit) => allUnits.push({ ...unit, category }));
  });

  const filtered = students.filter((student, index) => {
    const names = splitNameParts(student);
    const haystack = `${formatStudentEncodableName(student, index)} ${names.first} ${names.last} ${student.name}`.toLowerCase();
    const record = mergeRecord(
      gradeStore[student.key],
      learningOutcomeDefsForStudent(student, config)
    );
    const resultKey = overallResultStatusKey(record, allUnits);
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !status || resultKey === status;
    return matchesQuery && matchesStatus;
  });

  if (!students.length) {
    return `<p class="trainer-schedule-empty mb-0">No assigned students yet.</p>`;
  }
  if (!allUnits.length) {
    return `<p class="trainer-schedule-empty mb-0">No competencies configured for this class.</p>`;
  }
  if (!filtered.length) {
    return `<p class="trainer-schedule-empty mb-0">No students match your filters.</p>`;
  }

  const categoryHeaderCells = categories
    .map((category) => {
      const count = (category.units || []).length;
      if (!count) return "";
      return `
        <th colspan="${count}" class="trainer-non-encodable-category-head text-center">
          ${escapeHtml(category.label)}
        </th>
      `;
    })
    .join("");

  const unitHeaderCells = allUnits
    .map(
      (unit) => `
        <th class="trainer-non-encodable-unit-head text-center">
          <span class="trainer-non-encodable-unit-head__title">${escapeHtml(unit.title)}</span>
        </th>
      `
    )
    .join("");

  const rows = filtered
    .map((student, rowIndex) => {
      const names = splitNameParts(student);
      const record = mergeRecord(
        gradeStore[student.key],
        learningOutcomeDefsForStudent(student, config)
      );

      const rowComplete = isOverallResultsRowComplete(record, allUnits);

      const competencyCells = allUnits
        .map((unit) => {
          const result = overallResultFromEncodableUnit(record, unit);
          return `
            <td class="text-center trainer-non-encodable-status-cell">
              ${renderStatusPill(result)}
            </td>
          `;
        })
        .join("");

      return `
        <tr data-student-key="${escapeHtml(student.key)}" data-row-complete="${rowComplete ? "1" : "0"}">
          <td class="text-center trainer-non-encodable-name-col">${rowIndex + 1}</td>
          <td class="trainer-non-encodable-name-col">${escapeHtml(names.last || "—")}</td>
          <td class="trainer-non-encodable-name-col">${escapeHtml(names.first || "—")}</td>
          <td class="trainer-non-encodable-name-col">${escapeHtml(names.middle || "—")}</td>
          ${competencyCells}
          <td class="trainer-non-encodable-na-cell">
            ${renderNationalAssessmentSelect(record, student.name, !rowComplete)}
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="trainer-non-encodable-scroll">
      <table class="table trainer-table trainer-non-encodable-sheet-table mb-0">
        <thead>
          <tr>
            <th rowspan="2" class="text-center trainer-non-encodable-name-col">No.</th>
            <th rowspan="2" class="trainer-non-encodable-name-col">Last Name</th>
            <th rowspan="2" class="trainer-non-encodable-name-col">First Name</th>
            <th rowspan="2" class="trainer-non-encodable-name-col">Middle Name</th>
            ${categoryHeaderCells}
            <th rowspan="2" class="trainer-non-encodable-na-head text-center">For National Assessment</th>
          </tr>
          <tr>${unitHeaderCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function seedDemoRecordScores(students, gradeStore) {
  const demoScores = {
    "demo-juan-dela-cruz": { written: 85, demo: 75, interview: 90 },
    "demo-maria-santos": { written: 88, demo: 82, interview: 86 },
    "demo-pedro-garcia": { written: 68, demo: 70, interview: 65 },
  };
  students.forEach((student) => {
    const seed = demoScores[student.key];
    if (!seed) return;
    const record = gradeStore[student.key];
    if (!record) return;
    const inst = getInstitutionalScores(record);
    if (inst.written != null || inst.demo != null || inst.interview != null) return;
    record.scores = {
      ...(record.scores || {}),
      [INSTITUTIONAL_UC_KEY]: { ...seed },
    };
    gradeStore[student.key] = record;
  });
}

function initSheetsPage() {
  const config = readConfig();
  if (!config?.records_url) return;

  const students = config.students || [];
  const gradeStore = {};
  const saveTimers = new Map();

  const state = {
    students,
    activeStudents: [],
    gradeStore,
    config,
    selection: {
      program: config.default_program || config.primary_program || "",
      batchId: config.default_batch_id || "",
    },
  };

  function syncSelectionView() {
    if (!state.selection.program && getCourseGroups(config)[0]) {
      state.selection.program = getCourseGroups(config)[0].program;
      state.selection.batchId = getCourseGroups(config)[0].batches?.[0]?.id || "";
    }
    state.config.primary_program = state.selection.program;
    state.activeStudents = getActiveStudents(state);
    updatePageSubtitle(state.selection.program, findBatchMeta(state));
    renderClassPicker(state, {
      onCourseSelect(program) {
        const group = findCourseGroup(state.config, program);
        state.selection.program = program;
        state.selection.batchId = group?.batches?.[0]?.id || "";
        syncSelectionView();
        renderAll();
      },
      onBatchSelect(batchId) {
        state.selection.batchId = batchId;
        syncSelectionView();
        renderAll();
      },
    });
  }

  const recordContent = document.getElementById("record-sheet-content");
  const encodableContent = document.getElementById("encodable-sheet-content");
  const nonEncodableContent = document.getElementById("non-encodable-sheet-content");

  const recordSearch = document.getElementById("record-sheet-search");
  const recordStatus = document.getElementById("record-sheet-status");
  const encodableSearch = document.getElementById("encodable-sheet-search");
  const encodableStatus = document.getElementById("encodable-sheet-status");
  const nonEncodableSearch = document.getElementById("non-encodable-search");
  const nonEncodableStatus = document.getElementById("non-encodable-status");
  const saveHint = document.getElementById("record-sheet-save-hint");

  function getRecordFilters() {
    return {
      query: (recordSearch?.value || "").trim().toLowerCase(),
      status: recordStatus?.value || "",
    };
  }

  function getEncodableFilters() {
    return {
      query: (encodableSearch?.value || "").trim().toLowerCase(),
      status: encodableStatus?.value || "",
    };
  }

  function getNonEncodableFilters() {
    return {
      query: (nonEncodableSearch?.value || "").trim().toLowerCase(),
      status: nonEncodableStatus?.value || "",
    };
  }

  function renderAll() {
    if (recordContent) {
      recordContent.innerHTML = renderRecordSheetTable(state, getRecordFilters());
      bindRecordSheetEvents();
    }
    if (encodableContent) {
      encodableContent.innerHTML = renderEncodableSheet(state, getEncodableFilters());
      bindEncodableEvents();
    }
    if (nonEncodableContent) {
      nonEncodableContent.innerHTML = renderNonEncodableSheet(state, getNonEncodableFilters());
      bindNonEncodableEvents();
    }
  }

  function scheduleSave(studentKey) {
    if (!config.save_url) return;
    window.clearTimeout(saveTimers.get(studentKey));
    saveTimers.set(
      studentKey,
      window.setTimeout(() => {
        persistStudent(studentKey).catch((error) => {
          showToast(error instanceof Error ? error.message : "Could not save.", true);
        });
      }, 600)
    );
  }

  async function persistStudent(studentKey) {
    const student = state.students.find((s) => s.key === studentKey);
    if (!student || !config.save_url) return;

    const record = mergeRecord(gradeStore[studentKey], config.learning_outcomes);
    await saveRecord(config.save_url, student, record);
    if (saveHint) saveHint.hidden = false;
    showToast(`Scores saved for ${student.name}.`);
  }

  function refreshDerivedSheets() {
    if (encodableContent) {
      encodableContent.innerHTML = renderEncodableSheet(state, getEncodableFilters());
    }
    if (nonEncodableContent) {
      nonEncodableContent.innerHTML = renderNonEncodableSheet(state, getNonEncodableFilters());
      bindNonEncodableEvents();
    }
  }

  function syncRowToStore(rowEl) {
    const studentKey = rowEl.dataset.studentKey;
    if (!studentKey) return;
    const record = mergeRecord(gradeStore[studentKey], config.learning_outcomes);
    const programLabel = config.primary_program || "";
    const units = flattenRecordSheetUnits(getRecordSheetStructure(config, programLabel));
    record.scores = {
      ...(record.scores || {}),
      ...collectRowScores(rowEl),
    };
    const remarksEl = rowEl.querySelector("[data-remarks]");
    if (remarksEl) {
      record.remarks = remarksEl.value;
      record.national_assessment = {
        ...(record.national_assessment || {}),
        remarks: remarksEl.value,
      };
    }
    gradeStore[studentKey] = record;
    updateRowResult(rowEl, units);
    refreshDerivedSheets();
    scheduleSave(studentKey);
  }

  function bindRecordSheetEvents() {
    recordContent?.querySelectorAll("tbody tr[data-student-key]").forEach((rowEl) => {
      rowEl.querySelectorAll(".trainer-score-input").forEach((input) => {
        input.addEventListener("input", () => {
          enforceScoreInput(input);
          syncRowToStore(rowEl);
        });
        input.addEventListener("blur", () => {
          enforceScoreInput(input);
          syncRowToStore(rowEl);
        });
      });
      rowEl.querySelector("[data-remarks]")?.addEventListener("change", () => syncRowToStore(rowEl));
      rowEl.querySelector("[data-retake-btn]")?.addEventListener("click", () => {
        showToast("Retake scheduling will be available in a future update.");
      });
    });
  }

  function bindEncodableEvents() {
    /* Encodable sheet is read-only; no interactive bindings. */
  }

  function bindNonEncodableEvents() {
    nonEncodableContent
      ?.querySelectorAll('tr[data-student-key] [data-national-assessment-result]')
      .forEach((selectEl) => {
        selectEl.addEventListener("change", () => {
          if (selectEl.disabled) return;
          const rowEl = selectEl.closest("tr[data-student-key]");
          const studentKey = rowEl?.dataset.studentKey;
          if (!studentKey) return;
          const record = mergeRecord(gradeStore[studentKey], config.learning_outcomes);
          record.national_assessment = {
            ...(record.national_assessment || {}),
            result: selectEl.value || "",
          };
          gradeStore[studentKey] = record;
          scheduleSave(studentKey);
        });
      });
  }

  function printRecordSheetTableOnly() {
    const table = document.getElementById("record-sheet-table");
    if (!table) {
      showToast("Record sheet table is not ready yet.", true);
      return;
    }

    const tableClone = table.cloneNode(true);
    tableClone.querySelectorAll("input, select, textarea").forEach((field) => {
      const value = field.value != null ? String(field.value).trim() : "";
      const text = value || "—";
      const span = document.createElement("span");
      span.textContent = text;
      span.className = "print-field-text";
      field.replaceWith(span);
    });
    tableClone.querySelectorAll("button").forEach((btn) => {
      const text = (btn.textContent || "").trim();
      const span = document.createElement("span");
      span.textContent = text || "—";
      btn.replaceWith(span);
    });

    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
    if (!printWindow) {
      showToast("Popup blocked. Please allow popups for printing.", true);
      return;
    }

    const printTitle = `${state.selection.program || "Trainer"} - Record Sheet`;
    printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(printTitle)}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; }
    .print-head { margin-bottom: 8px; }
    .print-title { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
    .print-meta { font-size: 11px; margin: 0; color: #334155; }
    .sheet-wrap { overflow: visible; }
    table { border-collapse: collapse; width: 100%; font-size: 10px; }
    th, td { border: 1px solid #475569; padding: 4px 5px; vertical-align: middle; }
    thead th { background: #f1f5f9; }
    .print-field-text { display: inline-block; min-width: 1ch; font-weight: 600; }
    .trainer-result-badge { padding: 0; border: none; background: transparent !important; color: #111827 !important; font-size: 10px; }
  </style>
</head>
<body>
  <div class="print-head">
    <p class="print-title">${escapeHtml(printTitle)}</p>
    <p class="print-meta">Printed ${new Date().toLocaleString()}</p>
  </div>
  <div class="sheet-wrap">${tableClone.outerHTML}</div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  }

  async function loadRecords() {
    const loading = `<p class="text-muted mb-0">Loading record sheets…</p>`;
    [recordContent, encodableContent, nonEncodableContent].forEach((el) => {
      if (el) el.innerHTML = loading;
    });

    try {
      const records = await fetchRecords(config.records_url);
      records.forEach((record) => {
        gradeStore[record.student_key] = mergeRecord(record, config.learning_outcomes);
      });
      students.forEach((student) => {
        if (!gradeStore[student.key]) {
          gradeStore[student.key] = emptyRecord(
            learningOutcomeDefsForStudent(student, config)
          );
        }
      });
      seedDemoRecordScores(state.students, gradeStore);
      syncSelectionView();
      renderAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load record sheets.";
      const html = `<div class="alert alert-danger mb-0" role="alert">${escapeHtml(message)}</div>`;
      [recordContent, encodableContent, nonEncodableContent].forEach((el) => {
        if (el) el.innerHTML = html;
      });
    }
  }

  [recordSearch, recordStatus].forEach((el) => {
    el?.addEventListener("input", renderAll);
    el?.addEventListener("change", renderAll);
  });
  [encodableSearch, encodableStatus].forEach((el) => {
    el?.addEventListener("input", renderAll);
    el?.addEventListener("change", renderAll);
  });
  [nonEncodableSearch, nonEncodableStatus].forEach((el) => {
    el?.addEventListener("input", renderAll);
    el?.addEventListener("change", renderAll);
  });
  document.getElementById("record-sheet-print")?.addEventListener("click", () => {
    printRecordSheetTableOnly();
  });
  document.getElementById("encodable-sheet-print")?.addEventListener("click", () => window.print());
  document.getElementById("non-encodable-print")?.addEventListener("click", () => window.print());

  loadRecords();
}

initSheetsPage();
