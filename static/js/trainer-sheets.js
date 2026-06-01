/**
 * Trainer — Record Sheets (institutional assessment, encodable LO, progress chart).
 */

import { getCsrfToken } from "./staff-settings-modal.js";

const INSTITUTIONAL_UC_KEY = "institutional";
const SCORE_MIN = 0;
const SCORE_MAX = 100;

function readConfig() {
  const el = document.getElementById("sheets-config");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "{}");
  } catch {
    return null;
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
  if (!Number.isFinite(num) || num < SCORE_MIN || num > SCORE_MAX) return null;
  return num;
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
  if (avg >= 73) {
    return { label: "Conditional", className: "trainer-result-badge--conditional", key: "conditional" };
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

function formatStudentProgressName(student, index) {
  const { first, last } = splitNameParts(student);
  const lastUpper = (last || "—").toUpperCase();
  const firstUpper = (first || "").toUpperCase();
  if (firstUpper) {
    return `${index + 1}. ${lastUpper}, ${firstUpper}`;
  }
  return `${index + 1}. ${(student.name || "—").toUpperCase()}`;
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
  if (!Number.isFinite(num) || num < SCORE_MIN || num > SCORE_MAX) {
    input.classList.add("trainer-score-input--invalid");
    input.setCustomValidity("Enter a number from 0 to 100.");
    return;
  }
  if (num > SCORE_MAX) input.value = String(SCORE_MAX);
  if (num < SCORE_MIN) input.value = String(SCORE_MIN);
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
  const institutional = getInstitutionalScores(record);
  const payload = {
    student_key: student.key,
    student_name: student.name,
    program: student.program,
    scores: {
      ...(record.scores || {}),
      [INSTITUTIONAL_UC_KEY]: {
        written: institutional.written,
        demo: institutional.demo,
        interview: institutional.interview,
      },
    },
    learning_outcomes: record.learning_outcomes || {},
    national_assessment: record.national_assessment || { result: "", date: "" },
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

function updateRowResult(rowEl) {
  const written = parseScore(rowEl.querySelector('[data-field="written"]')?.value);
  const demo = parseScore(rowEl.querySelector('[data-field="demo"]')?.value);
  const interview = parseScore(rowEl.querySelector('[data-field="interview"]')?.value);
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
  return {
    written: parseScore(rowEl.querySelector('[data-field="written"]')?.value),
    demo: parseScore(rowEl.querySelector('[data-field="demo"]')?.value),
    interview: parseScore(rowEl.querySelector('[data-field="interview"]')?.value),
  };
}

function renderRecordSheetTable(state, filters) {
  const { students, gradeStore, config } = state;
  const { query, status } = filters;
  const programLabel = config.primary_program || students[0]?.program || "";

  const labelEl = document.getElementById("record-sheet-program-label");
  if (labelEl && programLabel) {
    labelEl.textContent = `Institutional Assessment — Written Score / Demonstration / Interview — ${programLabel}`;
  }

  const filtered = students.filter((student) => {
    const names = splitNameParts(student);
    const haystack = `${names.first} ${names.middle} ${names.last} ${student.name}`.toLowerCase();
    const record = mergeRecord(gradeStore[student.key], config.learning_outcomes);
    const scores = getInstitutionalScores(record);
    const avg = computeAverage(
      parseScore(scores.written),
      parseScore(scores.demo),
      parseScore(scores.interview)
    );
    const resultKey = resultFromAverage(avg).key;
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
        <tr
          data-student-key="${escapeHtml(student.key)}"
          data-result-key="${result.key}"
        >
          <td class="text-center">${rowIndex + 1}</td>
          <td class="trainer-record-name">${escapeHtml(formatRecordNameUpper(names.last))}</td>
          <td class="trainer-record-name">${escapeHtml(formatRecordNameUpper(names.first))}</td>
          <td class="trainer-record-name">${escapeHtml(formatRecordNameUpper(names.middle || ""))}</td>
          <td class="text-center">
            <input
              type="number"
              min="0"
              max="100"
              class="form-control form-control-sm trainer-score-input trainer-score-input--written"
              data-field="written"
              value="${written !== "" && written != null ? escapeHtml(written) : ""}"
              aria-label="Written score for ${escapeHtml(student.name)}"
            />
          </td>
          <td class="text-center">
            <input
              type="number"
              min="0"
              max="100"
              class="form-control form-control-sm trainer-score-input trainer-score-input--demo"
              data-field="demo"
              value="${demoScore !== "" && demoScore != null ? escapeHtml(demoScore) : ""}"
              aria-label="Demonstration score for ${escapeHtml(student.name)}"
            />
          </td>
          <td class="text-center">
            <input
              type="number"
              min="0"
              max="100"
              class="form-control form-control-sm trainer-score-input trainer-score-input--interview"
              data-field="interview"
              value="${interview !== "" && interview != null ? escapeHtml(interview) : ""}"
              aria-label="Interview score for ${escapeHtml(student.name)}"
            />
          </td>
          <td class="text-center trainer-record-average" data-average>${avg == null ? "—" : avg.toFixed(1)}</td>
          <td class="text-center" data-result>
            <span class="trainer-result-badge ${result.className}">${escapeHtml(result.label)}</span>
          </td>
          <td class="text-center">
            <button
              type="button"
              class="btn btn-sm trainer-btn-retake${result.key === "failed" ? "" : " hidden"}"
              data-retake-btn
            >
              <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
              Retake
            </button>
          </td>
          <td>
            <input
              type="text"
              class="form-control form-control-sm trainer-record-remarks-input"
              data-remarks
              placeholder="Add remarks..."
              value="${escapeHtml(remarks)}"
              aria-label="Remarks for ${escapeHtml(student.name)}"
            />
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

function renderEncodableSheet(state, filters) {
  const { students, gradeStore, config } = state;
  const { query, status } = filters;

  const filtered = students.filter((student, index) => {
    const names = splitNameParts(student);
    const haystack = `${formatStudentEncodableName(student, index)} ${names.first} ${names.last} ${student.name}`.toLowerCase();
    const structure = getEncodableStructure(student, config);
    const record = mergeRecord(
      gradeStore[student.key],
      learningOutcomeDefsForStudent(student, config)
    );
    const progress = studentLoProgress(record, structure);
    const statusKey = encodableStatusKey(progress);
    const matchesQuery = !query || haystack.includes(query);
    const matchesStatus = !status || statusKey === status;
    return matchesQuery && matchesStatus;
  });

  if (!students.length) {
    return `<p class="trainer-schedule-empty mb-0">No assigned students yet.</p>`;
  }
  if (!filtered.length) {
    return `<p class="trainer-schedule-empty mb-0">No students match your filters.</p>`;
  }

  const cards = filtered
    .map((student) => {
      const index = students.indexOf(student);
      const structure = getEncodableStructure(student, config);
      const record = mergeRecord(
        gradeStore[student.key],
        learningOutcomeDefsForStudent(student, config)
      );
      return renderStudentEncodableCard(student, index, record, structure);
    })
    .join("");

  return `<div class="trainer-encodable-student-grid">${cards}</div>`;
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

function studentOverallStatus(record) {
  const inst = getInstitutionalScores(record);
  return resultFromAverage(
    computeAverage(
      parseScore(inst.written),
      parseScore(inst.demo),
      parseScore(inst.interview)
    )
  );
}

function renderNonEncodableSheet(state, filters) {
  const { students, gradeStore, config } = state;
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
    const resultKey = studentOverallStatus(record).key;
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

      const competencyCells = allUnits
        .map((unit) => {
          const result = competencyStatusForUnit(record, unit);
          return `
            <td class="text-center trainer-non-encodable-status-cell">
              ${renderStatusPill(result)}
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          <td class="text-center trainer-non-encodable-name-col">${rowIndex + 1}</td>
          <td class="trainer-non-encodable-name-col">${escapeHtml(names.last || "—")}</td>
          <td class="trainer-non-encodable-name-col">${escapeHtml(names.first || "—")}</td>
          <td class="trainer-non-encodable-name-col">${escapeHtml(names.middle || "—")}</td>
          ${competencyCells}
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
          </tr>
          <tr>${unitHeaderCells}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function progressChartRows(state) {
  const { students, gradeStore, config } = state;
  return students.map((student, index) => {
    const los = learningOutcomeDefsForStudent(student, config);
    const record = mergeRecord(gradeStore[student.key], los);
    const structure = getEncodableStructure(student, config);
    const loProgress = studentLoProgress(record, structure);
    const institutional = studentOverallStatus(record);
    return {
      student,
      index,
      record,
      loProgress,
      loStatusKey: encodableStatusKey(loProgress),
      institutional,
      searchText: formatStudentProgressName(student, index).toLowerCase(),
    };
  });
}

function renderProgressChart(state, filters) {
  const { students, config } = state;
  const { query, status } = filters || {};

  if (!students.length) {
    return `<p class="trainer-schedule-empty mb-0">No students to display.</p>`;
  }

  const allRows = progressChartRows(state);
  let completeCount = 0;
  let inProgressCount = 0;
  let notStartedCount = 0;

  allRows.forEach((row) => {
    if (row.loStatusKey === "complete") completeCount += 1;
    else if (row.loStatusKey === "in-progress") inProgressCount += 1;
    else notStartedCount += 1;
  });

  const filtered = allRows.filter((row) => {
    const matchesQuery = !query || row.searchText.includes(query);
    const matchesStatus = !status || row.loStatusKey === status;
    return matchesQuery && matchesStatus;
  });

  const reportsUrl = config.reports_url || "/trainer/reports/";

  const listItems = filtered
    .map((row) => {
      const { student, index, loProgress, institutional } = row;
      return `
        <li class="trainer-progress-row" data-lo-status="${row.loStatusKey}">
          <div class="trainer-progress-row__top">
            <span class="trainer-progress-row__name">${escapeHtml(formatStudentProgressName(student, index))}</span>
            <span class="trainer-progress-row__meta">
              <span class="trainer-progress-row__los">${loProgress.checked}/${loProgress.total} LOs</span>
              ${renderStatusPill(institutional)}
            </span>
          </div>
          <div class="trainer-progress-row__bar-line">
            <div class="trainer-progress-row__bar" role="presentation">
              <span class="trainer-progress-row__bar-fill" style="width: ${loProgress.percent}%"></span>
            </div>
            <span class="trainer-progress-row__pct">${loProgress.percent}%</span>
          </div>
        </li>
      `;
    })
    .join("");

  const listHtml = filtered.length
    ? `<ul class="list-unstyled trainer-progress-list mb-0">${listItems}</ul>`
    : `<p class="trainer-schedule-empty mb-0" role="status">No students match your filters.</p>`;

  return `
    <div class="trainer-progress-summary" aria-label="Progress summary">
      <div class="trainer-progress-stat-card">
        <p class="trainer-progress-stat-card__label">All LOs Complete</p>
        <p class="trainer-progress-stat-card__value trainer-progress-stat-card__value--success">${completeCount}</p>
      </div>
      <div class="trainer-progress-stat-card">
        <p class="trainer-progress-stat-card__label">In Progress</p>
        <p class="trainer-progress-stat-card__value trainer-progress-stat-card__value--warning">${inProgressCount}</p>
      </div>
      <div class="trainer-progress-stat-card">
        <p class="trainer-progress-stat-card__label">Not Started</p>
        <p class="trainer-progress-stat-card__value trainer-progress-stat-card__value--muted">${notStartedCount}</p>
      </div>
      <div class="trainer-progress-stat-card">
        <p class="trainer-progress-stat-card__label">Total Students</p>
        <p class="trainer-progress-stat-card__value">${students.length}</p>
      </div>
    </div>
    <div class="trainer-progress-download mb-3">
      <a href="${escapeHtml(reportsUrl)}" class="btn trainer-btn-primary">
        <i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i>
        Download Progress Report
      </a>
    </div>
    ${listHtml}
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

  const state = { students, gradeStore, config };

  const recordContent = document.getElementById("record-sheet-content");
  const encodableContent = document.getElementById("encodable-sheet-content");
  const nonEncodableContent = document.getElementById("non-encodable-sheet-content");
  const progressContent = document.getElementById("progress-chart-content");

  const recordSearch = document.getElementById("record-sheet-search");
  const recordStatus = document.getElementById("record-sheet-status");
  const encodableSearch = document.getElementById("encodable-sheet-search");
  const encodableStatus = document.getElementById("encodable-sheet-status");
  const encodableExpandAll = document.getElementById("encodable-expand-all");
  const nonEncodableSearch = document.getElementById("non-encodable-search");
  const nonEncodableStatus = document.getElementById("non-encodable-status");
  const progressSearch = document.getElementById("progress-chart-search");
  const progressStatus = document.getElementById("progress-chart-status");
  const saveHint = document.getElementById("record-sheet-save-hint");
  let encodableAllExpanded = false;

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

  function updateEncodableStudentCard(cardEl) {
    const studentKey = cardEl.dataset.studentKey;
    const student = students.find((s) => s.key === studentKey);
    if (!student) return;
    const structure = getEncodableStructure(student, config);
    const record = mergeRecord(
      gradeStore[studentKey],
      learningOutcomeDefsForStudent(student, config)
    );
    structure.forEach((category) => {
      (category.units || []).forEach((unit) => {
        const unitCard = cardEl.querySelector(`[data-unit-id="${unit.id}"]`);
        if (!unitCard) return;
        const progress = unitLoProgress(record, unit);
        const pctEl = unitCard.querySelector(".trainer-encodable-unit-card__pct");
        const barEl = unitCard.querySelector(".trainer-encodable-unit-card__bar-fill");
        if (pctEl) pctEl.textContent = `${progress.percent}%`;
        if (barEl) barEl.style.width = `${progress.percent}%`;
      });
    });
    const progress = studentLoProgress(record, structure);
    const countEl = cardEl.querySelector("[data-lo-count]");
    const pctLabel = cardEl.querySelector("[data-lo-pct]");
    const barEl = cardEl.querySelector("[data-lo-bar]");
    if (countEl) countEl.textContent = `${progress.checked}/${progress.total} LOs`;
    if (pctLabel) pctLabel.textContent = `${progress.percent}%`;
    if (barEl) barEl.style.width = `${progress.percent}%`;
    cardEl.dataset.status = encodableStatusKey(progress);
  }

  function syncEncodableFromCard(cardEl) {
    const studentKey = cardEl.dataset.studentKey;
    const student = students.find((s) => s.key === studentKey);
    if (!student) return;
    const los = learningOutcomeDefsForStudent(student, config);
    const record = mergeRecord(gradeStore[studentKey], los);
    cardEl.querySelectorAll("input[data-lo-id]").forEach((input) => {
      record.learning_outcomes[input.dataset.loId] = input.checked;
    });
    gradeStore[studentKey] = record;
    updateEncodableStudentCard(cardEl);
    scheduleSave(studentKey);
    if (progressContent) progressContent.innerHTML = renderProgressChart(state, getProgressFilters());
  }

  function getNonEncodableFilters() {
    return {
      query: (nonEncodableSearch?.value || "").trim().toLowerCase(),
      status: nonEncodableStatus?.value || "",
    };
  }

  function getProgressFilters() {
    return {
      query: (progressSearch?.value || "").trim().toLowerCase(),
      status: progressStatus?.value || "",
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
      if (encodableAllExpanded) {
        encodableContent.querySelectorAll(".trainer-encodable-student-card").forEach((cardEl) => {
          setStudentCardExpanded(cardEl, true);
        });
      }
    }
    if (nonEncodableContent) {
      nonEncodableContent.innerHTML = renderNonEncodableSheet(state, getNonEncodableFilters());
    }
    if (progressContent) {
      progressContent.innerHTML = renderProgressChart(state, getProgressFilters());
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
    const student = students.find((s) => s.key === studentKey);
    if (!student || !config.save_url) return;

    const record = mergeRecord(gradeStore[studentKey], config.learning_outcomes);
    await saveRecord(config.save_url, student, record);
    if (saveHint) saveHint.hidden = false;
    showToast(`Scores saved for ${student.name}.`);
  }

  function syncRowToStore(rowEl) {
    const studentKey = rowEl.dataset.studentKey;
    if (!studentKey) return;
    const record = mergeRecord(gradeStore[studentKey], config.learning_outcomes);
    const scores = collectRowScores(rowEl);
    record.scores = {
      ...(record.scores || {}),
      [INSTITUTIONAL_UC_KEY]: scores,
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
    updateRowResult(rowEl);
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

  function setStudentCardExpanded(cardEl, expanded) {
    const toggle = cardEl.querySelector(".trainer-encodable-student-card__toggle");
    const body = cardEl.querySelector(".trainer-encodable-student-card__body");
    if (!toggle || !body) return;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    body.hidden = !expanded;
    body.classList.toggle("hidden", !expanded);
    cardEl.classList.toggle("is-expanded", expanded);
  }

  function bindEncodableEvents() {
    encodableContent?.querySelectorAll(".trainer-encodable-student-card").forEach((cardEl) => {
      const toggle = cardEl.querySelector(".trainer-encodable-student-card__toggle");
      toggle?.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") !== "true";
        setStudentCardExpanded(cardEl, expanded);
      });
      cardEl.querySelectorAll("input[data-lo-id]").forEach((input) => {
        input.addEventListener("change", () => syncEncodableFromCard(cardEl));
      });
    });
  }

  async function loadRecords() {
    const loading = `<p class="text-muted mb-0">Loading record sheets…</p>`;
    [recordContent, encodableContent, nonEncodableContent, progressContent].forEach((el) => {
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
      seedDemoRecordScores(students, gradeStore);
      renderAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load record sheets.";
      const html = `<div class="alert alert-danger mb-0" role="alert">${escapeHtml(message)}</div>`;
      [recordContent, encodableContent, nonEncodableContent, progressContent].forEach((el) => {
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
  encodableExpandAll?.addEventListener("click", () => {
    encodableAllExpanded = !encodableAllExpanded;
    encodableExpandAll.textContent = encodableAllExpanded ? "Collapse All" : "Expand All";
    encodableContent?.querySelectorAll(".trainer-encodable-student-card").forEach((cardEl) => {
      setStudentCardExpanded(cardEl, encodableAllExpanded);
    });
  });
  [nonEncodableSearch, nonEncodableStatus].forEach((el) => {
    el?.addEventListener("input", renderAll);
    el?.addEventListener("change", renderAll);
  });
  [progressSearch, progressStatus].forEach((el) => {
    el?.addEventListener("input", renderAll);
    el?.addEventListener("change", renderAll);
  });

  document.getElementById("record-sheet-print")?.addEventListener("click", () => window.print());
  document.getElementById("encodable-sheet-print")?.addEventListener("click", () => window.print());
  document.getElementById("non-encodable-print")?.addEventListener("click", () => window.print());
  document.getElementById("progress-chart-print")?.addEventListener("click", () => window.print());

  loadRecords();
}

initSheetsPage();
