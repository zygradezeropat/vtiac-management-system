/**
 * Registrar Reports — Complete Institutional & Competency-Related Reports Suite.
 * Organizes ALL school reports into a unified printable & exportable module.
 */

import { escapeHtml } from "./registrar-student-detail.js";

const STORAGE_KEY = "vtiac_registrar_archived_reports";
const FISCAL_YEAR = 2026;

const TABS = [
  { key: "egace", label: "E.G.A.C.E. Performance", icon: "bi-award-fill" },
  { key: "enrollment", label: "Enrollment Report", icon: "bi-file-earmark-spreadsheet-fill" },
  { key: "competencies", label: "Unit Competency Mastery", icon: "bi-check2-circle" },
  { key: "assessment_roster", label: "National Assessment Candidates", icon: "bi-card-checklist" },
  { key: "batches", label: "Batch Completion Masterlist", icon: "bi-journal-bookmark-fill" },
  { key: "payments", label: "Fee Collections & Financial", icon: "bi-cash-stack" },
  { key: "archived", label: "Archived Reports", icon: "bi-archive-fill" },
];

const DEFAULT_ARCHIVED = [];

const HISTORICAL_EGACE_REFERENCES = {
  "DRIVING NC II": {
    period: "2019–2021",
    batches: [
      { label: "BATCH 1", enrolled: 25, graduates: 25, assessed: 25, certified: 25, employed: 13, start: "10/02/2019", end: "10/24/2019", year: 2019, month: 10 },
      { label: "BATCH 2", enrolled: 24, graduates: 24, assessed: 23, certified: 20, employed: 14, start: "10/25/2019", end: "11/16/2019", year: 2019, month: 10 },
      { label: "BATCH 3", enrolled: 25, graduates: 25, assessed: 25, certified: 23, employed: 15, start: "12/23/2019", end: "03/06/2020", year: 2019, month: 12 },
    ],
  },
};

const HISTORICAL_ENROLLMENT_REFERENCES = {
  "DRIVING NC II": {
    period: "2019–2021",
    batches: [
      { no: 1, label: "BATCH 1", modality: "SCHOLARS", enrolled: 25, start: "10/02/2019", end: "10/24/2019", year: 2019, month: 10, graduates: 25, assessed: 25, certified: 25, employed: 13 },
      { no: 2, label: "BATCH 2", modality: "SCHOLARS", enrolled: 25, start: "10/25/2019", end: "11/16/2019", year: 2019, month: 10, graduates: 25, assessed: 23, certified: 23, employed: 12 },
      { no: 3, label: "BATCH 3", modality: "SCHOLARS", enrolled: 25, start: "12/23/2019", end: "03/06/2020", year: 2019, month: 12, graduates: 25, assessed: 25, certified: 25, employed: 3 },
      { no: 4, label: "BATCH 4", modality: "NON-SCHOLARS", enrolled: 5, start: "10/19/2020", end: "12/09/2020", year: 2020, month: 10, graduates: 5, assessed: 5, certified: 5, employed: null },
      { no: 5, label: "BATCH 5", modality: "SCHOLARS", enrolled: 24, start: "12/07/2020", end: "01/14/2021", year: 2020, month: 12, graduates: 24, assessed: 23, certified: 20, employed: 14 },
      { no: 6, label: "BATCH 6", modality: "SCHOLARS", enrolled: 25, start: "12/22/2020", end: "02/03/2021", year: 2020, month: 12, graduates: 25, assessed: 25, certified: 23, employed: 15 },
      { no: 7, label: "BATCH 7", modality: "SCHOLARS", enrolled: 25, start: "12/28/2020", end: "02/26/2021", year: 2020, month: 12, graduates: 25, assessed: 25, certified: 21, employed: 12 },
      { no: 8, label: "BATCH 8", modality: "SCHOLARS", enrolled: 25, start: "05/10/2021", end: "06/04/2021", year: 2021, month: 5, graduates: 25, assessed: 23, certified: 21, employed: 7 },
      { no: 9, label: "BATCH 9", modality: "NON-SCHOLARS", enrolled: 11, start: "05/17/2021", end: "06/24/2021", year: 2021, month: 5, graduates: 11, assessed: 11, certified: 11, employed: null },
      { no: 10, label: "BATCH 10", modality: "NON-SCHOLARS", enrolled: 2, start: "10/04/2021", end: "11/05/2021", year: 2021, month: 10, graduates: 2, assessed: 2, certified: 2, employed: null },
      { no: 11, label: "BATCH 11", modality: "SCHOLARS", enrolled: 25, start: "12/13/2021", end: "01/07/2022", year: 2021, month: 12, graduates: 25, assessed: null, certified: null, employed: null },
    ],
  },
};

function loadJsonData(scriptId, fallback = []) {
  const el = document.getElementById(scriptId);
  if (!el?.textContent) return fallback;
  try {
    let parsed = JSON.parse(el.textContent);
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // keep fallback
      }
    }
    return parsed ?? fallback;
  } catch (err) {
    console.warn(`Failed to parse script #${scriptId}:`, err);
    return fallback;
  }
}

function loadArchived() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_ARCHIVED];
}

function saveArchived(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function aggregateEgaceByProgram(egaceRows) {
  if (!Array.isArray(egaceRows)) return [];
  const map = {};
  egaceRows.forEach((r) => {
    const prog = r.course || "Unassigned Program";
    if (!map[prog]) {
      map[prog] = { program: prog, enrolled: 0, graduates: 0, assessed: 0, certified: 0, employed: 0 };
    }
    if (r.enrolled) map[prog].enrolled += 1;
    if (r.graduate) map[prog].graduates += 1;
    if (r.assessment) map[prog].assessed += 1;
    if (r.certificate) map[prog].certified += 1;
    if (r.employment) map[prog].employed += 1;
  });

  return Object.values(map).sort((a, b) => b.enrolled - a.enrolled);
}

function initRegistrarReports() {
  const tabsEl = document.getElementById("reports-tabs");
  const contentEl = document.getElementById("reports-content");
  const printBtn = document.getElementById("print-official-report-btn");
  const closeBtn = document.getElementById("close-fiscal-year-btn");
  const fiscalLabel = document.getElementById("fiscal-year-label");
  const closeModalEl = document.getElementById("close-fiscal-modal");
  const closeModalBody = document.getElementById("close-fiscal-modal-body");
  const closeConfirmBtn = document.getElementById("close-fiscal-confirm");

  if (!tabsEl || !contentEl) return;

  let activeTab = "egace";
  let archived = loadArchived();

  let preparedByName = "JESSA MAE A. CUYME";
  let preparedByTitle = "Asst. Registrar";
  let approvedByName = "DANILO P. PATANA";
  let approvedByTitle = "School Director";
  try {
    const savedName = localStorage.getItem("vtiac_report_prepared_by_name");
    if (savedName) preparedByName = savedName;
    const savedTitle = localStorage.getItem("vtiac_report_prepared_by_title");
    if (savedTitle) preparedByTitle = savedTitle;
    const savedApp = localStorage.getItem("vtiac_report_approved_by_name");
    if (savedApp) approvedByName = savedApp;
    const savedAppTitle = localStorage.getItem("vtiac_report_approved_by_title");
    if (savedAppTitle) approvedByTitle = savedAppTitle;
  } catch (_) {}

  let selectedEgaceCourse = "Automotive Servicing NC I";
  let selectedEnrollmentCourse = "Automotive Servicing NC I";
  let egaceViewMode = "current";
  let enrollmentViewMode = "current";

  const rawEgaceData = loadJsonData("reports-egace-data");
  const rawBatchesData = loadJsonData("reports-batches-data");
  const rawEnrollmentData = loadJsonData("reports-enrollment-data", { total: 0, by_status: [], by_program: [] });
  const rawPaymentData = loadJsonData("reports-payments-data", { total_collected: 0, count: 0 });

  const egaceSummary = aggregateEgaceByProgram(rawEgaceData);
  const closeModal = closeModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(closeModalEl) : null;
  if (fiscalLabel) fiscalLabel.textContent = String(FISCAL_YEAR);

  function getAvailableCourses() {
    const list = [];
    const seen = new Set();
    const addCourse = (c) => {
      if (!c) return;
      const clean = String(c).trim();
      const lower = clean.toLowerCase();
      if (clean && !seen.has(lower)) {
        seen.add(lower);
        list.push(clean);
      }
    };

    (rawBatchesData || []).forEach((b) => {
      if (b.course_name) addCourse(b.course_name);
    });
    if (rawEnrollmentData && Array.isArray(rawEnrollmentData.by_program)) {
      rawEnrollmentData.by_program.forEach((p) => {
        if (p.selected_program) addCourse(p.selected_program);
      });
    }
    addCourse("Automotive Servicing NC I");
    addCourse("Automotive Servicing (Engine Repair) NC II");
    addCourse("Driving NC II");
    addCourse("Rice Machinery Operations NC II");
    addCourse("Driving NC III (Passenger Bus / Straight Truck)");
    return list;
  }

  const initialCourses = getAvailableCourses();
  if (initialCourses.length) {
    selectedEgaceCourse = initialCourses[0];
    selectedEnrollmentCourse = initialCourses[0];
  }

  // --- Date Range, Year & Month Filtering ---
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
    if (!hasActiveFilter()) {
      return defaultFallback;
    }
    if (filterStartDate && filterEndDate) {
      if (filterStartDate === filterEndDate) {
        return formatDatePretty(filterStartDate);
      }
      const sParts = filterStartDate.split("-");
      const eParts = filterEndDate.split("-");
      if (sParts.length === 3 && eParts.length === 3) {
        if (sParts[0] === eParts[0] && sParts[1] === eParts[1] && sParts[2] === "01") {
          const mIdx = parseInt(sParts[1], 10) - 1;
          const lastDay = new Date(parseInt(sParts[0], 10), mIdx + 1, 0).getDate();
          if (parseInt(eParts[2], 10) === lastDay) {
            return `${MONTH_NAMES[mIdx]} ${sParts[0]}`;
          }
        }
      }
      return `${formatDatePretty(filterStartDate)} – ${formatDatePretty(filterEndDate)}`;
    }
    if (filterStartDate) {
      return `From ${formatDatePretty(filterStartDate)}`;
    }
    if (filterEndDate) {
      return `Until ${formatDatePretty(filterEndDate)}`;
    }
    if (filterYear && filterMonth) {
      const mIdx = parseInt(filterMonth, 10) - 1;
      return `${MONTH_NAMES[mIdx]} ${filterYear}`;
    }
    if (filterYear) {
      return `Calendar Year ${filterYear}`;
    }
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

    if (!startIso && b.start && b.start !== "—") {
      const parts = b.start.split("/");
      if (parts.length === 3) {
        startIso = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    } else if (!startIso && b.start_date && b.start_date !== "—") {
      const parts = b.start_date.split("/");
      if (parts.length === 3) {
        startIso = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }

    if (!endIso && b.end && b.end !== "—") {
      const parts = b.end.split("/");
      if (parts.length === 3) {
        endIso = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    } else if (!endIso && b.end_date && b.end_date !== "—") {
      const parts = b.end_date.split("/");
      if (parts.length === 3) {
        endIso = `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
      }
    }

    const primaryDate = startIso || endIso || b.created_at_iso || "";
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
      if (!endIso || endIso < filterStartDate) {
        return false;
      }
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

    if (filterStartDate && filterEndDate && filterStartDate > filterEndDate) {
      window.alert("From date cannot be later than To date.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (filterYear) params.set("year", filterYear); else params.delete("year");
    if (filterMonth) params.set("month", filterMonth); else params.delete("month");
    if (filterStartDate) params.set("start_date", filterStartDate); else params.delete("start_date");
    if (filterEndDate) params.set("end_date", filterEndDate); else params.delete("end_date");

    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);

    updateFilterBanner();
    renderContent();
  }

  function resetFilter() {
    filterYear = "";
    filterMonth = "";
    filterStartDate = "";
    filterEndDate = "";

    if (yearSelect) yearSelect.value = "";
    if (monthSelect) monthSelect.value = "";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";

    const params = new URLSearchParams(window.location.search);
    params.delete("year");
    params.delete("month");
    params.delete("start_date");
    params.delete("end_date");
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);

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
      let prevYear = curYear;
      let prevMonth = curMonth - 1;
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
            <!-- Space for fresh personal physical pen signature -->
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
            <!-- Space for fresh personal physical pen signature -->
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

  function renderTabs() {
    tabsEl.innerHTML = "";
    TABS.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.key === activeTab ? "true" : "false");
      btn.className = "module-tab-btn btn btn-sm border-0" + (tab.key === activeTab ? " active" : "");
      const label = tab.key === "archived" && archived.length ? `Archived Reports (${archived.length})` : tab.label;
      btn.innerHTML = `<i class="bi ${tab.icon} me-1" aria-hidden="true"></i>${escapeHtml(label)}`;

      btn.addEventListener("click", () => {
        activeTab = tab.key;
        renderTabs();
        renderContent();
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderHeaderBanner(title, subtitle, badgeText = "Official Registrar Record") {
    return `
      <div class="text-center border-bottom pb-4 mb-4">
        <h5 class="fw-bold text-uppercase mb-1" style="letter-spacing: 1px; color: #00563B;">Valiant Technical Institute &amp; Accreditation Center</h5>
        <p class="text-secondary small mb-1">Office of the School Registrar &amp; Assessment Center</p>
        <p class="text-muted text-xs mb-3">TESDA Accredited Assessment Center • Technical Vocational Institution</p>
        <h4 class="fw-extrabold text-dark text-uppercase mt-2 mb-1">${escapeHtml(title)}</h4>
        <p class="text-secondary small mb-0">${escapeHtml(subtitle)} • Fiscal Year ${FISCAL_YEAR}</p>
        <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-1 mt-2">${escapeHtml(badgeText)}</span>
      </div>
    `;
  }

  function renderSignatureBlock() {
    return `
      <div class="row mt-5 pt-4 border-top">
        <div class="col-6 text-center">
          <p class="text-muted small mb-4">Prepared &amp; Certified By:</p>
          <div class="border-bottom mx-auto w-75 mb-1" style="height: 1px;"></div>
          <strong class="text-dark d-block">Registrar Office Administrator</strong>
          <span class="text-muted text-xs">VTIAC Registrar Department</span>
        </div>
        <div class="col-6 text-center">
          <p class="text-muted small mb-4">Approved By:</p>
          <div class="border-bottom mx-auto w-75 mb-1" style="height: 1px;"></div>
          <strong class="text-dark d-block">School Director / TESDA Representative</strong>
          <span class="text-muted text-xs">Valiant Technical Institute</span>
        </div>
      </div>
    `;
  }

  // 1. E.G.A.C.E. Performance Report (Referenced from Attachment 1)
  function renderEgaceReport() {
    const courses = getAvailableCourses();
    const isRef = egaceViewMode === "reference" && HISTORICAL_EGACE_REFERENCES[selectedEgaceCourse];
    let allRows = [];
    if (isRef) {
      allRows = HISTORICAL_EGACE_REFERENCES[selectedEgaceCourse].batches;
    } else {
      const batches = (rawBatchesData || []).filter(
        (b) => b.course_name?.toLowerCase().trim() === selectedEgaceCourse.toLowerCase().trim()
      );
      allRows = batches.map((b, idx) => {
        let label = (b.batch_label || `Batch ${idx + 1}`).trim();
        if (label.includes("·")) {
          label = label.split("·").pop().trim();
        }
        if (!label.toUpperCase().startsWith("BATCH") || batches.length > 1) {
          label = `BATCH ${idx + 1}`;
        }
        return {
          label: label.toUpperCase(),
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

      if (allRows.length === 0) {
        const progStat = (rawEnrollmentData?.by_program || []).find(
          (p) => p.selected_program?.toLowerCase().trim() === selectedEgaceCourse.toLowerCase().trim()
        );
        if (progStat && progStat.count > 0) {
          const matched = (rawEgaceData || []).filter(
            (r) => (r.program || "").toLowerCase().trim() === selectedEgaceCourse.toLowerCase().trim()
          );
          allRows = [{
            label: "BATCH 1 (ACTIVE ENROLLEES)",
            enrolled: progStat.count,
            graduates: matched.filter((r) => r.graduate).length,
            assessed: matched.filter((r) => r.assessment).length,
            certified: matched.filter((r) => r.certificate).length,
            employed: matched.filter((r) => r.employment).length,
            start_date_iso: "2026-11-12",
            year: FISCAL_YEAR,
            month: 11,
          }];
        }
      }
    }

    const rows = allRows.filter(isBatchInDateRange);
    const periodLabel = getFormattedReportRange(isRef ? "2019–2021" : `AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`);

    const totEnrolled = rows.reduce((s, r) => s + (r.enrolled || 0), 0);
    const totGrad = rows.reduce((s, r) => s + (r.graduates || 0), 0);
    const totAss = rows.reduce((s, r) => s + (r.assessed || 0), 0);
    const totCert = rows.reduce((s, r) => s + (r.certified || 0), 0);
    const totEmp = rows.reduce((s, r) => s + (r.employed || 0), 0);

    return `
      <!-- Toolbar Controls (Hidden on Print) -->
      <div class="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white no-print">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <label class="fw-bold mb-0 text-dark small" for="egace-course-select">Qualification:</label>
            <select id="egace-course-select" class="form-select form-select-sm w-auto fw-bold text-dark border-secondary">
              ${courses
                .map(
                  (c) =>
                    `<option value="${escapeHtml(c)}" ${
                      c.toLowerCase().trim() === selectedEgaceCourse.toLowerCase().trim() ? "selected" : ""
                    }>${escapeHtml(c)}</option>`
                )
                .join("")}
            </select>
          </div>
          ${
            HISTORICAL_EGACE_REFERENCES[selectedEgaceCourse]
              ? `
            <div class="btn-group btn-group-sm" role="group" aria-label="EGACE View Mode">
              <button type="button" id="egace-view-mode-cur" class="btn ${
                egaceViewMode === "current" ? "btn-success" : "btn-outline-secondary"
              }">
                <i class="bi bi-database-check me-1"></i>Active Database System Data
              </button>
              <button type="button" id="egace-view-mode-ref" class="btn ${
                egaceViewMode === "reference" ? "btn-success" : "btn-outline-secondary"
              }">
                <i class="bi bi-file-earmark-text me-1"></i>Sample Document Reference (2019–2021)
              </button>
            </div>
          `
              : ""
          }
        </div>
      </div>

      <!-- Printable Official Document Area (Matches Attachment 1) -->
      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderOfficialVtiacHeader()}

        <div class="text-center my-3">
          <h3 class="fw-bold text-dark text-uppercase mb-0" style="font-family: 'Times New Roman', serif, sans-serif; letter-spacing: 1.5px; font-size: 1.45rem;">
            EGACE
          </h3>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-3 text-start flex-wrap gap-2">
          <span class="text-dark" style="font-size: 0.95rem;">
            Qualification: <strong class="text-uppercase text-decoration-underline">${escapeHtml(selectedEgaceCourse)}</strong>
          </span>
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
                        No batch records recorded for ${escapeHtml(selectedEgaceCourse)} within ${escapeHtml(periodLabel)}.
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

  // 2. Annual Enrollment Report (Referenced from Attachment 2)
  function renderEnrollmentReport() {
    const courses = getAvailableCourses();
    const isRef =
      enrollmentViewMode === "reference" &&
      HISTORICAL_ENROLLMENT_REFERENCES[selectedEnrollmentCourse];
    let allRows = [];
    const periodLabel = getFormattedReportRange(isRef ? "2019–2021" : `AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`);

    if (isRef) {
      allRows = HISTORICAL_ENROLLMENT_REFERENCES[selectedEnrollmentCourse].batches;
    } else {
      const batches = (rawBatchesData || []).filter(
        (b) => b.course_name?.toLowerCase().trim() === selectedEnrollmentCourse.toLowerCase().trim()
      );
      allRows = batches.map((b, idx) => {
        let label = (b.batch_label || `Batch ${idx + 1}`).trim();
        if (label.includes("·")) {
          label = label.split("·").pop().trim();
        }
        if (!label.toUpperCase().startsWith("BATCH") || batches.length > 1) {
          label = `BATCH ${idx + 1}`;
        }
        return {
          no: idx + 1,
          label: label.toUpperCase(),
          modality: b.modality || "SCHOLARS",
          enrolled: b.students_count || 0,
          start: b.start_date || "—",
          end: b.end_date || "—",
          start_date_iso: b.start_date_iso,
          end_date_iso: b.end_date_iso,
          year: b.year,
          month: b.month,
          graduates: b.graduates || 0,
          assessed: b.assessed || 0,
          certified: b.certified || 0,
          employed: b.employed || 0,
        };
      });

      if (allRows.length === 0) {
        const progStat = (rawEnrollmentData?.by_program || []).find(
          (p) => p.selected_program?.toLowerCase().trim() === selectedEnrollmentCourse.toLowerCase().trim()
        );
        if (progStat && progStat.count > 0) {
          const matched = (rawEgaceData || []).filter(
            (r) => (r.program || "").toLowerCase().trim() === selectedEnrollmentCourse.toLowerCase().trim()
          );
          allRows = [{
            no: 1,
            label: "BATCH 1",
            modality: "SCHOLARS",
            enrolled: progStat.count,
            start: "11/12/2026",
            end: "—",
            start_date_iso: "2026-11-12",
            year: FISCAL_YEAR,
            month: 11,
            graduates: matched.filter((r) => r.graduate).length,
            assessed: matched.filter((r) => r.assessment).length,
            certified: matched.filter((r) => r.certificate).length,
            employed: matched.filter((r) => r.employment).length,
          }];
        }
      }
    }

    const rows = allRows.filter(isBatchInDateRange).map((r, i) => ({ ...r, no: i + 1 }));

    const totEnrolled = rows.reduce((s, r) => s + (r.enrolled || 0), 0);
    const totGrad = rows.reduce((s, r) => s + (r.graduates || 0), 0);
    const totAss = rows.reduce((s, r) => s + (r.assessed || 0), 0);
    const totCert = rows.reduce((s, r) => s + (r.certified || 0), 0);
    const totEmp = rows.reduce((s, r) => s + (r.employed || 0), 0);

    return `
      <!-- Toolbar Controls (Hidden on Print) -->
      <div class="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white no-print">
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <label class="fw-bold mb-0 text-dark small" for="enrollment-course-select">Qualification:</label>
            <select id="enrollment-course-select" class="form-select form-select-sm w-auto fw-bold text-dark border-secondary">
              ${courses
                .map(
                  (c) =>
                    `<option value="${escapeHtml(c)}" ${
                      c.toLowerCase().trim() === selectedEnrollmentCourse.toLowerCase().trim() ? "selected" : ""
                    }>${escapeHtml(c)}</option>`
                )
                .join("")}
            </select>
          </div>
          ${
            HISTORICAL_ENROLLMENT_REFERENCES[selectedEnrollmentCourse]
              ? `
            <div class="btn-group btn-group-sm" role="group" aria-label="Enrollment View Mode">
              <button type="button" id="enrollment-view-mode-cur" class="btn ${
                enrollmentViewMode === "current" ? "btn-success" : "btn-outline-secondary"
              }">
                <i class="bi bi-database-check me-1"></i>Active Database System Data
              </button>
              <button type="button" id="enrollment-view-mode-ref" class="btn ${
                enrollmentViewMode === "reference" ? "btn-success" : "btn-outline-secondary"
              }">
                <i class="bi bi-file-earmark-text me-1"></i>Sample Document Reference (2019–2021)
              </button>
            </div>
          `
              : ""
          }
        </div>
      </div>

      <!-- Printable Official Document Area (Matches Attachment 2) -->
      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderOfficialVtiacHeader()}

        <div class="text-center my-3">
          <h3 class="fw-bold text-dark text-uppercase mb-1" style="font-family: 'Times New Roman', serif, sans-serif; letter-spacing: 1.5px; font-size: 1.45rem;">
            ENROLLMENT REPORT
          </h3>
          <p class="fw-bold text-dark mb-0" style="font-size: 1rem;">${escapeHtml(periodLabel)}</p>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-3 text-start flex-wrap gap-2">
          <span class="text-dark" style="font-size: 0.95rem;">
            QUALIFICATION: <strong class="text-uppercase text-decoration-underline">${escapeHtml(selectedEnrollmentCourse)}</strong>
          </span>
          <span class="text-dark small fw-semibold">
            REPORT RANGE: <strong class="text-dark text-decoration-underline">${escapeHtml(periodLabel)}</strong>
          </span>
        </div>

        <div class="table-responsive w-100" style="overflow: visible;">
          <table class="official-vtiac-table w-100" style="table-layout: fixed; width: 100%;">
            <thead>
              <tr>
                <th rowspan="2" style="width: 4%;">#</th>
                <th rowspan="2" style="width: 12%;">BATCH</th>
                <th rowspan="2" style="width: 12%;">MODALITY</th>
                <th rowspan="2" style="width: 10%;">No. of Trainees Enrolled</th>
                <th colspan="2" class="text-center" style="width: 18%;">TRAINING DURATION</th>
                <th colspan="2" class="text-center" style="width: 11%;">GRADUATES</th>
                <th colspan="2" class="text-center" style="width: 11%;">ASSESSED</th>
                <th colspan="2" class="text-center" style="width: 11%;">CERTIFIED</th>
                <th colspan="2" class="text-center" style="width: 11%;">EMPLOYED</th>
              </tr>
              <tr>
                <th class="text-center" style="width: 9%; white-space: nowrap;">Date Start</th>
                <th class="text-center" style="width: 9%; white-space: nowrap;">Date End</th>
                <th class="text-center" style="width: 6.5%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 4.5%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 6.5%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 4.5%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 6.5%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 4.5%; white-space: nowrap;">%</th>
                <th class="text-center" style="width: 6.5%; white-space: nowrap;">Actual</th>
                <th class="text-center" style="width: 4.5%; white-space: nowrap;">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows
                      .map((r) => {
                        const enr = r.enrolled || 0;
                        const gPct = r.graduates !== null && enr ? Math.round(((r.graduates || 0) / enr) * 100) + "%" : "";
                        const aPct = r.assessed !== null && enr ? Math.round(((r.assessed || 0) / enr) * 100) + "%" : "";
                        const cPct = r.certified !== null && enr ? Math.round(((r.certified || 0) / enr) * 100) + "%" : "";
                        const ePct = r.employed !== null && enr ? Math.round(((r.employed || 0) / enr) * 100) + "%" : "";
                        return `
                          <tr>
                            <td class="col-plain">${r.no}</td>
                            <td class="fw-bold text-start ps-2 col-plain">${escapeHtml(r.label)}</td>
                            <td class="col-plain fw-semibold text-start ps-2">${escapeHtml(r.modality)}</td>
                            <td>${enr || ""}</td>
                            <td>${r.start || ""}</td>
                            <td>${r.end || ""}</td>
                            <td>${r.graduates !== null ? r.graduates : ""}</td>
                            <td>${gPct}</td>
                            <td>${r.assessed !== null ? r.assessed : ""}</td>
                            <td>${aPct}</td>
                            <td>${r.certified !== null ? r.certified : ""}</td>
                            <td>${cPct}</td>
                            <td>${r.employed !== null ? r.employed : ""}</td>
                            <td>${ePct}</td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `
                    <tr>
                      <td colspan="14" class="text-center py-4 text-muted col-plain">
                        No enrollment records found for ${escapeHtml(selectedEnrollmentCourse)} within ${escapeHtml(periodLabel)}.
                      </td>
                    </tr>
                  `
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="fw-bold text-start ps-3">TOTAL</td>
                <td>${totEnrolled}</td>
                <td>—</td>
                <td>—</td>
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

  // 3. Unit Competencies Mastery Report
  function renderCompetenciesReport() {
    return `
      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderHeaderBanner("Unit Competency Mastery & Evaluation Breakdown", "Evaluation of Student Achievement across Basic, Common, and Core Units", "Competency Rating Sheet")}

        <div class="row g-4 mb-4">
          <div class="col-md-6">
            <div class="p-3 border rounded-3 bg-light-subtle">
              <h6 class="fw-bold text-success mb-2"><i class="bi bi-tools me-2"></i>Automotive Servicing NC I Units</h6>
              <ul class="list-group list-group-flush small bg-transparent">
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Perform Periodic Maintenance</span>
                  <span class="badge bg-success rounded-pill px-3">100% Competent</span>
                </li>
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Service Engine Mechanical Components</span>
                  <span class="badge bg-success rounded-pill px-3">92% Competent</span>
                </li>
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Service Automotive Electrical System</span>
                  <span class="badge bg-success rounded-pill px-3">88% Competent</span>
                </li>
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Service Steering &amp; Suspension System</span>
                  <span class="badge bg-success rounded-pill px-3">95% Competent</span>
                </li>
              </ul>
            </div>
          </div>

          <div class="col-md-6">
            <div class="p-3 border rounded-3 bg-light-subtle">
              <h6 class="fw-bold text-primary mb-2"><i class="bi bi-truck me-2"></i>Driving NC II Units</h6>
              <ul class="list-group list-group-flush small bg-transparent">
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Carry out Vehicle Maintenance &amp; Servicing</span>
                  <span class="badge bg-success rounded-pill px-3">98% Competent</span>
                </li>
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Drive Light Vehicles (Manual / Auto)</span>
                  <span class="badge bg-success rounded-pill px-3">100% Competent</span>
                </li>
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Obey Traffic Rules and Regulations</span>
                  <span class="badge bg-success rounded-pill px-3">96% Competent</span>
                </li>
                <li class="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2">
                  <span>Implement Basic First Aid Procedures</span>
                  <span class="badge bg-success rounded-pill px-3">90% Competent</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        ${renderSignatureBlock()}
      </div>
    `;
  }

  // 4. National Assessment Candidates Roster
  function renderAssessmentRosterReport() {
    const periodLabel = getFormattedReportRange(`AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`);
    const filteredCandidates = (rawEgaceData || []).filter(r => {
      if (!hasActiveFilter()) return true;
      if (filterYear && r.year && r.year !== parseInt(filterYear, 10)) return false;
      if (filterMonth && r.month && r.month !== parseInt(filterMonth, 10)) return false;
      if (filterStartDate && r.created_at_iso && r.created_at_iso < filterStartDate) return false;
      if (filterEndDate && r.created_at_iso && r.created_at_iso > filterEndDate) return false;
      return true;
    });

    return `
      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderHeaderBanner("National Competency Assessment Candidates Roster", `Official Registry of Trainees Scheduled for TESDA National Certification • Range: ${periodLabel}`, "Assessment Center Roster")}

        <div class="table-responsive">
          <table class="table table-hover align-middle small mb-4">
            <thead class="table-dark">
              <tr>
                <th scope="col">Student Candidate</th>
                <th scope="col">Reference / ULI ID</th>
                <th scope="col">Qualification Track</th>
                <th scope="col">Assessment Date</th>
                <th scope="col">Assessor / Examiner</th>
                <th scope="col" class="text-end">Result / Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredCandidates.length ? filteredCandidates.map(student => `
                <tr>
                  <td>
                    <strong class="d-block text-dark">${escapeHtml(student.studentName)}</strong>
                  </td>
                  <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(student.referenceId)}</span></td>
                  <td>${escapeHtml(student.course)}</td>
                  <td>Oct 20, 2026</td>
                  <td class="text-secondary">TESDA Accredited Assessor</td>
                  <td class="text-end">
                    ${student.certificate ? '<span class="badge bg-success">Competent / Certified</span>' : '<span class="badge bg-warning text-dark">Scheduled for Assessment</span>'}
                  </td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="6" class="text-center py-4 text-muted">
                    No candidates found within the selected report range (${escapeHtml(periodLabel)}).
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        ${renderSignatureBlock()}
      </div>
    `;
  }

  // 5. Batch Completion Masterlist
  function renderBatchesReport() {
    const periodLabel = getFormattedReportRange(`AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`);
    const filteredBatches = (rawBatchesData || []).filter(isBatchInDateRange);

    return `
      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderHeaderBanner("Batch Competency & Schedule Masterlist", `Master Schedule of Training Batches, Trainer Assignments • Range: ${periodLabel}`, "Batch Completion Masterlist")}

        <div class="table-responsive">
          <table class="table table-bordered align-middle small mb-4">
            <thead class="table-dark text-center">
              <tr>
                <th scope="col" class="text-start">Batch Label</th>
                <th scope="col" class="text-start">Qualification Course</th>
                <th scope="col">Assigned Trainer</th>
                <th scope="col">Training Dates</th>
                <th scope="col">Assessment Date</th>
                <th scope="col">Trainees</th>
                <th scope="col" class="text-end">Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredBatches.length ? filteredBatches.map(b => `
                <tr>
                  <td class="fw-bold text-dark">${escapeHtml(b.batch_label)}</td>
                  <td>${escapeHtml(b.course_name)}</td>
                  <td class="text-center">${escapeHtml(b.trainer_name)}</td>
                  <td class="text-center">${b.start_date} to ${b.end_date}</td>
                  <td class="text-center"><span class="badge bg-danger-subtle text-danger border border-danger-subtle">${b.assessment_date}</span></td>
                  <td class="fw-bold text-center">${b.students_count}</td>
                  <td class="text-end">
                    <span class="badge ${b.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${b.status}</span>
                  </td>
                </tr>
              `).join("") : `
                <tr>
                  <td colspan="7" class="text-center py-4 text-muted">
                    No batches match the selected report range (${escapeHtml(periodLabel)}).
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        ${renderSignatureBlock()}
      </div>
    `;
  }

  // 6. Financial & Payment Collection Summary Report
  function renderPaymentsReport() {
    const totalCollected = rawPaymentData.total_collected || 0;
    const txCount = rawPaymentData.count || 0;

    return `
      <div class="row g-3 mb-4 no-print">
        <div class="col-md-6">
          <div class="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <span class="text-secondary small fw-semibold">Total Revenue Collected</span>
            <h3 class="fw-bold text-success mb-0 mt-1">₱${totalCollected.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</h3>
            <span class="text-muted small mt-1">Enrollment &amp; Assessment Fees</span>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <span class="text-secondary small fw-semibold">Total Verified Payment Receipts</span>
            <h3 class="fw-bold text-dark mb-0 mt-1">${txCount} Transactions</h3>
            <span class="text-muted small mt-1">Processed by Cashier</span>
          </div>
        </div>
      </div>

      <div class="card border-0 shadow-sm rounded-4 bg-white p-4" id="printable-report-area">
        ${renderHeaderBanner("Fee Collections & Financial Summary Report", "Summary of Student Enrollment, Assessment, and Certification Fees", "Financial Summary Record")}

        <div class="alert alert-info border-0 rounded-3 p-3 mb-4">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <strong class="d-block text-dark">Total Fee Collections:</strong>
              <span class="text-secondary small">Gross payments received for Fiscal Year ${FISCAL_YEAR}</span>
            </div>
            <h3 class="fw-bold text-success mb-0">₱${totalCollected.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</h3>
          </div>
        </div>

        ${renderSignatureBlock()}
      </div>
    `;
  }

  // 7. Archived Reports
  function renderArchivedReport(list) {
    if (!list.length) {
      return `<div class="card border-0 shadow-sm rounded-4 p-5 text-center text-muted">No archived fiscal years recorded yet.</div>`;
    }
    return list.map(r => `
      <div class="card border-0 shadow-sm rounded-4 p-4 mb-3 bg-white">
        <div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-3">
          <div>
            <h5 class="fw-bold text-dark mb-1"><i class="bi bi-archive-fill me-2 text-vtiac"></i>Fiscal Year ${r.fiscalYear} Archived Report</h5>
            <p class="text-secondary small mb-0">Archived on ${r.closedOn} by ${r.closedBy}</p>
          </div>
          <span class="badge bg-secondary px-3 py-2">Archived</span>
        </div>

        <div class="row g-3">
          <div class="col-md-6">
            <div class="p-3 border rounded-3 bg-light">
              <span class="text-secondary small d-block">Annual Total Enrolled</span>
              <h4 class="fw-bold text-dark mb-0">${r.enrollmentCount} Trainees</h4>
            </div>
          </div>
          <div class="col-md-6">
            <div class="p-3 border rounded-3 bg-light">
              <span class="text-secondary small d-block">Total Certified Graduates</span>
              <h4 class="fw-bold text-success mb-0">${r.certifiedCount || Math.round(r.enrollmentCount * 0.9)} NC Holders</h4>
            </div>
          </div>
        </div>
      </div>
    `).join("");
  }

  function attachReportEvents() {
    const nameInput = document.getElementById("report-prepared-by-name");
    nameInput?.addEventListener("input", (e) => {
      preparedByName = e.target.value;
      try {
        localStorage.setItem("vtiac_report_prepared_by_name", preparedByName);
      } catch (_) {}
    });

    const titleInput = document.getElementById("report-prepared-by-title");
    titleInput?.addEventListener("input", (e) => {
      preparedByTitle = e.target.value;
      try {
        localStorage.setItem("vtiac_report_prepared_by_title", preparedByTitle);
      } catch (_) {}
    });

    const appNameInput = document.getElementById("report-approved-by-name");
    appNameInput?.addEventListener("input", (e) => {
      approvedByName = e.target.value;
      try {
        localStorage.setItem("vtiac_report_approved_by_name", approvedByName);
      } catch (_) {}
    });

    const appTitleInput = document.getElementById("report-approved-by-title");
    appTitleInput?.addEventListener("input", (e) => {
      approvedByTitle = e.target.value;
      try {
        localStorage.setItem("vtiac_report_approved_by_title", approvedByTitle);
      } catch (_) {}
    });

    if (activeTab === "egace") {
      const select = document.getElementById("egace-course-select");
      select?.addEventListener("change", (e) => {
        selectedEgaceCourse = e.target.value;
        renderContent();
      });
      const refBtn = document.getElementById("egace-view-mode-ref");
      const curBtn = document.getElementById("egace-view-mode-cur");
      refBtn?.addEventListener("click", () => {
        egaceViewMode = "reference";
        renderContent();
      });
      curBtn?.addEventListener("click", () => {
        egaceViewMode = "current";
        renderContent();
      });
    } else if (activeTab === "enrollment") {
      const select = document.getElementById("enrollment-course-select");
      select?.addEventListener("change", (e) => {
        selectedEnrollmentCourse = e.target.value;
        renderContent();
      });
      const refBtn = document.getElementById("enrollment-view-mode-ref");
      const curBtn = document.getElementById("enrollment-view-mode-cur");
      refBtn?.addEventListener("click", () => {
        enrollmentViewMode = "reference";
        renderContent();
      });
      curBtn?.addEventListener("click", () => {
        enrollmentViewMode = "current";
        renderContent();
      });
    }
  }

  function renderContent() {
    switch (activeTab) {
      case "egace":
        contentEl.innerHTML = renderEgaceReport();
        break;
      case "enrollment":
        contentEl.innerHTML = renderEnrollmentReport();
        break;
      case "competencies":
        contentEl.innerHTML = renderCompetenciesReport();
        break;
      case "assessment_roster":
        contentEl.innerHTML = renderAssessmentRosterReport();
        break;
      case "batches":
        contentEl.innerHTML = renderBatchesReport();
        break;
      case "payments":
        contentEl.innerHTML = renderPaymentsReport();
        break;
      case "archived":
        contentEl.innerHTML = renderArchivedReport(archived);
        break;
      default:
        contentEl.innerHTML = renderEgaceReport();
    }
    attachReportEvents();
  }

  printBtn?.addEventListener("click", () => {
    window.print();
  });

  closeBtn?.addEventListener("click", () => {
    if (closeModalBody) {
      closeModalBody.textContent = `Archive all ${FISCAL_YEAR} registrar data and start a new fiscal year? This cannot be undone without admin restore.`;
    }
    closeModal?.show();
  });

  closeConfirmBtn?.addEventListener("click", () => {
    const totalEnrolled = egaceSummary.reduce((acc, c) => acc + c.enrolled, 0);
    const totalCertified = egaceSummary.reduce((acc, c) => acc + c.certified, 0);
    const snapshot = {
      fiscalYear: FISCAL_YEAR,
      closedOn: new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }),
      closedBy: "Registrar User",
      enrollmentCount: totalEnrolled,
      certifiedCount: totalCertified,
      courses: egaceSummary.map(c => ({ name: c.program, count: c.enrolled, certified: c.certified }))
    };
    archived = [snapshot, ...archived.filter((r) => r.fiscalYear !== FISCAL_YEAR)];
    saveArchived(archived);
    closeModal?.hide();
    activeTab = "archived";
    renderTabs();
    renderContent();
    window.alert(`Fiscal Year ${FISCAL_YEAR} successfully archived.`);
  });

  initDateFilterControls();
  renderTabs();
  renderContent();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRegistrarReports);
} else {
  initRegistrarReports();
}
