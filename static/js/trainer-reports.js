/**
 * Trainer E.G.A.C.E. Performance Report
 * Mirrors official Registrar format filtered to the logged-in trainer's assigned courses & batches.
 */

const FISCAL_YEAR = 2026;
const PREPARED_NAME_STORAGE = "vtiac_trainer_report_prepared_name";
const PREPARED_TITLE_STORAGE = "vtiac_trainer_report_prepared_title";
const APPROVED_NAME_STORAGE = "vtiac_trainer_report_approved_name";
const APPROVED_TITLE_STORAGE = "vtiac_trainer_report_approved_title";

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function loadJsonData(id, fallback = []) {
  const el = document.getElementById(id);
  if (!el?.textContent?.trim()) return fallback;
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    console.warn(`Failed to parse json script: ${id}`, e);
    return fallback;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("trainer-reports-content");
  if (!contentEl) return;

  const rawEgaceData = loadJsonData("reports-egace-data", []);
  const rawBatchesData = loadJsonData("reports-batches-data", []);
  const trainerCourses = loadJsonData("trainer-courses-data", []);
  const trainerInfo = loadJsonData("trainer-info-data", { name: "Trainer", title: "Trainer / TVET Instructor" });

  let selectedCourse = trainerCourses.length ? trainerCourses[0] : "";
  let selectedBatch = "";
  let preparedByName = trainerInfo.name || "Kenneath Kim Patana";
  let preparedByTitle = trainerInfo.title || "Trainer / TVET Instructor";
  let approvedByName = "DANILO P. PATANA";
  let approvedByTitle = "School Director";

  try {
    const savedPrepName = localStorage.getItem(PREPARED_NAME_STORAGE);
    if (savedPrepName) preparedByName = savedPrepName;
    const savedPrepTitle = localStorage.getItem(PREPARED_TITLE_STORAGE);
    if (savedPrepTitle) preparedByTitle = savedPrepTitle;
    const savedAppName = localStorage.getItem(APPROVED_NAME_STORAGE);
    if (savedAppName) approvedByName = savedAppName;
    const savedAppTitle = localStorage.getItem(APPROVED_TITLE_STORAGE);
    if (savedAppTitle) approvedByTitle = savedAppTitle;
  } catch (_) {}

  // Filter toolbar elements
  const yearSelect = document.getElementById("report-filter-year");
  const monthSelect = document.getElementById("report-filter-month");
  const startDateInput = document.getElementById("report-start-date");
  const endDateInput = document.getElementById("report-end-date");
  const applyFilterBtn = document.getElementById("report-apply-filter");
  const resetFilterBtn = document.getElementById("report-reset-filter");
  const activeRangeText = document.getElementById("active-report-range-text");
  const activeFilterTag = document.getElementById("active-report-filter-tag");

  const presetThisMonth = document.getElementById("preset-this-month");
  const presetLastMonth = document.getElementById("preset-last-month");
  const presetThisYear = document.getElementById("preset-this-year");
  const presetAllTime = document.getElementById("preset-all-time");

  const urlParams = new URLSearchParams(window.location.search);
  let filterYear = urlParams.get("year") || "";
  let filterMonth = urlParams.get("month") || "";
  let filterStartDate = urlParams.get("start_date") || "";
  let filterEndDate = urlParams.get("end_date") || "";

  if (yearSelect && filterYear) yearSelect.value = filterYear;
  if (monthSelect && filterMonth) monthSelect.value = filterMonth;
  if (startDateInput && filterStartDate) startDateInput.value = filterStartDate;
  if (endDateInput && filterEndDate) endDateInput.value = filterEndDate;

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const MONTH_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  function formatDatePretty(isoStr) {
    if (!isoStr) return "";
    const parts = isoStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && MONTH_SHORT[m]) {
        return `${MONTH_SHORT[m]} ${d}, ${y}`;
      }
    }
    return isoStr;
  }

  function hasActiveFilter() {
    return Boolean(filterYear || filterMonth || filterStartDate || filterEndDate);
  }

  function getFormattedReportRange(defaultFallback = `AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`) {
    if (!hasActiveFilter()) return defaultFallback;
    if (filterStartDate && filterEndDate) {
      if (filterStartDate === filterEndDate) return formatDatePretty(filterStartDate);
      return `${formatDatePretty(filterStartDate)} – ${formatDatePretty(filterEndDate)}`;
    }
    if (filterStartDate) return `From ${formatDatePretty(filterStartDate)}`;
    if (filterEndDate) return `Until ${formatDatePretty(filterEndDate)}`;
    if (filterYear && filterMonth) {
      const mIdx = parseInt(filterMonth, 10) - 1;
      return `${MONTH_NAMES[mIdx]} ${filterYear}`;
    }
    if (filterYear) return `Calendar Year ${filterYear}`;
    if (filterMonth) {
      const mIdx = parseInt(filterMonth, 10) - 1;
      return `All ${MONTH_NAMES[mIdx]}`;
    }
    return defaultFallback;
  }

  function updateFilterBanner() {
    const isFiltered = hasActiveFilter();
    if (activeRangeText) {
      activeRangeText.textContent = getFormattedReportRange(`AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`);
    }
    if (activeFilterTag) {
      activeFilterTag.classList.toggle("d-none", !isFiltered);
    }
  }

  function isBatchInDateRange(b) {
    if (!hasActiveFilter()) return true;

    let startIso = b.start_date_iso || "";
    let endIso = b.end_date_iso || "";
    const primaryDate = startIso || endIso || "";
    let bYear = b.year;
    let bMonth = b.month;

    if (!bYear && primaryDate) {
      bYear = parseInt(primaryDate.split("-")[0], 10);
    }
    if (!bMonth && primaryDate) {
      bMonth = parseInt(primaryDate.split("-")[1], 10);
    }

    if (filterYear) {
      const targetY = parseInt(filterYear, 10);
      if (bYear && bYear !== targetY) {
        if (endIso) {
          const endY = parseInt(endIso.split("-")[0], 10);
          if (endY !== targetY) return false;
        } else {
          return false;
        }
      }
    }

    if (filterMonth) {
      const targetM = parseInt(filterMonth, 10);
      if (bMonth && bMonth !== targetM) {
        if (endIso) {
          const endM = parseInt(endIso.split("-")[1], 10);
          if (endM !== targetM) return false;
        } else {
          return false;
        }
      }
    }

    if (filterStartDate && primaryDate && primaryDate < filterStartDate) {
      if (!endIso || endIso < filterStartDate) return false;
    }
    if (filterEndDate && primaryDate && primaryDate > filterEndDate) {
      return false;
    }

    return true;
  }

  function syncDateInputsFromYearMonth() {
    const y = yearSelect?.value || "";
    const m = monthSelect?.value || "";

    if (y && m) {
      const yearNum = parseInt(y, 10);
      const monthNum = parseInt(m, 10);
      const lastDay = new Date(yearNum, monthNum, 0).getDate();
      const mStr = String(monthNum).padStart(2, "0");
      if (startDateInput) startDateInput.value = `${y}-${mStr}-01`;
      if (endDateInput) endDateInput.value = `${y}-${mStr}-${String(lastDay).padStart(2, "0")}`;
    } else if (y) {
      if (startDateInput) startDateInput.value = `${y}-01-01`;
      if (endDateInput) endDateInput.value = `${y}-12-31`;
    }
  }

  function applyFilter() {
    filterYear = yearSelect?.value || "";
    filterMonth = monthSelect?.value || "";
    filterStartDate = startDateInput?.value || "";
    filterEndDate = endDateInput?.value || "";
    updateFilterBanner();
    renderContent();
  }

  function resetFilter() {
    if (yearSelect) yearSelect.value = "";
    if (monthSelect) monthSelect.value = "";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
    filterYear = "";
    filterMonth = "";
    filterStartDate = "";
    filterEndDate = "";
    updateFilterBanner();
    renderContent();
  }

  function setPreset(preset) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    if (preset === "this-month") {
      filterYear = String(curYear);
      filterMonth = String(curMonth);
      const lastDay = new Date(curYear, curMonth, 0).getDate();
      const mStr = String(curMonth).padStart(2, "0");
      filterStartDate = `${curYear}-${mStr}-01`;
      filterEndDate = `${curYear}-${mStr}-${String(lastDay).padStart(2, "0")}`;
    } else if (preset === "last-month") {
      let prevMonth = curMonth - 1;
      let prevYear = curYear;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      filterYear = String(prevYear);
      filterMonth = String(prevMonth);
      const lastDay = new Date(prevYear, prevMonth, 0).getDate();
      const mStr = String(prevMonth).padStart(2, "0");
      filterStartDate = `${prevYear}-${mStr}-01`;
      filterEndDate = `${prevYear}-${mStr}-${String(lastDay).padStart(2, "0")}`;
    } else if (preset === "this-year") {
      filterYear = String(curYear);
      filterMonth = "";
      filterStartDate = `${curYear}-01-01`;
      filterEndDate = `${curYear}-12-31`;
    } else if (preset === "all") {
      resetFilter();
      return;
    }

    if (yearSelect) yearSelect.value = filterYear;
    if (monthSelect) monthSelect.value = filterMonth;
    if (startDateInput) startDateInput.value = filterStartDate;
    if (endDateInput) endDateInput.value = filterEndDate;

    applyFilter();
  }

  function initDateFilterControls() {
    yearSelect?.addEventListener("change", () => {
      syncDateInputsFromYearMonth();
      applyFilter();
    });

    monthSelect?.addEventListener("change", () => {
      if (!yearSelect.value) {
        yearSelect.value = String(FISCAL_YEAR);
      }
      syncDateInputsFromYearMonth();
      applyFilter();
    });

    applyFilterBtn?.addEventListener("click", applyFilter);
    resetFilterBtn?.addEventListener("click", resetFilter);

    presetThisMonth?.addEventListener("click", () => setPreset("this-month"));
    presetLastMonth?.addEventListener("click", () => setPreset("last-month"));
    presetThisYear?.addEventListener("click", () => setPreset("this-year"));
    presetAllTime?.addEventListener("click", () => setPreset("all"));

    updateFilterBanner();
  }

  function renderOfficialVtiacHeader() {
    return `
      <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom border-dark border-2 official-header-row">
        <div style="width: 80px;" class="text-start">
          <img src="/static/img/valient-logo.svg" alt="VTIAC Logo" style="height: 75px; width: 75px; object-fit: contain;">
        </div>
        <div class="text-center flex-grow-1 px-2">
          <h4 class="fw-bold mb-0 text-dark" style="font-family: 'Times New Roman', serif, sans-serif; letter-spacing: 0.5px; font-size: 1.25rem;">
            VALIANT TECHNICAL INSTITUTE AND ASSESSMENT CENTER, INC.
          </h4>
          <p class="mb-0 text-dark small" style="font-size: 0.85rem;">Bangoy St., Salvacion, Panabo City, Philippines</p>
          <p class="mb-0 text-dark small" style="font-size: 0.8rem;">Mobile No: 09106341543, 09176820073 &nbsp; e-mail: valianttiaci@gmail.com</p>
        </div>
        <div style="width: 80px;" class="text-end">
          <img src="/static/img/TESDA%20Logo%20official.png" alt="TESDA Logo" style="height: 75px; width: 75px; object-fit: contain;">
        </div>
      </div>
    `;
  }

  function renderOfficialSignatureBlock() {
    return `
      <div class="d-flex justify-content-between align-items-start mt-4 pt-3 official-signature-section">
        <div style="width: 280px;">
          <p class="text-dark small mb-1 fw-semibold">Prepared by:</p>
          <div class="pt-2" style="width: 250px;">
            <div style="height: 42px;"></div>
            <div class="border-bottom border-dark border-1 mb-1"></div>
            <input type="text" id="report-prepared-by-name" 
                   class="official-editable-input fw-bold text-dark text-uppercase w-100" 
                   value="${escapeHtml(preparedByName)}" 
                   placeholder="Enter Name..."
                   title="Click to edit name"
                   style="letter-spacing: 0.5px; font-size: 0.95rem; font-family: 'Times New Roman', serif, sans-serif;">
            <input type="text" id="report-prepared-by-title" 
                   class="official-editable-input text-dark small w-100" 
                   value="${escapeHtml(preparedByTitle)}" 
                   placeholder="Enter Designation..."
                   title="Click to edit designation"
                   style="font-size: 0.85rem; font-family: 'Times New Roman', serif, sans-serif;">
          </div>
        </div>

        <div style="width: 280px;" class="text-start">
          <p class="text-dark small mb-1 fw-semibold">Approved by:</p>
          <div class="pt-2" style="width: 250px;">
            <div style="height: 42px;"></div>
            <div class="border-bottom border-dark border-1 mb-1"></div>
            <input type="text" id="report-approved-by-name" 
                   class="official-editable-input fw-bold text-dark text-uppercase w-100" 
                   value="${escapeHtml(approvedByName)}" 
                   placeholder="Enter Approver Name..."
                   title="Click to edit name"
                   style="letter-spacing: 0.5px; font-size: 0.95rem; font-family: 'Times New Roman', serif, sans-serif;">
            <input type="text" id="report-approved-by-title" 
                   class="official-editable-input text-dark small w-100" 
                   value="${escapeHtml(approvedByTitle)}" 
                   placeholder="Enter Designation..."
                   title="Click to edit designation"
                   style="font-size: 0.85rem; font-family: 'Times New Roman', serif, sans-serif;">
          </div>
        </div>
      </div>
    `;
  }

  function renderEgaceReport() {
    const batches = (rawBatchesData || []).filter(
      (b) => b.course_name?.toLowerCase().trim() === selectedCourse.toLowerCase().trim()
    );

    const availableBatchesForCourse = [];
    batches.forEach((b, idx) => {
      const lbl = (b.batch_label || `Batch ${idx + 1}`).trim();
      if (lbl && !availableBatchesForCourse.some((x) => x.toLowerCase() === lbl.toLowerCase())) {
        availableBatchesForCourse.push(lbl);
      }
    });

    const allRows = batches.map((b, idx) => {
      let label = (b.batch_label || `Batch ${idx + 1}`).trim();
      return {
        label: label.toUpperCase(),
        rawLabel: label,
        enrolled: b.students_count || 0,
        graduates: b.graduates || 0,
        assessed: b.assessed || 0,
        certified: b.certified || 0,
        employed: b.employed || 0,
        start_date_iso: b.start_date_iso,
        end_date_iso: b.end_date_iso,
        start_date: b.start_date,
        end_date: b.end_date,
        year: b.year,
        month: b.month,
      };
    });

    let filteredRows = allRows.filter(isBatchInDateRange);
    if (selectedBatch) {
      filteredRows = filteredRows.filter(
        (r) => r.rawLabel.toLowerCase() === selectedBatch.toLowerCase()
      );
    }

    const rows = filteredRows;
    const periodLabel = getFormattedReportRange(`AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`);

    const totEnrolled = rows.reduce((s, r) => s + (r.enrolled || 0), 0);
    const totGrad = rows.reduce((s, r) => s + (r.graduates || 0), 0);
    const totAss = rows.reduce((s, r) => s + (r.assessed || 0), 0);
    const totCert = rows.reduce((s, r) => s + (r.certified || 0), 0);
    const totEmp = rows.reduce((s, r) => s + (r.employed || 0), 0);

    const courseOptions = trainerCourses.length
      ? trainerCourses
          .map(
            (c) =>
              `<option value="${escapeHtml(c)}" ${
                c.toLowerCase().trim() === selectedCourse.toLowerCase().trim() ? "selected" : ""
              }>${escapeHtml(c)}</option>`
          )
          .join("")
      : `<option value="">No qualifications assigned</option>`;

    const batchOptions = [
      `<option value="" ${!selectedBatch ? "selected" : ""}>All Batches (${availableBatchesForCourse.length})</option>`,
      ...availableBatchesForCourse.map(
        (b) => `<option value="${escapeHtml(b)}" ${b.toLowerCase() === selectedBatch.toLowerCase() ? "selected" : ""}>${escapeHtml(b)}</option>`
      ),
    ].join("");

    return `
      <!-- Toolbar Controls (Hidden on Print) -->
      <div class="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white no-print">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div class="d-flex align-items-center gap-3 flex-wrap">
            <div class="d-flex align-items-center gap-2">
              <label class="fw-bold mb-0 text-dark small" for="egace-course-select">
                <i class="bi bi-mortarboard-fill text-success me-1"></i>Trainer Assigned Qualification:
              </label>
              <select id="egace-course-select" class="form-select form-select-sm w-auto fw-bold text-dark border-secondary-subtle">
                ${courseOptions}
              </select>
            </div>

            <div class="vr text-secondary d-none d-sm-block" style="height: 24px;"></div>

            <div class="d-flex align-items-center gap-2">
              <label class="fw-bold mb-0 text-dark small" for="egace-batch-select">
                <i class="bi bi-collection-fill text-success me-1"></i>Batch Number / Label:
              </label>
              <select id="egace-batch-select" class="form-select form-select-sm w-auto fw-bold text-dark border-secondary-subtle">
                ${batchOptions}
              </select>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-1.5 rounded-pill fs-8 fw-semibold">
              <i class="bi bi-person-check-fill me-1"></i>Trainer: ${escapeHtml(preparedByName)}
            </span>
          </div>
        </div>
      </div>

      <!-- Printable Official Document Area -->
      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderOfficialVtiacHeader()}

        <div class="text-center my-3">
          <h3 class="fw-bold text-dark text-uppercase mb-0" style="font-family: 'Times New Roman', serif, sans-serif; letter-spacing: 1.5px; font-size: 1.45rem;">
            EGACE
          </h3>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-3 text-start flex-wrap gap-2">
          <div>
            <span class="text-dark d-block" style="font-size: 0.95rem;">
              Qualification: <strong class="text-uppercase text-decoration-underline">${escapeHtml(selectedCourse || "No Program Selected")}</strong>
            </span>
            ${
              selectedBatch
                ? `<span class="text-dark small fw-semibold">Batch: <strong class="text-uppercase text-decoration-underline">${escapeHtml(selectedBatch)}</strong></span>`
                : ""
            }
          </div>
          <span class="text-dark small fw-semibold">
            Report Range: <strong class="text-dark text-decoration-underline">${escapeHtml(periodLabel)}</strong>
          </span>
        </div>

        <div class="table-responsive w-100" style="overflow: visible;">
          <table class="official-vtiac-table w-100" style="table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th rowspan="2" style="width: 15%;"></th>
                <th colspan="2" class="text-center" style="width: 17%;">ENROLLED</th>
                <th colspan="2" class="text-center" style="width: 17%;">GRADUATES</th>
                <th colspan="2" class="text-center" style="width: 17%;">ASSESSED</th>
                <th colspan="2" class="text-center" style="width: 17%;">CERTIFIED</th>
                <th colspan="2" class="text-center" style="width: 17%;">EMPLOYED</th>
              </tr>
              <tr>
                <th class="text-center" style="width: 11%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 6%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 11%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 6%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 11%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 6%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 11%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 6%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 11%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 6%; white-space: nowrap;">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows
                      .map((r) => {
                        const enr = r.enrolled || 0;
                        const gPct = enr ? Math.round(((r.graduates || 0) / enr) * 100) + "%" : "—";
                        const aPct = enr ? Math.round(((r.assessed || 0) / enr) * 100) + "%" : "—";
                        const cPct = enr ? Math.round(((r.certified || 0) / enr) * 100) + "%" : "—";
                        const ePct = enr && r.employed !== null ? Math.round(((r.employed || 0) / enr) * 100) + "%" : "—";
                        return `
                          <tr>
                            <td class="fw-bold text-start ps-3 col-plain">${escapeHtml(r.label)}</td>
                            <td>${enr}</td>
                            <td>${enr ? "100%" : "—"}</td>
                            <td>${r.graduates ?? 0}</td>
                            <td>${gPct}</td>
                            <td>${r.assessed ?? 0}</td>
                            <td>${aPct}</td>
                            <td>${r.certified ?? 0}</td>
                            <td>${cPct}</td>
                            <td>${r.employed !== null ? r.employed : "—"}</td>
                            <td>${ePct}</td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `
                    <tr>
                      <td colspan="11" class="text-center py-4 text-muted col-plain">
                        No batch records recorded for ${escapeHtml(selectedCourse || "this qualification")} within ${escapeHtml(periodLabel)}.
                      </td>
                    </tr>
                  `
              }
            </tbody>
            <tfoot>
              <tr>
                <td class="fw-bold text-start ps-3">TOTAL</td>
                <td>${totEnrolled}</td>
                <td>${totEnrolled ? "100%" : "—"}</td>
                <td>${totGrad}</td>
                <td>${totEnrolled ? Math.round((totGrad / totEnrolled) * 100) + "%" : "—"}</td>
                <td>${totAss}</td>
                <td>${totEnrolled ? Math.round((totAss / totEnrolled) * 100) + "%" : "—"}</td>
                <td>${totCert}</td>
                <td>${totEnrolled ? Math.round((totCert / totEnrolled) * 100) + "%" : "—"}</td>
                <td>${totEmp}</td>
                <td>${totEnrolled ? Math.round((totEmp / totEnrolled) * 100) + "%" : "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${renderOfficialSignatureBlock()}
      </div>
    `;
  }

  function attachEvents() {
    const courseSelect = document.getElementById("egace-course-select");
    courseSelect?.addEventListener("change", (e) => {
      selectedCourse = e.target.value;
      selectedBatch = "";
      renderContent();
    });

    const batchSelect = document.getElementById("egace-batch-select");
    batchSelect?.addEventListener("change", (e) => {
      selectedBatch = e.target.value;
      renderContent();
    });

    const prepNameInput = document.getElementById("report-prepared-by-name");
    const prepTitleInput = document.getElementById("report-prepared-by-title");
    const appNameInput = document.getElementById("report-approved-by-name");
    const appTitleInput = document.getElementById("report-approved-by-title");

    prepNameInput?.addEventListener("input", (e) => {
      preparedByName = e.target.value;
      try { localStorage.setItem(PREPARED_NAME_STORAGE, preparedByName); } catch (_) {}
    });
    prepTitleInput?.addEventListener("input", (e) => {
      preparedByTitle = e.target.value;
      try { localStorage.setItem(PREPARED_TITLE_STORAGE, preparedByTitle); } catch (_) {}
    });
    appNameInput?.addEventListener("input", (e) => {
      approvedByName = e.target.value;
      try { localStorage.setItem(APPROVED_NAME_STORAGE, approvedByName); } catch (_) {}
    });
    appTitleInput?.addEventListener("input", (e) => {
      approvedByTitle = e.target.value;
      try { localStorage.setItem(APPROVED_TITLE_STORAGE, approvedByTitle); } catch (_) {}
    });
  }

  function renderContent() {
    contentEl.innerHTML = renderEgaceReport();
    attachEvents();
  }

  const printOfficialBtn = document.getElementById("print-official-report-btn");
  printOfficialBtn?.addEventListener("click", () => {
    window.print();
  });

  const exportExcelBtn = document.getElementById("export-excel-btn");
  exportExcelBtn?.addEventListener("click", () => {
    let batches = (rawBatchesData || []).filter(
      (b) => b.course_name?.toLowerCase().trim() === selectedCourse.toLowerCase().trim()
    );
    if (selectedBatch) {
      batches = batches.filter(
        (b) => (b.batch_label || "").trim().toLowerCase() === selectedBatch.toLowerCase()
      );
    }
    const rows = batches.map((b, idx) => ({
      batch: b.batch_label || `Batch ${idx + 1}`,
      enrolled: b.students_count || 0,
      graduates: b.graduates || 0,
      assessed: b.assessed || 0,
      certified: b.certified || 0,
      employed: b.employed || 0,
    }));

    const lines = [
      ["Batch", "Enrolled", "Graduates", "Assessed", "Certified", "Employed"].join(","),
      ...rows.map((r) => [r.batch, r.enrolled, r.graduates, r.assessed, r.certified, r.employed].join(",")),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const batchSuffix = selectedBatch ? `_${selectedBatch.replace(/[^a-zA-Z0-9]/g, "_")}` : "";
    a.download = `EGACE_${selectedCourse.replace(/[^a-zA-Z0-9]/g, "_")}${batchSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  initDateFilterControls();
  renderContent();
});
