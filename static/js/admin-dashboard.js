/**
 * Admin Dashboard — NC program cards, EGACE summary, pending counts.
 */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function loadDashboardData() {
  const el = document.getElementById("admin-dashboard-stats");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

function metricValueClass(value) {
  return Number(value) > 0 ? "has-value" : "no-value";
}

function renderMetric(label, icon, value) {
  const num = Number(value) || 0;
  return `
    <div class="admin-metric-item">
      <span class="admin-metric-label">
        <i class="bi ${icon}" aria-hidden="true"></i>
        ${escapeHtml(label)}
      </span>
      <span class="admin-metric-value ${metricValueClass(num)}">${num}</span>
    </div>`;
}

function renderProgramCard(program) {
  return `
    <article class="admin-program-card" data-nc-level="${escapeHtml(program.ncLevel)}">
      <div class="admin-program-card-accent" aria-hidden="true"></div>
      <div class="admin-program-card__head">
        <h3 class="admin-program-card__title">${escapeHtml(program.name)}</h3>
      </div>
      <div class="admin-program-card__body">
        <div class="admin-program-metrics">
          ${renderMetric("Enrolled", "bi-people-fill", program.enrolled)}
          ${renderMetric("Graduated", "bi-mortarboard-fill", program.graduated)}
          ${renderMetric("Assessed", "bi-clipboard-check-fill", program.assessed)}
          ${renderMetric("Certified", "bi-award-fill", program.certified)}
          ${renderMetric("Employed", "bi-briefcase-fill", program.employed)}
        </div>
      </div>
    </article>`;
}

function renderPendingCard(item) {
  const count = Number(item.count) || 0;
  const highlight = count > 0 ? " admin-pending-card--active" : "";
  return `
    <article class="admin-pending-card${highlight}">
      <span class="admin-pending-card__icon" aria-hidden="true">
        <i class="bi ${escapeHtml(item.icon)}"></i>
      </span>
      <div class="admin-pending-card__body">
        <p class="admin-pending-card__value">${count}</p>
        <p class="admin-pending-card__label">${escapeHtml(item.label)}</p>
      </div>
    </article>`;
}

function filterPrograms(programs, tab) {
  if (tab === "all") return programs;
  return programs.filter((program) => program.ncLevel === tab);
}

function renderProgramCards(programs, tab) {
  const grid = document.getElementById("programCardsGrid");
  const emptyState = document.getElementById("emptyState");
  if (!grid) return;

  const filtered = filterPrograms(programs, tab);
  grid.innerHTML = filtered.map(renderProgramCard).join("");

  if (emptyState) {
    emptyState.classList.toggle("hidden", filtered.length > 0);
  }
}

const EGACE_COLUMNS = ["enrolled", "graduated", "assessed", "certified", "employed"];

function renderEgaceMetricCells(row) {
  return EGACE_COLUMNS.map((key) => {
    const metric = row[key] || { actual: 0, percent: 0 };
    const actual = Number(metric.actual) || 0;
    const percent = Number(metric.percent) || 0;
    return `
      <td class="admin-egace-metric-cell">${actual}</td>
      <td class="admin-egace-metric-cell">${percent}%</td>
    `;
  }).join("");
}

function renderEgaceBatchRow(row, index) {
  const rowClass = row.isTotal
    ? "admin-egace-row--total"
    : index % 2 === 0
      ? "admin-egace-row--alt"
      : "";
  return `
    <tr class="${rowClass}">
      <th scope="row">${escapeHtml(row.label)}</th>
      ${renderEgaceMetricCells(row)}
    </tr>`;
}

function populateEgaceCourseFilter(report) {
  const select = document.getElementById("egace-qualification-filter");
  if (!select) return;

  const courses = report?.courses || [];
  if (!courses.length) {
    select.innerHTML = `<option value="">No qualifications with data</option>`;
    return;
  }

  select.innerHTML = courses
    .map(
      (course) =>
        `<option value="${escapeHtml(course)}">${escapeHtml(course)}</option>`
    )
    .join("");

  const defaultCourse = report?.defaultCourse || courses[0] || "";
  if (defaultCourse && courses.includes(defaultCourse)) {
    select.value = defaultCourse;
  }
}

function renderEgaceBatchReport(report, course) {
  const tbody = document.getElementById("egaceSummaryTableBody");
  const titleWrap = document.getElementById("egace-qualification-title");
  const titleName = document.getElementById("egace-qualification-name");
  if (!tbody) return;

  const qualification = course || "";
  const courseReport = qualification ? report?.reports?.[qualification] : null;

  if (titleWrap && titleName) {
    if (qualification && courseReport) {
      titleWrap.hidden = false;
      titleName.textContent = qualification.toUpperCase();
    } else {
      titleWrap.hidden = true;
      titleName.textContent = "";
    }
  }

  if (!courseReport || !courseReport.batches?.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center text-muted py-4">
          ${qualification ? "No batch data for this qualification yet." : "Select a qualification to view the E.G.A.C.E report."}
        </td>
      </tr>`;
    return;
  }

  const rows = [...courseReport.batches];
  if (courseReport.total) {
    rows.push(courseReport.total);
  }

  tbody.innerHTML = rows
    .map((row, index) => renderEgaceBatchRow(row, row.isTotal ? -1 : index))
    .join("");
}

function initEgaceBatchReport(report) {
  const select = document.getElementById("egace-qualification-filter");
  populateEgaceCourseFilter(report);

  const initialCourse = select?.value || report?.defaultCourse || "";
  renderEgaceBatchReport(report, initialCourse);

  select?.addEventListener("change", () => {
    renderEgaceBatchReport(report, select.value);
  });
}

function renderPendingCounts(items) {
  const grid = document.getElementById("pendingCountsGrid");
  if (!grid) return;
  grid.innerHTML = (items || []).map(renderPendingCard).join("");
}

function initProgramTabs(programs) {
  const buttons = document.querySelectorAll(".admin-tab-button[data-tab]");
  let activeTab = "all";

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab || "all";
      buttons.forEach((btn) => btn.classList.toggle("is-active", btn === button));
      renderProgramCards(programs, activeTab);
    });
  });
}

function initAdminDashboard() {
  const data = loadDashboardData();
  if (!data) return;

  renderPendingCounts(data.pendingCounts || []);
  renderProgramCards(data.programs || [], "all");
  initEgaceBatchReport(data.egaceBatchReport || { courses: [], reports: {} });
  initProgramTabs(data.programs || []);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminDashboard);
} else {
  initAdminDashboard();
}
