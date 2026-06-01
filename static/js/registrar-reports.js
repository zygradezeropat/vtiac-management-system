/**
 * Registrar Reports — current year stats + archived fiscal years (demo).
 * Tabs use the same .registrar-tabs / .module-tab-btn pattern as the student module.
 */

import { escapeHtml } from "./registrar-student-detail.js";

const STORAGE_KEY = "vtiac_registrar_archived_reports";
const FISCAL_YEAR = 2026;

const TABS = [
  { key: "current", label: `Current Year (${FISCAL_YEAR})` },
  { key: "archived", label: "Archived Reports", icon: "bi-folder2" },
];

const CURRENT_YEAR_REPORT = {
  fiscalYear: FISCAL_YEAR,
  enrollmentCount: 12,
  enrollmentHint: "Students enrolled this year",
  courses: [
    { name: "Automotive Servicing NC I", count: 7 },
    { name: "Automotive Servicing (Engine Repair) NC II", count: 1 },
    { name: "Driving NC II", count: 6 },
    { name: "Rice Machinery Operations NC II", count: 2 },
    { name: "Driving NC III (Passenger Bus/Straight Truck)", count: 1 },
  ],
};

const DEFAULT_ARCHIVED = [
  {
    fiscalYear: 2025,
    closedOn: "December 31, 2025",
    closedBy: "Admin User",
    enrollmentCount: 520,
    courses: [
      { name: "Automotive Servicing NC I", count: 142 },
      { name: "Automotive Servicing (Engine Repair) NC II", count: 128 },
      { name: "Driving NC II", count: 156 },
      { name: "Rice Machinery Operations NC II", count: 94 },
    ],
  },
  {
    fiscalYear: 2024,
    closedOn: "December 31, 2024",
    closedBy: "Admin User",
    enrollmentCount: 428,
    courses: [
      { name: "Automotive Servicing NC I", count: 115 },
      { name: "Automotive Servicing (Engine Repair) NC II", count: 98 },
      { name: "Driving NC II", count: 132 },
      { name: "Rice Machinery Operations NC II", count: 83 },
    ],
  },
];

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

function maxCourseCount(courses) {
  return Math.max(...courses.map((c) => c.count), 1);
}

function renderCourseDistribution(courses) {
  const max = maxCourseCount(courses);
  return courses
    .map((c) => {
      const pct = Math.round((c.count / max) * 100);
      const label = c.count === 1 ? "1 student" : `${c.count} students`;
      return `
        <div class="registrar-reports-course">
          <div class="registrar-reports-course__head">
            <span class="registrar-reports-course__name">${escapeHtml(c.name)}</span>
            <span class="registrar-reports-course__count">${escapeHtml(label)}</span>
          </div>
          <div class="registrar-reports-course__track" role="presentation">
            <div class="registrar-reports-course__bar" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
    .join("");
}

function renderEnrollmentCard(data, compact = false) {
  if (compact) {
    return `
      <div class="row g-3 mb-4">
        <div class="col-md-6 col-lg-4">
          <div class="registrar-mini-stat registrar-mini-stat--green d-flex align-items-center gap-3">
            <span class="registrar-reports-mini-icon registrar-reports-mini-icon--green"><i class="bi bi-people-fill" aria-hidden="true"></i></span>
            <div>
              <p class="registrar-mini-stat__value mb-0">${data.enrollmentCount}</p>
              <p class="registrar-mini-stat__label mb-0">Total Enrolled</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="row g-3 mb-3">
      <div class="col-md-6 col-lg-4">
        <article class="registrar-stat-card registrar-stat-card--success">
          <span class="registrar-stat-card__icon"><i class="bi bi-people-fill" aria-hidden="true"></i></span>
          <div>
            <p class="registrar-stat-card__label">Annual Enrollment Count</p>
            <p class="registrar-stat-card__value">${data.enrollmentCount}</p>
            <p class="registrar-stat-card__hint">${escapeHtml(data.enrollmentHint || "Students enrolled this year")}</p>
          </div>
        </article>
      </div>
    </div>`;
}

function renderReportActions(fiscalYear) {
  return `
    <section class="registrar-panel registrar-reports-actions mb-0">
      <div class="registrar-reports-actions__head">
        <div class="d-flex align-items-center gap-2">
          <span class="registrar-reports-section-icon"><i class="bi bi-file-earmark-text" aria-hidden="true"></i></span>
          <div>
            <h2 class="registrar-panel__title mb-0">Report Actions</h2>
            <p class="registrar-panel__subtitle mb-0">Download current year report</p>
          </div>
        </div>
      </div>
      <div class="registrar-panel__body">
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button type="button" class="btn btn-outline-secondary px-4 registrar-reports-download-btn" data-year="${fiscalYear}">
            <i class="bi bi-download me-2" aria-hidden="true"></i>Download Current Report
          </button>
        </div>
        <div class="registrar-reports-note">
          <strong>Note:</strong> The downloaded report includes enrollment and course distribution data for Fiscal Year ${fiscalYear}.
        </div>
      </div>
    </section>`;
}

function renderCurrentYear() {
  const d = CURRENT_YEAR_REPORT;
  return `
    ${renderEnrollmentCard(d)}
    <section class="registrar-panel mb-3">
      <div class="registrar-panel__head border-0 pb-2">
        <div class="d-flex align-items-center gap-2">
          <span class="registrar-reports-section-icon"><i class="bi bi-bar-chart-fill" aria-hidden="true"></i></span>
          <div>
            <h2 class="registrar-panel__title mb-0">Course Distribution</h2>
            <p class="registrar-panel__subtitle mb-0">Students by program</p>
          </div>
        </div>
      </div>
      <div class="registrar-panel__body pt-0">
        ${renderCourseDistribution(d.courses)}
      </div>
    </section>
    ${renderReportActions(d.fiscalYear)}`;
}

function renderArchivedCard(report) {
  return `
    <article class="registrar-panel registrar-reports-archived mb-3">
      <div class="registrar-reports-archived__head">
        <div>
          <h2 class="registrar-panel__title mb-1 d-flex align-items-center gap-2">
            <i class="bi bi-calendar3" aria-hidden="true"></i>Fiscal Year ${report.fiscalYear}
          </h2>
          <p class="registrar-panel__subtitle mb-0">Closed on ${escapeHtml(report.closedOn)} by ${escapeHtml(report.closedBy)}</p>
        </div>
        <span class="registrar-reports-archived-badge">Archived</span>
      </div>
      <div class="registrar-panel__body pt-0">
        ${renderEnrollmentCard(report, true)}
        <h3 class="h6 fw-semibold mb-3">Course Distribution</h3>
        ${renderCourseDistribution(report.courses)}
        <button type="button" class="btn btn-outline-dark btn-sm px-3 mt-3 registrar-reports-download-btn" data-year="${report.fiscalYear}" data-archived="1">
          <i class="bi bi-download me-1" aria-hidden="true"></i>Download Report
        </button>
      </div>
    </article>`;
}

function renderArchived(list) {
  if (!list.length) {
    return `<div class="registrar-panel"><div class="registrar-panel__body text-center text-muted py-5">No archived fiscal years yet.</div></div>`;
  }
  return list.map(renderArchivedCard).join("");
}

function buildReportPayload(year, archivedList) {
  if (Number(year) === FISCAL_YEAR) return { type: "current", ...CURRENT_YEAR_REPORT };
  const found = archivedList.find((r) => r.fiscalYear === Number(year));
  return found ? { type: "archived", ...found } : null;
}

function downloadReport(year, archivedList) {
  const payload = buildReportPayload(year, archivedList);
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vtiac-registrar-report-fy${year}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  const tabsEl = document.getElementById("reports-tabs");
  const contentEl = document.getElementById("reports-content");
  const closeBtn = document.getElementById("close-fiscal-year-btn");
  const fiscalLabel = document.getElementById("fiscal-year-label");
  const closeModalEl = document.getElementById("close-fiscal-modal");
  const closeModalBody = document.getElementById("close-fiscal-modal-body");
  const closeConfirmBtn = document.getElementById("close-fiscal-confirm");

  if (!tabsEl || !contentEl) return;

  let activeTab = "current";
  let archived = loadArchived();

  const closeModal = closeModalEl ? bootstrap.Modal.getOrCreateInstance(closeModalEl) : null;

  if (fiscalLabel) fiscalLabel.textContent = String(FISCAL_YEAR);

  function archivedTabLabel() {
    const n = archived.length;
    return n ? `Archived Reports (${n})` : "Archived Reports";
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    TABS.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.key === activeTab ? "true" : "false");
      btn.className = "module-tab-btn btn btn-sm border-0" + (tab.key === activeTab ? " active" : "");
      const label = tab.key === "archived" ? archivedTabLabel() : tab.label;
      if (tab.icon) {
        btn.innerHTML = `<i class="bi ${tab.icon} me-1" aria-hidden="true"></i>${escapeHtml(label)}`;
      } else {
        btn.textContent = label;
      }
      btn.addEventListener("click", () => {
        activeTab = tab.key;
        renderTabs();
        renderContent();
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderContent() {
    contentEl.innerHTML = activeTab === "current" ? renderCurrentYear() : renderArchived(archived);
  }

  function bindContentActions() {
    contentEl.querySelectorAll(".registrar-reports-download-btn").forEach((btn) => {
      btn.addEventListener("click", () => downloadReport(btn.dataset.year, archived));
    });
  }

  const observer = new MutationObserver(() => bindContentActions());
  observer.observe(contentEl, { childList: true });

  closeBtn?.addEventListener("click", () => {
    if (closeModalBody) {
      closeModalBody.textContent = `Archive all ${FISCAL_YEAR} registrar data and start a new fiscal year? This cannot be undone in production without admin restore. (Demo)`;
    }
    closeModal?.show();
  });

  closeConfirmBtn?.addEventListener("click", () => {
    const snapshot = {
      ...CURRENT_YEAR_REPORT,
      fiscalYear: FISCAL_YEAR,
      closedOn: new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }),
      closedBy: "Registrar User",
    };
    archived = [snapshot, ...archived.filter((r) => r.fiscalYear !== FISCAL_YEAR)];
    saveArchived(archived);
    closeModal?.hide();
    activeTab = "archived";
    renderTabs();
    renderContent();
    window.alert(`Fiscal Year ${FISCAL_YEAR} archived. (Demo — current year stats unchanged.)`);
  });

  renderTabs();
  renderContent();
  bindContentActions();
});
