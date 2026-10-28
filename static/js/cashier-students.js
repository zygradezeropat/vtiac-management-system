/**
 * Cashier Student Accounts & Receivables Module
 * - Aging of Receivables & Overdue Tracking
 * - Filter Bar & Quick Toggles (Status, Academic Dimension / Course Type, Fee Category, Search)
 * - Balance Data Table with inline Receive Payment action
 */

import { escapeHtml } from "./registrar-student-detail.js";
import { formatPeso } from "./cashier-store.js";

const PAGE_SIZE = 10;

// Application state
let cachedStudents = [];
let cachedAging = null;
let currentPage = 1;

const filterState = {
  searchQuery: "",
  status: "all", // "all" | "unpaid" | "partial" | "paid" | "overdue"
  agingBracket: "all", // "all" | "current" | "1-30" | "31-60" | "61-90" | "90+"
  courseType: "all", // "all" | "training_with_assessment" | "assessment_only"
  program: "all",
  feeCategory: "all", // "all" | "regular" | "scholar"
  sort: "name_asc",
};

// Clipboard toast feedback
function showToast(message) {
  const existing = document.getElementById("cashierToast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "cashierToast";
  toast.className = "position-fixed bottom-0 end-0 p-3";
  toast.style.zIndex = "1090";
  toast.innerHTML = `
    <div class="toast align-items-center text-white bg-dark border-0 show shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi bi-check-circle-fill text-success"></i>
          <span>${escapeHtml(message)}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/**
 * Filter students across all active dimensions.
 */
function applyFilters(students) {
  let result = [...students];

  // 1. Instant Search: Student ID (reference ID), Name, or Email
  const q = (filterState.searchQuery || "").trim().toLowerCase();
  if (q) {
    result = result.filter((s) => {
      const studentId = (s.studentId || s.referenceId || "").toLowerCase();
      const name = (s.name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();
      const program = (s.program || "").toLowerCase();
      return (
        studentId.includes(q) ||
        name.includes(q) ||
        email.includes(q) ||
        program.includes(q)
      );
    });
  }

  // 2. Payment Status Quick Toggle
  if (filterState.status === "unpaid") {
    result = result.filter(
      (s) => Number(s.totalPaid) <= 0 && Number(s.totalAssessed) > 0
    );
  } else if (filterState.status === "partial") {
    result = result.filter(
      (s) => Number(s.totalPaid) > 0 && Number(s.totalRemaining) > 0
    );
  } else if (filterState.status === "paid") {
    result = result.filter(
      (s) => Number(s.totalRemaining) <= 0 && Number(s.totalAssessed) > 0
    );
  } else if (filterState.status === "overdue") {
    result = result.filter(
      (s) => Boolean(s.isOverdue) && Number(s.totalRemaining) > 0
    );
  }

  // 3. Aging Bracket Filter (Current, 1-30d, 31-60d, 61-90d, 90+d)
  if (filterState.agingBracket && filterState.agingBracket !== "all") {
    result = result.filter((s) => s.agingBracket === filterState.agingBracket);
  }

  // 4. Academic Dimension: Course Type
  if (filterState.courseType && filterState.courseType !== "all") {
    result = result.filter((s) => s.courseType === filterState.courseType);
  }

  // 5. Specific Course / Qualification
  if (filterState.program && filterState.program !== "all") {
    result = result.filter((s) => s.program === filterState.program);
  }

  // 6. Fee Category: Scholar vs Regular
  if (filterState.feeCategory === "scholar") {
    result = result.filter((s) => Boolean(s.isScholar));
  } else if (filterState.feeCategory === "regular") {
    result = result.filter((s) => !s.isScholar);
  }

  // 7. Sort
  result.sort((a, b) => {
    switch (filterState.sort) {
      case "name_desc":
        return b.name.localeCompare(a.name);
      case "balance_desc":
        return Number(b.totalRemaining || 0) - Number(a.totalRemaining || 0);
      case "balance_asc":
        return Number(a.totalRemaining || 0) - Number(b.totalRemaining || 0);
      case "overdue_desc":
        return Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0);
      case "due_asc": {
        const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
        return dateA - dateB;
      }
      case "name_asc":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return result;
}

/**
 * Render Aging of Receivables KPI Cards, Distribution Bar, and Bracket Cards.
 */
function renderAgingModule(aging, students) {
  if (!aging) return;

  // KPI 1: Total Receivables
  const totalRecEl = document.getElementById("kpiTotalReceivables");
  if (totalRecEl) totalRecEl.textContent = formatPeso(aging.totalReceivables || 0);

  const activeAccountsEl = document.getElementById("kpiActiveAccounts");
  if (activeAccountsEl) {
    activeAccountsEl.textContent = `${aging.activeReceivablesCount || 0} accounts with balance`;
  }

  const collRateEl = document.getElementById("kpiCollectionRate");
  if (collRateEl) {
    collRateEl.textContent = `${aging.collectionRate || 0}% collected`;
  }

  // KPI 2: Unpaid Accounts
  const unpaidAmtEl = document.getElementById("kpiUnpaidAmount");
  if (unpaidAmtEl) unpaidAmtEl.textContent = formatPeso(aging.unpaid?.amount || 0);

  const unpaidCountEl = document.getElementById("kpiUnpaidCount");
  if (unpaidCountEl) {
    unpaidCountEl.textContent = `${aging.unpaid?.count || 0} students (zero paid)`;
  }

  // KPI 3: Partial Balances
  const partialAmtEl = document.getElementById("kpiPartialAmount");
  if (partialAmtEl) partialAmtEl.textContent = formatPeso(aging.partial?.amount || 0);

  const partialCountEl = document.getElementById("kpiPartialCount");
  if (partialCountEl) {
    partialCountEl.textContent = `${aging.partial?.count || 0} students with balance`;
  }

  // KPI 4: Overdue Accounts
  const overdueAmtEl = document.getElementById("kpiOverdueAmount");
  if (overdueAmtEl) overdueAmtEl.textContent = formatPeso(aging.overdue?.amount || 0);

  const overdueCountEl = document.getElementById("kpiOverdueCount");
  if (overdueCountEl) {
    overdueCountEl.textContent = `${aging.overdue?.count || 0} past due date`;
  }

  const overdueBadgeEl = document.getElementById("kpiOverdueBadge");
  if (overdueBadgeEl) {
    if ((aging.overdue?.count || 0) > 0) {
      overdueBadgeEl.textContent = `${aging.overdue.count} Overdue`;
      overdueBadgeEl.classList.add("cashier-aging-badge--pulse");
    } else {
      overdueBadgeEl.textContent = "All Good";
      overdueBadgeEl.classList.remove("cashier-aging-badge--pulse");
    }
  }

  // Aging distribution track bar widths
  const total = Number(aging.totalReceivables) || 1;
  const b = aging.brackets || {};
  const currentPct = Math.max(0, Math.min(100, ((b.current?.amount || 0) / total) * 100));
  const days1_30Pct = Math.max(0, Math.min(100, ((b.days1_30?.amount || 0) / total) * 100));
  const days31_60Pct = Math.max(0, Math.min(100, ((b.days31_60?.amount || 0) / total) * 100));
  const days61_90Pct = Math.max(0, Math.min(100, ((b.days61_90?.amount || 0) / total) * 100));
  const days90PlusPct = Math.max(0, Math.min(100, ((b.days90Plus?.amount || 0) / total) * 100));

  const setWidth = (id, pct, title) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.width = `${pct}%`;
      el.setAttribute("title", title);
    }
  };

  setWidth("barSegCurrent", currentPct, `Current: ${formatPeso(b.current?.amount || 0)} (${Math.round(currentPct)}%)`);
  setWidth("barSegDays1_30", days1_30Pct, `1–30d Overdue: ${formatPeso(b.days1_30?.amount || 0)} (${Math.round(days1_30Pct)}%)`);
  setWidth("barSegDays31_60", days31_60Pct, `31–60d Overdue: ${formatPeso(b.days31_60?.amount || 0)} (${Math.round(days31_60Pct)}%)`);
  setWidth("barSegDays61_90", days61_90Pct, `61–90d Overdue: ${formatPeso(b.days61_90?.amount || 0)} (${Math.round(days61_90Pct)}%)`);
  setWidth("barSegDays90Plus", days90PlusPct, `>90d Overdue: ${formatPeso(b.days90Plus?.amount || 0)} (${Math.round(days90PlusPct)}%)`);

  // 5-bracket amounts & counts
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText("bracketAmountCurrent", formatPeso(b.current?.amount || 0));
  setText("bracketCountCurrent", `${b.current?.count || 0} students`);

  setText("bracketAmount1_30", formatPeso(b.days1_30?.amount || 0));
  setText("bracketCount1_30", `${b.days1_30?.count || 0} students`);

  setText("bracketAmount31_60", formatPeso(b.days31_60?.amount || 0));
  setText("bracketCount31_60", `${b.days31_60?.count || 0} students`);

  setText("bracketAmount61_90", formatPeso(b.days61_90?.amount || 0));
  setText("bracketCount61_90", `${b.days61_90?.count || 0} students`);

  setText("bracketAmount90Plus", formatPeso(b.days90Plus?.amount || 0));
  setText("bracketCount90Plus", `${b.days90Plus?.count || 0} students`);

  // Highlight active bracket button if any
  document.querySelectorAll(".cashier-aging-bracket-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.bracket === filterState.agingBracket);
  });
}

/**
 * Update quick toggle pill counts and active styling.
 */
function updateQuickToggleCounts(students) {
  const unpaidCount = students.filter(
    (s) => Number(s.totalPaid) <= 0 && Number(s.totalAssessed) > 0
  ).length;
  const partialCount = students.filter(
    (s) => Number(s.totalPaid) > 0 && Number(s.totalRemaining) > 0
  ).length;
  const paidCount = students.filter(
    (s) => Number(s.totalRemaining) <= 0 && Number(s.totalAssessed) > 0
  ).length;
  const overdueCount = students.filter(
    (s) => Boolean(s.isOverdue) && Number(s.totalRemaining) > 0
  ).length;

  const setCount = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };

  setCount("badgeCountAll", students.length);
  setCount("badgeCountUnpaid", unpaidCount);
  setCount("badgeCountPartial", partialCount);
  setCount("badgeCountPaid", paidCount);
  setCount("badgeCountOverdue", overdueCount);

  // Active pill state
  document.querySelectorAll(".cashier-status-pill").forEach((pill) => {
    pill.classList.toggle("is-active", pill.dataset.status === filterState.status);
  });
}

/**
 * Populate dynamic dropdown options for programs.
 */
function populateProgramDropdown(students) {
  const select = document.getElementById("programFilter");
  if (!select) return;

  const currentVal = select.value;
  const programs = new Set();
  students.forEach((s) => {
    if (s.program && s.program !== "—") programs.add(s.program);
  });

  const sortedPrograms = Array.from(programs).sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="all">All Programs / Courses</option>';
  sortedPrograms.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    if (p === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

/**
 * Render Due Date & Aging Badge cell.
 */
function renderDueDateCell(s) {
  const formattedDate = escapeHtml(s.dueDateFormatted || s.dueDate || "—");

  if (Number(s.totalRemaining) <= 0 && Number(s.totalAssessed) > 0) {
    return `
      <div>${formattedDate}</div>
      <span class="cashier-aging-pill cashier-aging-pill--paid">
        <i class="bi bi-check-circle-fill"></i> Settled
      </span>
    `;
  }

  if (s.isOverdue && Number(s.totalRemaining) > 0) {
    return `
      <div class="fw-semibold text-danger">${formattedDate}</div>
      <span class="cashier-aging-pill cashier-aging-pill--overdue" title="${s.daysOverdue} days past payment deadline">
        <i class="bi bi-exclamation-triangle-fill"></i> ${s.daysOverdue}d overdue
      </span>
    `;
  }

  if (s.daysUntilDue > 0 && s.daysUntilDue <= 7) {
    return `
      <div class="fw-semibold text-warning-emphasis">${formattedDate}</div>
      <span class="cashier-aging-pill cashier-aging-pill--duesoon">
        <i class="bi bi-clock-history"></i> Due in ${s.daysUntilDue}d
      </span>
    `;
  }

  return `
    <div>${formattedDate}</div>
    <span class="cashier-aging-pill cashier-aging-pill--current">
      On schedule
    </span>
  `;
}

/**
 * Render Balance Data Table with all requested columns and action buttons.
 */
function renderTable(filteredStudents, page) {
  const tbody = document.getElementById("studentsTableBody");
  if (!tbody) return;

  const totalRows = filteredStudents.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  currentPage = safePage;

  // Active filter summary text
  const summaryEl = document.getElementById("filterResultSummary");
  if (summaryEl) {
    const totalBalance = filteredStudents.reduce(
      (sum, s) => sum + (Number(s.totalRemaining) || 0),
      0
    );
    const start = totalRows ? (safePage - 1) * PAGE_SIZE + 1 : 0;
    const end = Math.min(safePage * PAGE_SIZE, totalRows);

    summaryEl.innerHTML = `
      Showing <strong>${start}–${end}</strong> of <strong>${totalRows}</strong> students (10 per page)
      &bull; Filtered Balance Due: <strong class="text-danger">${formatPeso(totalBalance)}</strong>
    `;
  }

  if (!totalRows) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5">
          <div class="text-muted mb-2"><i class="bi bi-inbox fs-2"></i></div>
          <p class="fw-semibold text-secondary mb-1">No students match your filter criteria.</p>
          <p class="small text-muted mb-3">Try adjusting your search keywords, payment status, or course dimension.</p>
          <button type="button" class="btn btn-sm cashier-btn-outline" id="clearEmptyFilterBtn">
            Reset All Filters
          </button>
        </td>
      </tr>
    `;
    document.getElementById("clearEmptyFilterBtn")?.addEventListener("click", resetAllFilters);
    renderPagination(0, 1, 1);
    return;
  }

  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = filteredStudents.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((s) => {
      const studentId = escapeHtml(s.studentId || s.referenceId || "—");
      const name = escapeHtml(s.name || "—");
      const email = escapeHtml(s.email || "No email recorded");
      const program = escapeHtml(s.program || "—");
      const courseTypeLabel = escapeHtml(s.courseTypeLabel || "Training with Assessment");
      const isScholar = Boolean(s.isScholar);
      const scholarshipLabel = escapeHtml(s.scholarshipLabel || (isScholar ? "Scholar" : "Regular"));
      const totalAssessed = formatPeso(s.totalAssessed || 0);
      const totalPaid = formatPeso(s.totalPaid || 0);
      const remainingBalance = Number(s.totalRemaining || 0);
      const remainingFormatted = formatPeso(remainingBalance);
      const regId = escapeHtml(s.registrationId || "");

      // Balance styling
      const balanceClass =
        remainingBalance > 0
          ? "cashier-amount-balance cashier-amount-balance--due"
          : "cashier-amount-balance cashier-amount-balance--zero";

      // Fee category pill
      const feeCategoryPill = isScholar
        ? `<span class="cashier-badge-scholar"><i class="bi bi-award-fill"></i> ${scholarshipLabel}</span>`
        : `<span class="cashier-badge-regular">Regular</span>`;

      return `
        <tr>
          <!-- Student ID -->
          <td>
            <button type="button" class="cashier-student-id-badge btn-copy-id" data-id="${studentId}" title="Click to copy Student ID">
              <span>${studentId}</span>
              <i class="bi bi-clipboard" style="font-size: 0.7rem;" aria-hidden="true"></i>
            </button>
          </td>

          <!-- Student Name & Contact -->
          <td>
            <div class="cashier-student-meta">
              <span class="cashier-student-meta__name">${name}</span>
              <span class="cashier-student-meta__sub">${email}</span>
            </div>
          </td>

          <!-- Course & Dimension -->
          <td>
            <div>${program}</div>
            <span class="cashier-dim-tag">${courseTypeLabel}</span>
          </td>

          <!-- Fee Category -->
          <td>
            ${feeCategoryPill}
          </td>

          <!-- Total Assessed -->
          <td class="text-end cashier-amount-assessed">
            ${totalAssessed}
          </td>

          <!-- Total Paid -->
          <td class="text-end cashier-amount-paid">
            ${totalPaid}
          </td>

          <!-- Remaining Balance -->
          <td class="text-end ${balanceClass}">
            ${remainingFormatted}
          </td>

          <!-- Due Date & Aging Status -->
          <td>
            ${renderDueDateCell(s)}
          </td>

          <!-- Actions -->
          <td class="text-center">
            <div class="d-inline-flex align-items-center gap-1">
              <button
                type="button"
                class="btn btn-sm cashier-btn-pay btn-student-pay"
                data-registration-id="${regId}"
                title="Receive payment for ${name}"
              >
                <i class="bi bi-credit-card-fill" aria-hidden="true"></i>
                <span>Receive Payment</span>
              </button>
              ${
                remainingBalance > 0
                  ? `<button
                      type="button"
                      class="btn btn-sm cashier-btn-notice btn-student-notice"
                      data-registration-id="${regId}"
                      title="Generate follow-up payment notice"
                    >
                      <i class="bi bi-envelope-paper" aria-hidden="true"></i>
                    </button>`
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  // Attach copy listeners
  tbody.querySelectorAll(".btn-copy-id").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (id) {
        navigator.clipboard?.writeText(id).then(() => {
          showToast(`Copied Student ID: ${id}`);
        });
      }
    });
  });

  // Attach follow-up notice button listener
  tbody.querySelectorAll(".btn-student-notice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const student = findCachedCashierStudent(btn.dataset.registrationId || "");
      if (student) openFollowupNotice(student);
    });
  });

  renderPagination(totalRows, safePage, totalPages);
}

/**
 * Render Pagination controls. Always show 10 records per page controls.
 */
function renderPagination(totalRows, page, totalPages) {
  const el = document.getElementById("studentsPagination");
  if (!el) return;

  if (!totalRows) {
    el.classList.add("d-none");
    el.innerHTML = "";
    return;
  }

  el.classList.remove("d-none");
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalRows);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";

  // Show page window (up to 5 buttons)
  let startPage = Math.max(1, page - 2);
  let endPage = Math.min(totalPages, page + 2);
  if (endPage - startPage < 4) {
    if (startPage === 1) endPage = Math.min(totalPages, 5);
    else if (endPage === totalPages) startPage = Math.max(1, totalPages - 4);
  }

  const pageButtons = [];
  for (let i = startPage; i <= endPage; i++) {
    pageButtons.push(
      `<button type="button" class="btn btn-sm ${
        i === page ? "cashier-btn-primary" : "btn-outline-secondary"
      } students-page-btn" data-page="${i}" ${i === page ? 'aria-current="page"' : ""}>${i}</button>`
    );
  }

  el.innerHTML = `
    <div class="d-flex align-items-center gap-2">
      <span class="cashier-pagination__label">Showing <strong>${start}–${end}</strong> of <strong>${totalRows}</strong> students</span>
      <span class="badge bg-light text-secondary border" style="font-weight: 600; font-size: 0.75rem;">10 records per page</span>
    </div>
    <div class="d-flex flex-wrap gap-1 align-items-center justify-content-center">
      <button type="button" class="btn btn-sm btn-outline-secondary students-page-prev" ${prevDisabled} title="Previous page">
        <i class="bi bi-chevron-left" aria-hidden="true"></i> Prev
      </button>
      ${pageButtons.join("")}
      <button type="button" class="btn btn-sm btn-outline-secondary students-page-next" ${nextDisabled} title="Next page">
        Next <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

/**
 * Export filtered table to CSV format.
 */
function exportFilteredToCsv(students) {
  if (!students || !students.length) {
    showToast("No student records to export.");
    return;
  }

  const headers = [
    "Student ID",
    "Student Name",
    "Course / Program",
    "Course Type",
    "Fee Category",
    "Total Assessed",
    "Total Paid",
    "Remaining Balance",
    "Due Date",
    "Days Overdue",
    "Payment Status",
    "Aging Bracket",
  ];

  const rows = students.map((s) => [
    `"${(s.studentId || s.referenceId || "").replace(/"/g, '""')}"`,
    `"${(s.name || "").replace(/"/g, '""')}"`,
    `"${(s.program || "").replace(/"/g, '""')}"`,
    `"${(s.courseTypeLabel || "").replace(/"/g, '""')}"`,
    `"${(s.scholarshipLabel || (s.isScholar ? "Scholar" : "Regular")).replace(/"/g, '""')}"`,
    Number(s.totalAssessed || 0).toFixed(2),
    Number(s.totalPaid || 0).toFixed(2),
    Number(s.totalRemaining || 0).toFixed(2),
    `"${(s.dueDateFormatted || s.dueDate || "").replace(/"/g, '""')}"`,
    s.isOverdue ? s.daysOverdue || 0 : 0,
    `"${(s.paymentStatus || "").replace(/"/g, '""')}"`,
    `"${(s.agingBracketLabel || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", url);
  link.setAttribute("download", `VTIAC_Receivables_Balances_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast("Receivables CSV exported successfully.");
}

/**
 * Open Follow-up Notice Modal with customized student details.
 */
function openFollowupNotice(student) {
  const noticeTextEl = document.getElementById("followupNoticeText");
  const emailLinkEl = document.getElementById("followupEmailLink");
  const copyBtn = document.getElementById("copyNoticeBtn");
  if (!noticeTextEl) return;

  const due = student.dueDateFormatted || student.dueDate || "N/A";
  const bal = formatPeso(student.totalRemaining || 0);
  const assessed = formatPeso(student.totalAssessed || 0);
  const paid = formatPeso(student.totalPaid || 0);
  const overdueNote = student.isOverdue
    ? `\nImportant Notice: This balance is currently ${student.daysOverdue} days past the scheduled due date (${due}).`
    : `\nPayment Due Date: ${due}`;

  const message = `Dear ${student.name},

Greetings from Valiant Technical Institute & Assessment Center (VTIAC) Cashier Office!

This is a friendly reminder regarding your outstanding student account balance for the course:
${student.program} (Student ID: ${student.studentId || student.referenceId})

Statement of Fees:
- Total Assessed Amount: ${assessed}
- Total Amount Paid:     ${paid}
- Outstanding Balance:   ${bal}
${overdueNote}

Please settle your balance at the VTIAC Cashier Office or contact our finance department if you have any questions regarding installment arrangements.

Official Cashier Hours:
Monday – Friday: 8:00 AM – 5:00 PM

Thank you for your prompt attention.

Warm regards,
Cashier Office
Valiant Technical Institute and Assessment Center, Inc.`;

  noticeTextEl.textContent = message;

  if (emailLinkEl) {
    const subject = encodeURIComponent(`Payment Follow-up Notice — VTIAC (${student.studentId || student.referenceId})`);
    const body = encodeURIComponent(message);
    emailLinkEl.href = `mailto:${encodeURIComponent(student.email || "")}?subject=${subject}&body=${body}`;
  }

  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(message).then(() => {
        showToast("Follow-up notice copied to clipboard.");
      });
    };
  }

  const modalEl = document.getElementById("followupNoticeModal");
  if (modalEl && window.bootstrap?.Modal) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

/**
 * Reset all filters to default.
 */
function resetAllFilters() {
  filterState.searchQuery = "";
  filterState.status = "all";
  filterState.agingBracket = "all";
  filterState.courseType = "all";
  filterState.program = "all";
  filterState.feeCategory = "all";
  filterState.sort = "name_asc";
  currentPage = 1;

  const searchInput = document.getElementById("studentSearch");
  if (searchInput) searchInput.value = "";

  const courseTypeSelect = document.getElementById("courseTypeFilter");
  if (courseTypeSelect) courseTypeSelect.value = "all";

  const programSelect = document.getElementById("programFilter");
  if (programSelect) programSelect.value = "all";

  const feeCategorySelect = document.getElementById("feeCategoryFilter");
  if (feeCategorySelect) feeCategorySelect.value = "all";

  const sortSelect = document.getElementById("studentSort");
  if (sortSelect) sortSelect.value = "name_asc";

  document.querySelectorAll(".cashier-status-pill").forEach((pill) => {
    pill.classList.toggle("is-active", pill.dataset.status === "all");
  });

  document.querySelectorAll(".cashier-aging-bracket-btn").forEach((btn) => {
    btn.classList.remove("is-active");
  });

  document.querySelectorAll(".cashier-aging-card").forEach((card) => {
    card.classList.remove("is-active");
  });

  refreshView();
}

/**
 * Re-filter, sort, and re-render.
 */
function refreshView(resetPage = false) {
  if (resetPage) currentPage = 1;
  const filtered = applyFilters(cachedStudents);
  updateQuickToggleCounts(cachedStudents);
  renderAgingModule(cachedAging, cachedStudents);
  renderTable(filtered, currentPage);
}

/**
 * Fetch students and aging data from the server.
 */
async function loadStudentsData() {
  const tbody = document.getElementById("studentsTableBody");
  if (tbody && !cachedStudents.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-muted">
          <div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>
          <span>Loading student receivables and balances...</span>
        </td>
      </tr>
    `;
  }

  try {
    const res = await fetch("/cashier/api/students/", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      cachedStudents = data.students || [];
      cachedAging = data.aging || data.summary || null;
      populateProgramDropdown(cachedStudents);
      refreshView(false);
    }
  } catch (err) {
    console.error("Failed to load cashier students:", err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle fs-3 d-block mb-2"></i>
            <p class="mb-2">Unable to load student balances. Please check network connection.</p>
            <button type="button" class="btn btn-sm cashier-btn-outline" id="retryLoadBtn">Retry</button>
          </td>
        </tr>
      `;
      document.getElementById("retryLoadBtn")?.addEventListener("click", loadStudentsData);
    }
  }
}

/**
 * Initialize Cashier Students module.
 */
export async function initCashierStudents() {
  const searchInput = document.getElementById("studentSearch");
  const courseTypeSelect = document.getElementById("courseTypeFilter");
  const programSelect = document.getElementById("programFilter");
  const feeCategorySelect = document.getElementById("feeCategoryFilter");
  const sortSelect = document.getElementById("studentSort");
  const resetBtn = document.getElementById("resetFiltersBtn");
  const pagination = document.getElementById("studentsPagination");
  const refreshAgingBtn = document.getElementById("refreshAgingBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");

  // Instant Search with debounce
  let searchTimer = null;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      filterState.searchQuery = searchInput.value;
      refreshView(true);
    }, 180);
  });

  // Academic Dimension: Course Type
  courseTypeSelect?.addEventListener("change", () => {
    filterState.courseType = courseTypeSelect.value;
    refreshView(true);
  });

  // Specific Program
  programSelect?.addEventListener("change", () => {
    filterState.program = programSelect.value;
    refreshView(true);
  });

  // Fee Category: Scholar vs Regular
  feeCategorySelect?.addEventListener("change", () => {
    filterState.feeCategory = feeCategorySelect.value;
    refreshView(true);
  });

  // Sort
  sortSelect?.addEventListener("change", () => {
    filterState.sort = sortSelect.value;
    refreshView(false);
  });

  // Reset Filters
  resetBtn?.addEventListener("click", resetAllFilters);

  // Status Quick Toggles (Pill buttons)
  document.querySelectorAll(".cashier-status-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      filterState.status = pill.dataset.status || "all";
      // Clear specific aging bracket if status toggle is clicked
      filterState.agingBracket = "all";
      document.querySelectorAll(".cashier-aging-bracket-btn").forEach((b) => b.classList.remove("is-active"));
      refreshView(true);
    });
  });

  // Interactive Aging KPI Cards click triggers
  document.getElementById("cardTotalReceivables")?.addEventListener("click", () => {
    filterState.status = "all";
    filterState.agingBracket = "all";
    refreshView(true);
  });

  document.getElementById("cardUnpaid")?.addEventListener("click", () => {
    filterState.status = "unpaid";
    filterState.agingBracket = "all";
    refreshView(true);
  });

  document.getElementById("cardPartial")?.addEventListener("click", () => {
    filterState.status = "partial";
    filterState.agingBracket = "all";
    refreshView(true);
  });

  document.getElementById("cardOverdue")?.addEventListener("click", () => {
    filterState.status = "overdue";
    filterState.agingBracket = "all";
    refreshView(true);
  });

  // Interactive Aging Bracket buttons (5 brackets)
  document.querySelectorAll(".cashier-aging-bracket-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const bracket = btn.dataset.bracket;
      if (filterState.agingBracket === bracket) {
        // Toggle off
        filterState.agingBracket = "all";
      } else {
        filterState.agingBracket = bracket;
      }
      refreshView(true);
    });
  });

  // Refresh data button
  refreshAgingBtn?.addEventListener("click", async () => {
    const icon = refreshAgingBtn.querySelector(".bi-arrow-clockwise");
    if (icon) icon.classList.add("spin-animation");
    await loadStudentsData();
    if (icon) icon.classList.remove("spin-animation");
    showToast("Student receivables data refreshed.");
  });

  // CSV export button
  exportCsvBtn?.addEventListener("click", () => {
    const filtered = applyFilters(cachedStudents);
    exportFilteredToCsv(filtered);
  });

  // Pagination click handlers
  pagination?.addEventListener("click", (e) => {
    const prev = e.target.closest(".students-page-prev");
    const next = e.target.closest(".students-page-next");
    const pageBtn = e.target.closest(".students-page-btn");
    const filtered = applyFilters(cachedStudents);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    if (prev && currentPage > 1) {
      currentPage -= 1;
      renderTable(filtered, currentPage);
    } else if (next && currentPage < totalPages) {
      currentPage += 1;
      renderTable(filtered, currentPage);
    } else if (pageBtn) {
      currentPage = parseInt(pageBtn.dataset.page, 10) || 1;
      renderTable(filtered, currentPage);
    }
  });

  // Listen for payments saved in payment modal to immediately refresh balances & aging
  window.addEventListener("cashier:transaction-saved", async () => {
    await loadStudentsData();
  });

  // Initial fetch
  await loadStudentsData();
}

/**
 * Locate student in memory by registration ID.
 */
export function findCachedCashierStudent(registrationId) {
  if (!registrationId) return null;
  return (
    cachedStudents.find(
      (s) =>
        String(s.registrationId) === String(registrationId) ||
        String(s.id) === String(registrationId) ||
        String(s.referenceId) === String(registrationId)
    ) || null
  );
}
