/**
 * Admin — Institutional Reports Center
 * Consolidated reporting across all departments:
 * 1. E.G.A.C.E. Performance Reports (qualification, batch, and date range filters)
 * 2. Cashier & Financial Reports (Excel downloads, custom range, payment status summary, transactions)
 * 3. Registrar & Enrollment Reports (admissions, program distributions, master batch schedule)
 * 4. Trainer & Evaluation Reports (TVET instructor ratings, evaluations, program competency)
 */

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

const FISCAL_YEAR = 2026;
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

document.addEventListener("DOMContentLoaded", () => {
  const data = loadReportsData();
  if (!data) return;

  const generatedEl = document.getElementById("admin-reports-generated");
  if (generatedEl) {
    generatedEl.textContent = `Institutional reports generated: ${data.generatedAt || "—"}`;
  }

  /* =========================================================================
   * TAB 1: E.G.A.C.E. PERFORMANCE REPORTS
   * ========================================================================= */
  const rawBatches = data.batches || [];
  let selectedCourse = "";
  let selectedBatch = "";
  let filterYear = "";
  let filterMonth = "";
  let filterStartDate = "";
  let filterEndDate = "";

  const courseSelect = document.getElementById("admin-egace-course-select");
  const batchSelect = document.getElementById("admin-egace-batch-select");
  const yearSelect = document.getElementById("admin-egace-year-select");
  const monthSelect = document.getElementById("admin-egace-month-select");
  const startDateInput = document.getElementById("admin-egace-start-date");
  const endDateInput = document.getElementById("admin-egace-end-date");
  const applyFilterBtn = document.getElementById("admin-egace-apply-filter");
  const resetFilterBtn = document.getElementById("admin-egace-reset-filter");
  const activeRangeText = document.getElementById("admin-egace-active-range-text");

  const docCourseEl = document.getElementById("admin-egace-doc-course");
  const docBatchEl = document.getElementById("admin-egace-doc-batch");
  const docBatchContainer = document.getElementById("admin-egace-doc-batch-container");
  const docRangeEl = document.getElementById("admin-egace-doc-range");
  const tbodyEl = document.getElementById("admin-egace-tbody");
  const tfootEl = document.getElementById("admin-egace-tfoot");

  // Extract distinct course list
  const coursesList = [];
  rawBatches.forEach((b) => {
    const c = (b.course_name || "").trim();
    if (c && !coursesList.includes(c)) coursesList.push(c);
  });
  (data.programs || []).forEach((p) => {
    const name = typeof p === "string" ? p : p.name;
    if (name && !coursesList.includes(name)) coursesList.push(name);
  });

  if (coursesList.length && !selectedCourse) {
    selectedCourse = coursesList[0];
  }

  function populateCourseSelect() {
    if (!courseSelect) return;
    courseSelect.innerHTML = coursesList.length
      ? coursesList
          .map(
            (c) =>
              `<option value="${escapeHtml(c)}" ${
                c.toLowerCase() === selectedCourse.toLowerCase() ? "selected" : ""
              }>${escapeHtml(c)}</option>`
          )
          .join("")
      : `<option value="">No qualifications found</option>`;
  }

  function populateBatchSelect() {
    if (!batchSelect) return;
    const courseBatches = rawBatches.filter(
      (b) => (b.course_name || "").trim().toLowerCase() === selectedCourse.trim().toLowerCase()
    );

    const distinctBatches = [];
    courseBatches.forEach((b) => {
      const lbl = (b.batch_label || "").trim();
      if (lbl && !distinctBatches.some((x) => x.toLowerCase() === lbl.toLowerCase())) {
        distinctBatches.push(lbl);
      }
    });

    batchSelect.innerHTML = [
      `<option value="" ${!selectedBatch ? "selected" : ""}>All Batches (${distinctBatches.length})</option>`,
      ...distinctBatches.map(
        (b) =>
          `<option value="${escapeHtml(b)}" ${
            b.toLowerCase() === selectedBatch.toLowerCase() ? "selected" : ""
          }>${escapeHtml(b)}</option>`
      ),
    ].join("");
  }

  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatDatePretty(iso) {
    if (!iso) return "";
    const p = iso.split("-");
    if (p.length === 3) {
      const y = parseInt(p[0], 10);
      const m = parseInt(p[1], 10) - 1;
      const d = parseInt(p[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && MONTH_SHORT[m]) {
        return `${MONTH_SHORT[m]} ${d}, ${y}`;
      }
    }
    return iso;
  }

  function isBatchInDateRange(b) {
    if (filterStartDate && filterEndDate) {
      const bStart = b.start_date_iso || "";
      const bEnd = b.end_date_iso || bStart;
      if (!bStart && !bEnd) return false;
      return (bStart <= filterEndDate && (!bEnd || bEnd >= filterStartDate));
    }
    if (filterYear) {
      const yInt = parseInt(filterYear, 10);
      if (b.year !== yInt) return false;
    }
    if (filterMonth) {
      const mInt = parseInt(filterMonth, 10);
      if (b.month !== mInt) return false;
    }
    return true;
  }

  function getFormattedReportRange() {
    if (filterStartDate && filterEndDate) {
      return `${formatDatePretty(filterStartDate)} – ${formatDatePretty(filterEndDate)}`;
    }
    if (filterYear && filterMonth) {
      const mIndex = parseInt(filterMonth, 10) - 1;
      return `${MONTH_SHORT[mIndex]} ${filterYear}`;
    }
    if (filterYear) return `Year ${filterYear}`;
    return `AY ${FISCAL_YEAR}–${FISCAL_YEAR + 1}`;
  }

  function renderEgaceTable() {
    if (!tbodyEl) return;

    let batches = rawBatches.filter(
      (b) => (b.course_name || "").trim().toLowerCase() === selectedCourse.trim().toLowerCase()
    );

    const rows = batches.map((b, idx) => ({
      rawLabel: (b.batch_label || `Batch ${idx + 1}`).trim(),
      label: (b.batch_label || `Batch ${idx + 1}`).trim().toUpperCase(),
      enrolled: b.students_count || 0,
      graduates: b.graduates || 0,
      assessed: b.assessed || 0,
      certified: b.certified || 0,
      employed: b.employed || 0,
      start_date_iso: b.start_date_iso,
      end_date_iso: b.end_date_iso,
      year: b.year,
      month: b.month,
    }));

    let filteredRows = rows.filter(isBatchInDateRange);
    if (selectedBatch) {
      filteredRows = filteredRows.filter(
        (r) => r.rawLabel.toLowerCase() === selectedBatch.toLowerCase()
      );
    }

    const rangeLabel = getFormattedReportRange();
    if (activeRangeText) activeRangeText.textContent = rangeLabel;
    if (docRangeEl) docRangeEl.textContent = rangeLabel;
    if (docCourseEl) docCourseEl.textContent = selectedCourse || "ALL PROGRAMS";

    if (docBatchEl && docBatchContainer) {
      if (selectedBatch) {
        docBatchContainer.style.display = "inline";
        docBatchEl.textContent = selectedBatch;
      } else {
        docBatchContainer.style.display = "none";
        docBatchEl.textContent = "";
      }
    }

    if (!filteredRows.length) {
      tbodyEl.innerHTML = `
        <tr>
          <td colspan="11" class="text-center py-4 text-muted">
            No batch records recorded for ${escapeHtml(selectedCourse)} within ${escapeHtml(rangeLabel)}.
          </td>
        </tr>`;
      if (tfootEl) tfootEl.innerHTML = "";
      return;
    }

    const totEnrolled = filteredRows.reduce((s, r) => s + (r.enrolled || 0), 0);
    const totGrad = filteredRows.reduce((s, r) => s + (r.graduates || 0), 0);
    const totAss = filteredRows.reduce((s, r) => s + (r.assessed || 0), 0);
    const totCert = filteredRows.reduce((s, r) => s + (r.certified || 0), 0);
    const totEmp = filteredRows.reduce((s, r) => s + (r.employed || 0), 0);

    tbodyEl.innerHTML = filteredRows
      .map((r) => {
        const enr = r.enrolled || 0;
        const gPct = enr ? Math.round(((r.graduates || 0) / enr) * 100) + "%" : "—";
        const aPct = enr ? Math.round(((r.assessed || 0) / enr) * 100) + "%" : "—";
        const cPct = enr ? Math.round(((r.certified || 0) / enr) * 100) + "%" : "—";
        const ePct = enr && r.employed !== null ? Math.round(((r.employed || 0) / enr) * 100) + "%" : "—";
        return `
          <tr>
            <td class="fw-bold text-start ps-3">${escapeHtml(r.label)}</td>
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
          </tr>`;
      })
      .join("");

    if (tfootEl) {
      tfootEl.innerHTML = `
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
        </tr>`;
    }
  }

  // Bind EGACE Controls
  courseSelect?.addEventListener("change", (e) => {
    selectedCourse = e.target.value;
    selectedBatch = "";
    populateBatchSelect();
    renderEgaceTable();
  });

  batchSelect?.addEventListener("change", (e) => {
    selectedBatch = e.target.value;
    renderEgaceTable();
  });

  applyFilterBtn?.addEventListener("click", () => {
    filterYear = yearSelect?.value || "";
    filterMonth = monthSelect?.value || "";
    filterStartDate = startDateInput?.value || "";
    filterEndDate = endDateInput?.value || "";
    renderEgaceTable();
  });

  resetFilterBtn?.addEventListener("click", () => {
    filterYear = "";
    filterMonth = "";
    filterStartDate = "";
    filterEndDate = "";
    if (yearSelect) yearSelect.value = "";
    if (monthSelect) monthSelect.value = "";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
    renderEgaceTable();
  });

  document.getElementById("admin-egace-preset-this-month")?.addEventListener("click", () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    filterYear = String(curYear);
    filterMonth = String(curMonth);
    const lastDay = new Date(curYear, curMonth, 0).getDate();
    const mStr = String(curMonth).padStart(2, "0");
    filterStartDate = `${curYear}-${mStr}-01`;
    filterEndDate = `${curYear}-${mStr}-${String(lastDay).padStart(2, "0")}`;
    if (yearSelect) yearSelect.value = filterYear;
    if (monthSelect) monthSelect.value = filterMonth;
    if (startDateInput) startDateInput.value = filterStartDate;
    if (endDateInput) endDateInput.value = filterEndDate;
    renderEgaceTable();
  });

  document.getElementById("admin-egace-preset-last-month")?.addEventListener("click", () => {
    const now = new Date();
    let prevMonth = now.getMonth();
    let prevYear = now.getFullYear();
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
    if (yearSelect) yearSelect.value = filterYear;
    if (monthSelect) monthSelect.value = filterMonth;
    if (startDateInput) startDateInput.value = filterStartDate;
    if (endDateInput) endDateInput.value = filterEndDate;
    renderEgaceTable();
  });

  document.getElementById("admin-egace-preset-this-year")?.addEventListener("click", () => {
    const curYear = new Date().getFullYear();
    filterYear = String(curYear);
    filterMonth = "";
    filterStartDate = `${curYear}-01-01`;
    filterEndDate = `${curYear}-12-31`;
    if (yearSelect) yearSelect.value = filterYear;
    if (monthSelect) monthSelect.value = "";
    if (startDateInput) startDateInput.value = filterStartDate;
    if (endDateInput) endDateInput.value = filterEndDate;
    renderEgaceTable();
  });

  document.getElementById("admin-egace-preset-all-time")?.addEventListener("click", () => {
    resetFilterBtn?.click();
  });

  document.getElementById("admin-egace-print-btn")?.addEventListener("click", () => {
    window.print();
  });

  document.getElementById("admin-egace-export-csv")?.addEventListener("click", () => {
    let batches = rawBatches.filter(
      (b) => (b.course_name || "").trim().toLowerCase() === selectedCourse.trim().toLowerCase()
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

  populateCourseSelect();
  populateBatchSelect();
  renderEgaceTable();

  /* =========================================================================
   * TAB 2: CASHIER & FINANCIAL REPORTS
   * ========================================================================= */
  const dailyDateEl = document.getElementById("admin-cashier-daily-date");
  const monthlyMonthEl = document.getElementById("admin-cashier-monthly-month");
  const annualYearEl = document.getElementById("admin-cashier-annual-year");

  const todayIso = new Date().toISOString().split("T")[0];
  const curMonthIso = todayIso.substring(0, 7);

  if (dailyDateEl) dailyDateEl.value = todayIso;
  if (monthlyMonthEl) monthlyMonthEl.value = curMonthIso;
  if (annualYearEl) annualYearEl.value = "2026";

  document.getElementById("admin-cashier-download-daily")?.addEventListener("click", () => {
    const d = dailyDateEl?.value || todayIso;
    window.location.href = `/cashier/api/reports/export/?type=daily&date=${encodeURIComponent(d)}`;
  });

  document.getElementById("admin-cashier-download-monthly")?.addEventListener("click", () => {
    const m = monthlyMonthEl?.value || curMonthIso;
    window.location.href = `/cashier/api/reports/export/?type=monthly&month=${encodeURIComponent(m)}`;
  });

  document.getElementById("admin-cashier-download-annual")?.addEventListener("click", () => {
    const y = annualYearEl?.value || "2026";
    window.location.href = `/cashier/api/reports/export/?type=annual&year=${encodeURIComponent(y)}`;
  });

  // Custom Date Range Financial Filter
  const customStartEl = document.getElementById("admin-cashier-custom-start");
  const customEndEl = document.getElementById("admin-cashier-custom-end");
  const customIncomeEl = document.getElementById("admin-cashier-custom-income");
  const customTransEl = document.getElementById("admin-cashier-custom-transactions");

  if (customStartEl) customStartEl.value = `${todayIso.substring(0, 7)}-01`;
  if (customEndEl) customEndEl.value = todayIso;

  async function fetchCashierCustomFilter() {
    const start = customStartEl?.value || "";
    const end = customEndEl?.value || "";
    try {
      const res = await fetch(`/cashier/api/reports/?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`);
      if (res.ok) {
        const d = await res.json();
        if (customIncomeEl) customIncomeEl.textContent = d.gross_income_display || d.total_revenue || "₱0.00";
        if (customTransEl) customTransEl.textContent = String(d.total_transactions_count ?? (d.paid_students_count || 0));

        if (d.payment_breakdown) {
          const full = d.payment_breakdown.full || {};
          const partial = d.payment_breakdown.partial || {};
          document.getElementById("admin-cashier-full-count").textContent = String(full.count || 0);
          document.getElementById("admin-cashier-full-amount").textContent = `${full.amount_display || "₱0.00"} collected`;
          document.getElementById("admin-cashier-partial-count").textContent = String(partial.count || 0);
          document.getElementById("admin-cashier-partial-amount").textContent = `${partial.amount_display || "₱0.00"} collected`;
          document.getElementById("admin-cashier-total-revenue").textContent = d.gross_income_display || "₱0.00";
        }
      }
    } catch (_) {}
  }

  document.getElementById("admin-cashier-custom-filter")?.addEventListener("click", fetchCashierCustomFilter);
  fetchCashierCustomFilter();

  // Transactions ledger table
  const payments = data.payments || {};
  paymentsRecentRows = payments.recent || [];
  paymentsRecentPage = 1;

  const transCountBadge = document.getElementById("admin-cashier-trans-count");
  if (transCountBadge) transCountBadge.textContent = `${paymentsRecentRows.length} records`;

  function renderPaymentsRecentTable() {
    const tbody = document.getElementById("pay-recent");
    const paginationEl = document.getElementById("pay-recent-pagination");
    if (!tbody) return;

    const total = paymentsRecentRows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE) || 1);
    paymentsRecentPage = Math.min(Math.max(1, paymentsRecentPage), totalPages);

    if (!total) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-4">No payment transactions recorded</td></tr>`;
      paginationEl?.classList.add("d-none");
      return;
    }

    const start = (paymentsRecentPage - 1) * PAYMENTS_PAGE_SIZE;
    const pageRows = paymentsRecentRows.slice(start, start + PAYMENTS_PAGE_SIZE);

    tbody.innerHTML = pageRows
      .map(
        (r) => `
          <tr>
            <td class="text-nowrap small">${escapeHtml(r.date)}</td>
            <td class="fw-semibold text-dark">${escapeHtml(r.student)}</td>
            <td class="fw-bold text-success">${escapeHtml(r.amount)}</td>
            <td><span class="badge bg-light text-dark border">${escapeHtml(r.type)}</span></td>
            <td class="text-muted small">${escapeHtml(r.cashier)}</td>
          </tr>`
      )
      .join("");

    if (!paginationEl) return;
    if (total <= PAYMENTS_PAGE_SIZE) {
      paginationEl.classList.add("d-none");
      return;
    }

    paginationEl.classList.remove("d-none");
    const rangeStart = start + 1;
    const rangeEnd = Math.min(start + PAYMENTS_PAGE_SIZE, total);
    const prevDisabled = paymentsRecentPage <= 1 ? "disabled" : "";
    const nextDisabled = paymentsRecentPage >= totalPages ? "disabled" : "";

    paginationEl.innerHTML = `
      <span class="text-muted small">Showing ${rangeStart}–${rangeEnd} of ${total}</span>
      <div class="d-flex align-items-center gap-1">
        <button type="button" class="btn btn-sm btn-outline-secondary pay-prev-btn" ${prevDisabled}>Previous</button>
        <span class="text-muted small px-2">Page ${paymentsRecentPage} of ${totalPages}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary pay-next-btn" ${nextDisabled}>Next</button>
      </div>`;
  }

  const paginationEl = document.getElementById("pay-recent-pagination");
  paginationEl?.addEventListener("click", (e) => {
    if (e.target.closest(".pay-prev-btn") && paymentsRecentPage > 1) {
      paymentsRecentPage -= 1;
      renderPaymentsRecentTable();
    } else if (e.target.closest(".pay-next-btn")) {
      const totalPages = Math.max(1, Math.ceil(paymentsRecentRows.length / PAYMENTS_PAGE_SIZE));
      if (paymentsRecentPage < totalPages) {
        paymentsRecentPage += 1;
        renderPaymentsRecentTable();
      }
    }
  });

  renderPaymentsRecentTable();

  /* =========================================================================
   * TAB 3: REGISTRAR & ENROLLMENT REPORTS
   * ========================================================================= */
  const enrollment = data.enrollment || {};
  document.getElementById("enroll-pending").textContent = String(enrollment.pendingApprovals ?? 0);
  document.getElementById("enroll-approved").textContent = String(enrollment.totalApproved ?? 0);
  document.getElementById("admin-enroll-programs-count").textContent = String((enrollment.byProgram || []).length || 0);
  document.getElementById("admin-enroll-batches-count").textContent = String(rawBatches.length || 0);

  const statusBody = document.getElementById("enroll-by-status");
  const programBody = document.getElementById("enroll-by-program");
  if (statusBody) {
    statusBody.innerHTML = (enrollment.byStatus || [])
      .map(
        (r) =>
          `<tr>
            <td><span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">${escapeHtml(r.status)}</span></td>
            <td class="text-center fw-bold">${r.count}</td>
          </tr>`
      )
      .join("") || `<tr><td colspan="2" class="text-muted text-center py-3">No status data</td></tr>`;
  }

  if (programBody) {
    programBody.innerHTML = (enrollment.byProgram || [])
      .map(
        (r) =>
          `<tr>
            <td class="fw-semibold text-dark">${escapeHtml(r.program)}</td>
            <td class="text-center"><span class="badge bg-light text-dark border px-2 py-1">${r.count}</span></td>
          </tr>`
      )
      .join("") || `<tr><td colspan="2" class="text-muted text-center py-3">No program data</td></tr>`;
  }

  // Master Batches Roster
  const batchesTbody = document.getElementById("admin-batches-roster-tbody");
  const batchesSummaryCount = document.getElementById("admin-batches-summary-count");
  if (batchesSummaryCount) batchesSummaryCount.textContent = `${rawBatches.length} Total Batches`;

  if (batchesTbody) {
    batchesTbody.innerHTML = rawBatches.length
      ? rawBatches
          .map(
            (b) => `
              <tr>
                <td class="fw-bold text-dark">${escapeHtml(b.course_name)}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(b.batch_label)}</span></td>
                <td class="text-muted small">${escapeHtml(b.academic_year || "AY 2026–2027")} · ${escapeHtml(b.term || "1st Sem")}</td>
                <td class="small">${escapeHtml(b.schedule || "—")}</td>
                <td class="small fw-semibold text-dark">${escapeHtml(b.trainer_name || "Unassigned")}</td>
                <td class="text-center fw-bold">${b.students_count || 0}</td>
                <td class="text-center">
                  <span class="badge ${b.status === "Active" ? "bg-success" : "bg-secondary"} rounded-pill">
                    ${escapeHtml(b.status || "Draft")}
                  </span>
                </td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="7" class="text-muted text-center py-4">No batches recorded yet</td></tr>`;
  }

  /* =========================================================================
   * TAB 4: TRAINER & EVALUATIONS REPORTS
   * ========================================================================= */
  const perf = data.performance || {};
  const tEvals = data.trainerEvaluations || {};

  document.getElementById("perf-grade-count").textContent = String(perf.gradeRecords ?? 0);
  document.getElementById("admin-trainers-total-evals").textContent = String(tEvals.totalEvaluations ?? 0);
  document.getElementById("admin-trainers-count").textContent = String((tEvals.trainers || []).length || 0);
  document.getElementById("admin-trainers-avg-rating").textContent = tEvals.averageRating || "—";

  const perfBody = document.getElementById("perf-by-program");
  if (perfBody) {
    perfBody.innerHTML = (perf.programRows || [])
      .map(
        (r) => `
          <tr>
            <td class="fw-semibold text-dark">${escapeHtml(r.program)}</td>
            <td class="text-center">${r.students}</td>
            <td class="text-center fw-bold text-primary">${r.withGrades}</td>
            <td class="text-center fw-bold text-success">${r.assessed}</td>
          </tr>`
      )
      .join("") || `<tr><td colspan="4" class="text-muted text-center py-4">No performance records</td></tr>`;
  }

  const trainersTbody = document.getElementById("admin-trainers-roster-tbody");
  if (trainersTbody) {
    trainersTbody.innerHTML = (tEvals.trainers || []).length
      ? (tEvals.trainers || [])
          .map(
            (t) => `
              <tr>
                <td class="fw-bold text-dark">${escapeHtml(t.name)}</td>
                <td class="text-muted small">${escapeHtml(t.email)}</td>
                <td>${escapeHtml(t.program)}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(t.batch)}</span></td>
                <td class="text-center fw-bold">${t.evalCount}</td>
                <td class="text-center">
                  <span class="badge ${t.avgRating ? "bg-warning-subtle text-dark border border-warning-subtle" : "bg-light text-muted border"} px-2 py-1">
                    ${escapeHtml(t.ratingDisplay)}
                  </span>
                </td>
              </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="text-muted text-center py-4">No trainer evaluations recorded yet</td></tr>`;
  }
});
