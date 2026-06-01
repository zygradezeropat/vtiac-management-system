/**
 * Cashier dashboard — stats and recent transactions from server (DB).
 */

import { escapeHtml } from "./registrar-student-detail.js";
import { formatPeso } from "./cashier-store.js";
import { initPaymentModal, openPaymentModal } from "./cashier-payment.js";

function renderDashboard(stats) {
  const elTotal = document.getElementById("totalCollections");
  const elToday = document.getElementById("todayTransactions");
  const elActive = document.getElementById("activeStudents");
  const elWeek = document.getElementById("weeklyTotal");
  const elRecent = document.getElementById("recentTransactions");

  if (elTotal) elTotal.textContent = formatPeso(stats.totalCollections || 0);
  if (elToday) elToday.textContent = String(stats.todayTransactions ?? 0);
  if (elActive) elActive.textContent = String(stats.activeStudents ?? 0);
  if (elWeek) elWeek.textContent = formatPeso(stats.weeklyTotal || 0);

  if (!elRecent) return;

  const recent = stats.recentTransactions || [];
  if (!recent.length) {
    elRecent.innerHTML = `<p class="text-muted small mb-0">No transactions yet. Click <strong>New Payment</strong> to process one.</p>`;
    return;
  }

  elRecent.innerHTML = recent
    .map((t) => {
      const initials = (t.studentName || "?")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const particular = t.particulars?.[0]?.description || "Payment";
      return `
        <div class="cashier-txn-item">
          <div class="cashier-txn-avatar">${escapeHtml(initials)}</div>
          <div class="cashier-txn-meta">
            <p class="cashier-txn-name mb-0">${escapeHtml(t.studentName)}</p>
            <p class="cashier-txn-particular mb-0">${escapeHtml(particular)}</p>
            <p class="cashier-txn-ref mb-0">${escapeHtml(t.controlNumber)}</p>
          </div>
          <div class="cashier-txn-amount">${formatPeso(t.paidAmount)}</div>
        </div>
      `;
    })
    .join("");
}

async function fetchDashboard() {
  try {
    const res = await fetch("/cashier/api/dashboard/", { credentials: "same-origin" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function initCashierDashboard() {
  initPaymentModal();

  document.getElementById("newPaymentBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    openPaymentModal();
  });

  const refresh = async () => {
    const stats = await fetchDashboard();
    if (stats) {
      renderDashboard(stats);
    } else {
      renderDashboard({
        totalCollections: 0,
        todayTransactions: 0,
        activeStudents: 0,
        weeklyTotal: 0,
        recentTransactions: [],
      });
    }
  };

  refresh();
  window.addEventListener("cashier:transaction-saved", refresh);
}
