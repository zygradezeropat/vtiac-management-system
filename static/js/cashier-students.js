/**
 * Cashier students list with search, sort, and pagination (10 per page).
 */

import { escapeHtml } from "./registrar-student-detail.js";
import { formatPeso } from "./cashier-store.js";

const PAGE_SIZE = 10;

let cashierStudentsCache = [];
let currentPage = 1;
let cachedTxns = [];

function balanceForStudent(name, txns) {
  return txns
    .filter((t) => t.studentName === name)
    .reduce((sum, t) => sum + (t.remainingBalance || 0), 0);
}

function filterAndSortRows(students, txns, query, sort) {
  let rows = students.map((s) => ({
    ...s,
    balance: balanceForStudent(s.name, txns),
  }));

  const q = (query || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.referenceId.toLowerCase().includes(q)
    );
  }

  rows.sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return sort === "desc" ? -cmp : cmp;
  });

  return rows;
}

function renderPagination(totalRows, page, totalPages) {
  const el = document.getElementById("studentsPagination");
  if (!el) return;

  if (totalPages <= 1) {
    el.classList.add("d-none");
    el.innerHTML = "";
    return;
  }

  el.classList.remove("d-none");
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalRows);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(
      (n) =>
        `<button type="button" class="btn btn-sm ${n === page ? "cashier-btn-primary" : "btn-outline-secondary"} students-page-btn" data-page="${n}">${n}</button>`
    )
    .join("");

  el.innerHTML = `
    <span class="cashier-pagination__label">Showing ${start}–${end} of ${totalRows}</span>
    <div class="d-flex flex-wrap gap-1 justify-content-center">
      <button type="button" class="btn btn-sm btn-outline-secondary students-page-prev" ${prevDisabled}>Prev</button>
      ${pageButtons}
      <button type="button" class="btn btn-sm btn-outline-secondary students-page-next" ${nextDisabled}>Next</button>
    </div>
  `;
}

function renderTable(students, txns, query, sort, page) {
  const tbody = document.getElementById("studentsTableBody");
  if (!tbody) return;

  const rows = filterAndSortRows(students, txns, query, sort);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  currentPage = safePage;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-4">No students found.</td></tr>`;
    renderPagination(0, 1, 1);
    return;
  }

  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map(
      (s) => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.program)}</td>
      <td>${s.balance > 0 ? formatPeso(s.balance) : '<span class="text-success">₱0.00</span>'}</td>
      <td><button type="button" class="btn btn-sm cashier-btn-outline btn-student-pay" data-registration-id="${escapeHtml(s.registrationId)}">Pay</button></td>
    </tr>
  `
    )
    .join("");

  renderPagination(rows.length, safePage, totalPages);
}

async function fetchTransactions() {
  try {
    const res = await fetch("/cashier/api/payments/", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      return data.transactions || [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export async function initCashierStudents() {
  const search = document.getElementById("studentSearch");
  const sort = document.getElementById("studentSort");
  const pagination = document.getElementById("studentsPagination");
  let students = [];

  try {
    const res = await fetch("/cashier/api/students/", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      students = data.students || [];
    }
  } catch {
    /* empty */
  }

  cashierStudentsCache = students;
  cachedTxns = await fetchTransactions();

  const refresh = (resetPage = false) => {
    if (resetPage) currentPage = 1;
    renderTable(students, cachedTxns, search?.value, sort?.value, currentPage);
  };

  search?.addEventListener("input", () => refresh(true));
  sort?.addEventListener("change", () => refresh(true));

  pagination?.addEventListener("click", (e) => {
    const prev = e.target.closest(".students-page-prev");
    const next = e.target.closest(".students-page-next");
    const pageBtn = e.target.closest(".students-page-btn");
    if (prev && currentPage > 1) {
      currentPage -= 1;
      refresh(false);
    } else if (next) {
      const rows = filterAndSortRows(students, cachedTxns, search?.value, sort?.value);
      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (currentPage < totalPages) {
        currentPage += 1;
        refresh(false);
      }
    } else if (pageBtn) {
      currentPage = parseInt(pageBtn.dataset.page, 10) || 1;
      refresh(false);
    }
  });

  window.addEventListener("cashier:transaction-saved", async () => {
    cachedTxns = await fetchTransactions();
    refresh(false);
  });

  refresh(true);
}

export function findCachedCashierStudent(registrationId) {
  return cashierStudentsCache.find((s) => s.registrationId === registrationId);
}
