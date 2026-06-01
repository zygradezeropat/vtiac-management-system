/**
 * Cashier transaction history — filters, pagination (10 per page), view receipt.
 */

import { escapeHtml } from "./registrar-student-detail.js";
import { formatPeso } from "./cashier-store.js";
import { initPaymentModal, showReceiptModal } from "./cashier-payment.js";

const PAGE_SIZE = 10;

let allTransactions = [];
let currentPage = 1;

function particularsSummary(particulars) {
  if (!particulars?.length) return "—";
  const first = particulars[0].description || "Item";
  if (particulars.length === 1) return first;
  return `${first} +${particulars.length - 1} more`;
}

function statusBadgeClass(status) {
  if (status === "Full Payment") return "cashier-badge-full";
  if (status === "Partial Payment") return "cashier-badge-partial";
  return "bg-secondary";
}

function txnKey(txn) {
  return String(txn.serverPaymentId ?? txn.id ?? "");
}

function readFilters() {
  return {
    date: document.getElementById("historyFilterDate")?.value?.trim() || "",
    type: document.getElementById("historyFilterType")?.value?.trim() || "",
    name: document.getElementById("historyFilterName")?.value?.trim().toLowerCase() || "",
    status: document.getElementById("historyFilterStatus")?.value?.trim() || "",
    ref: document.getElementById("historyFilterRef")?.value?.trim().toLowerCase() || "",
  };
}

function txnLocalDate(txn) {
  if (!txn.createdAt) return "";
  const d = new Date(txn.createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function filterTransactions(txns) {
  const { date, type, name, status, ref } = readFilters();

  return txns.filter((t) => {
    if (date && txnLocalDate(t) !== date) return false;
    if (type && t.receiptType !== type) return false;
    if (status && t.status !== status) return false;
    if (name && !(t.studentName || "").toLowerCase().includes(name)) return false;
    if (ref) {
      const control = (t.controlNumber || "").toLowerCase();
      const orNum = (t.orNumber || "").toLowerCase();
      if (!control.includes(ref) && !orNum.includes(ref)) return false;
    }
    return true;
  });
}

function paginate(txns, page) {
  const totalPages = Math.max(1, Math.ceil(txns.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    page: safePage,
    totalPages,
    items: txns.slice(start, start + PAGE_SIZE),
    total: txns.length,
  };
}

function renderSummary(filteredTotal, pageInfo) {
  const el = document.getElementById("historyResultSummary");
  if (!el) return;

  if (!allTransactions.length) {
    el.textContent = "No transactions recorded yet.";
    return;
  }

  if (!filteredTotal) {
    el.textContent = `No transactions match your filters (${allTransactions.length} total).`;
    return;
  }

  const { page, totalPages, total } = pageInfo;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  if (total <= PAGE_SIZE) {
    el.textContent = `Showing ${total} of ${allTransactions.length} transaction${allTransactions.length === 1 ? "" : "s"}.`;
    return;
  }

  el.textContent = `Showing ${start}–${end} of ${total} (${allTransactions.length} total) · Page ${page} of ${totalPages}`;
}

function renderPagination(pageInfo) {
  const nav = document.getElementById("historyPagination");
  if (!nav) return;

  const { page, totalPages, total } = pageInfo;

  if (total <= PAGE_SIZE) {
    nav.classList.add("hidden");
    nav.innerHTML = "";
    return;
  }

  nav.classList.remove("hidden");
  nav.innerHTML = `
    <button type="button" class="btn btn-sm cashier-btn-outline" data-history-page="prev" ${page <= 1 ? "disabled" : ""}>
      Previous
    </button>
    <span class="cashier-pagination__label">Page ${page} of ${totalPages}</span>
    <button type="button" class="btn btn-sm cashier-btn-outline" data-history-page="next" ${page >= totalPages ? "disabled" : ""}>
      Next
    </button>
  `;
}

function renderHistoryTable(items) {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  if (!items.length) {
    const filtersActive = Object.values(readFilters()).some(Boolean);
    const message = filtersActive
      ? "No transactions match your filters."
      : "No transactions recorded yet.";
    tbody.innerHTML = `<tr><td colspan="10" class="text-muted text-center py-4">${message}</td></tr>`;
    return;
  }

  tbody.innerHTML = items
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.controlNumber)}</td>
      <td>${escapeHtml(t.orNumber || "—")}</td>
      <td>${escapeHtml(t.receiptType === "AR" ? "AR" : "Invoice")}</td>
      <td>${escapeHtml(t.studentName)}</td>
      <td>${escapeHtml(particularsSummary(t.particulars))}</td>
      <td>${formatPeso(t.paidAmount)}</td>
      <td><span class="badge ${statusBadgeClass(t.status)}">${escapeHtml(t.status)}</span></td>
      <td>${formatPeso(t.remainingBalance)}</td>
      <td>${escapeHtml(t.dateTime)}</td>
      <td>
        <button type="button" class="btn btn-sm cashier-btn-ghost" data-view-payment="${escapeHtml(txnKey(t))}">
          View
        </button>
      </td>
    </tr>
  `
    )
    .join("");
}

function render() {
  const filtered = filterTransactions(allTransactions);
  const pageInfo = paginate(filtered, currentPage);
  currentPage = pageInfo.page;

  renderSummary(filtered.length, pageInfo);
  renderHistoryTable(pageInfo.items);
  renderPagination(pageInfo);
}

async function fetchTransactions() {
  try {
    const res = await fetch("/cashier/api/payments/", { credentials: "same-origin" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.transactions || [];
  } catch {
    return [];
  }
}

function clearFilters() {
  const ids = [
    "historyFilterDate",
    "historyFilterType",
    "historyFilterName",
    "historyFilterStatus",
    "historyFilterRef",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "SELECT") el.selectedIndex = 0;
    else el.value = "";
  });
  currentPage = 1;
  render();
}

export function initCashierHistory() {
  initPaymentModal();

  const txnByKey = () => {
    const map = new Map();
    allTransactions.forEach((t) => map.set(txnKey(t), t));
    return map;
  };

  document.getElementById("historyTableBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view-payment]");
    if (!btn) return;
    const txn = txnByKey().get(btn.getAttribute("data-view-payment"));
    if (txn) showReceiptModal(txn);
  });

  document.getElementById("historyPagination")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-history-page]");
    if (!btn || btn.disabled) return;
    const action = btn.getAttribute("data-history-page");
    const filtered = filterTransactions(allTransactions);
    const { totalPages } = paginate(filtered, currentPage);
    if (action === "prev" && currentPage > 1) currentPage -= 1;
    if (action === "next" && currentPage < totalPages) currentPage += 1;
    render();
  });

  ["historyFilterDate", "historyFilterType", "historyFilterName", "historyFilterStatus", "historyFilterRef"].forEach(
    (id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", () => {
        currentPage = 1;
        render();
      });
      el?.addEventListener("change", () => {
        currentPage = 1;
        render();
      });
    }
  );

  document.getElementById("historyClearFiltersBtn")?.addEventListener("click", clearFilters);

  const refresh = async () => {
    allTransactions = await fetchTransactions();
    currentPage = 1;
    render();
  };

  refresh();
  window.addEventListener("cashier:transaction-saved", refresh);
}
