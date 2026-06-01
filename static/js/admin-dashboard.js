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

function renderCountBadge(value) {
  const num = Number(value) || 0;
  const cls = num > 0 ? "has-count" : "no-count";
  return `<span class="admin-count-badge ${cls}">${num}</span>`;
}

function renderEgaceRow(row) {
  return `
    <tr>
      <td>${escapeHtml(row.course)}</td>
      <td class="text-center">${renderCountBadge(row.enrolled)}</td>
      <td class="text-center">${renderCountBadge(row.graduated)}</td>
      <td class="text-center">${renderCountBadge(row.assessed)}</td>
      <td class="text-center">${renderCountBadge(row.certified)}</td>
      <td class="text-center">${renderCountBadge(row.employed)}</td>
    </tr>`;
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

function renderEgaceSummary(rows) {
  const tbody = document.getElementById("egaceSummaryTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">No EGACE records yet.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = rows.map(renderEgaceRow).join("");
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
  renderEgaceSummary(data.egaceSummary || []);
  initProgramTabs(data.programs || []);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminDashboard);
} else {
  initAdminDashboard();
}
