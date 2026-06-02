/**
 * Admin — Institutional Reports Center (enrollment, payments, performance, EGACE).
 */

import { escapeHtml, initAdminEgaceReport } from "./admin-egace-report.js";

const PAYMENTS_PAGE_SIZE = 10;

let paymentsRecentRows = [];
let paymentsRecentPage = 1;

function loadReportsData() {
  const el = document.getElementById("institutional-reports-data");
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

function renderEnrollment(data) {
  const enrollment = data?.enrollment || {};
  document.getElementById("enroll-pending").textContent = String(enrollment.pendingApprovals ?? 0);
  document.getElementById("enroll-approved").textContent = String(enrollment.totalApproved ?? 0);

  const statusBody = document.getElementById("enroll-by-status");
  const programBody = document.getElementById("enroll-by-program");
  if (statusBody) {
    statusBody.innerHTML = (enrollment.byStatus || [])
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.status)}</td><td class="text-center">${row.count}</td></tr>`
      )
      .join("") || `<tr><td colspan="2" class="text-muted text-center">No data</td></tr>`;
  }
  if (programBody) {
    programBody.innerHTML = (enrollment.byProgram || [])
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.program)}</td><td class="text-center">${row.count}</td></tr>`
      )
      .join("") || `<tr><td colspan="2" class="text-muted text-center">No data</td></tr>`;
  }
}

function renderPaymentsSummary(payments) {
  document.getElementById("pay-count").textContent = String(payments.transactionCount ?? 0);
  document.getElementById("pay-total").textContent = payments.totalCollected || "₱0.00";
  document.getElementById("pay-today").textContent = payments.collectedToday || "₱0.00";
}

function renderPaymentsRecentTable() {
  const tbody = document.getElementById("pay-recent");
  const paginationEl = document.getElementById("pay-recent-pagination");
  if (!tbody) return;

  const total = paymentsRecentRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE) || 1);
  paymentsRecentPage = Math.min(Math.max(1, paymentsRecentPage), totalPages);

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center">No transactions yet</td></tr>`;
    paginationEl?.classList.add("d-none");
    paginationEl && (paginationEl.innerHTML = "");
    return;
  }

  const start = (paymentsRecentPage - 1) * PAYMENTS_PAGE_SIZE;
  const pageRows = paymentsRecentRows.slice(start, start + PAYMENTS_PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.student)}</td>
          <td>${escapeHtml(row.amount)}</td>
          <td>${escapeHtml(row.type)}</td>
          <td>${escapeHtml(row.cashier)}</td>
        </tr>`
    )
    .join("");

  if (!paginationEl) return;

  if (total <= PAYMENTS_PAGE_SIZE) {
    paginationEl.classList.add("d-none");
    paginationEl.innerHTML = "";
    return;
  }

  paginationEl.classList.remove("d-none");
  const rangeStart = start + 1;
  const rangeEnd = Math.min(start + PAYMENTS_PAGE_SIZE, total);
  const prevDisabled = paymentsRecentPage <= 1 ? "disabled" : "";
  const nextDisabled = paymentsRecentPage >= totalPages ? "disabled" : "";

  paginationEl.innerHTML = `
    <span class="text-muted small">Showing ${rangeStart}–${rangeEnd} of ${total}</span>
    <div class="d-flex align-items-center gap-2">
      <button type="button" class="btn btn-sm btn-outline-secondary pay-recent-page-prev" ${prevDisabled}>Previous</button>
      <span class="text-muted small">Page ${paymentsRecentPage} of ${totalPages}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary pay-recent-page-next" ${nextDisabled}>Next</button>
    </div>
  `;
}

function initPaymentsPagination() {
  const paginationEl = document.getElementById("pay-recent-pagination");
  if (!paginationEl || paginationEl.dataset.bound) return;
  paginationEl.dataset.bound = "1";
  paginationEl.addEventListener("click", (event) => {
    if (event.target.closest(".pay-recent-page-prev") && paymentsRecentPage > 1) {
      paymentsRecentPage -= 1;
      renderPaymentsRecentTable();
    } else if (event.target.closest(".pay-recent-page-next")) {
      const totalPages = Math.max(
        1,
        Math.ceil(paymentsRecentRows.length / PAYMENTS_PAGE_SIZE)
      );
      if (paymentsRecentPage < totalPages) {
        paymentsRecentPage += 1;
        renderPaymentsRecentTable();
      }
    }
  });
}

function renderPayments(data) {
  const payments = data?.payments || {};
  renderPaymentsSummary(payments);
  paymentsRecentRows = payments.recent || [];
  paymentsRecentPage = 1;
  renderPaymentsRecentTable();
  initPaymentsPagination();
}

function renderPerformance(data) {
  const performance = data?.performance || {};
  document.getElementById("perf-grade-count").textContent = String(performance.gradeRecords ?? 0);
  const tbody = document.getElementById("perf-by-program");
  if (!tbody) return;
  const rows = performance.programRows || [];
  tbody.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
        <tr>
          <td>${escapeHtml(row.program)}</td>
          <td class="text-center">${row.students}</td>
          <td class="text-center">${row.withGrades}</td>
          <td class="text-center">${row.assessed}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="text-muted text-center">No performance data</td></tr>`;
}

function initAdminReports() {
  const data = loadReportsData();
  if (!data) return;

  const generated = document.getElementById("admin-reports-generated");
  if (generated) {
    generated.textContent = `Report data as of ${data.generatedAt || "—"}`;
  }

  renderEnrollment(data);
  renderPayments(data);
  renderPerformance(data);

  const egaceReport = data.egaceBatchReport || data.egace || {};
  initAdminEgaceReport(egaceReport, {
    filterId: "admin-reports-qualification",
    tbodyId: "admin-reports-egace-body",
    titleWrapId: "admin-reports-qualification-title",
    titleNameId: "admin-reports-qualification-name",
  });

  const paymentsTab = document.getElementById("tab-payments");
  paymentsTab?.addEventListener("shown.bs.tab", () => {
    renderPaymentsRecentTable();
  });

  const egaceTab = document.getElementById("tab-egace");
  egaceTab?.addEventListener("shown.bs.tab", () => {
    initAdminEgaceReport(egaceReport, {
      filterId: "admin-reports-qualification",
      tbodyId: "admin-reports-egace-body",
      titleWrapId: "admin-reports-qualification-title",
      titleNameId: "admin-reports-qualification-name",
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminReports);
} else {
  initAdminReports();
}
