/**
 * Cashier collection reports — gross income and payment status from DB.
 */

import { escapeHtml } from "./registrar-student-detail.js";
import { formatPeso } from "./cashier-store.js";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatDateInput(iso) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function renderPaymentList(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items?.length) {
    el.innerHTML = `<p class="text-muted small mb-0">No payments in this category.</p>`;
    return;
  }
  el.innerHTML = `
    <ul class="list-unstyled mb-0">
      ${items
        .map(
          (p) => `
        <li class="border-bottom py-2">
          <div class="d-flex justify-content-between gap-2">
            <div>
              <strong>${escapeHtml(p.studentName)}</strong>
              <span class="text-muted small d-block">${escapeHtml(p.controlNumber)} · ${escapeHtml(p.dateTime)}</span>
            </div>
            <div class="text-end">
              <span class="text-success fw-semibold">${formatPeso(p.paidAmount)}</span>
              <span class="text-muted small d-block">of ${formatPeso(p.totalPayable)}</span>
            </div>
          </div>
        </li>
      `
        )
        .join("")}
    </ul>
  `;
}

function renderReports(data) {
  setText("monthlyIncome", formatPeso(data.monthlyIncome));
  setText("weeklyIncome", formatPeso(data.weeklyIncome));
  setText("annualIncome", formatPeso(data.annualIncome));
  setText("totalIncome", formatPeso(data.totalIncome));

  const range = data.customRange || {};
  const startEl = document.getElementById("startDate");
  const endEl = document.getElementById("endDate");
  if (startEl && range.startDate) startEl.value = formatDateInput(range.startDate);
  if (endEl && range.endDate) endEl.value = formatDateInput(range.endDate);

  setText("customRangeIncome", formatPeso(range.income));
  setText("customRangeCount", String(range.transactionCount ?? 0));

  const full = data.fullPayments || {};
  const partial = data.partialPayments || {};

  setText("fullPaymentCount", String(full.count ?? 0));
  setText("fullPaymentAmount", `${formatPeso(full.amount)} collected`);
  setText("partialPaymentCount", String(partial.count ?? 0));
  setText("partialPaymentAmount", `${formatPeso(partial.amount)} collected`);
  setText("totalRevenue", formatPeso(data.totalRevenue));

  renderPaymentList("fullPaymentList", full.items);
  renderPaymentList("partialPaymentList", partial.items);
}

async function fetchReports(startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const qs = params.toString();
  const url = `/cashier/api/reports/${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return null;
  return res.json();
}

function showDetails(id, hideId) {
  document.getElementById(id)?.classList.remove("hidden");
  document.getElementById(hideId)?.classList.add("hidden");
}

function hideDetails(id) {
  document.getElementById(id)?.classList.add("hidden");
}

export function initCashierReports() {
  const filterBtn = document.getElementById("filterByDateRangeBtn");
  const showFullBtn = document.getElementById("showFullPaymentsBtn");
  const showPartialBtn = document.getElementById("showPartialPaymentsBtn");

  const load = async (start, end) => {
    const data = await fetchReports(start, end);
    if (data) renderReports(data);
  };

  filterBtn?.addEventListener("click", () => {
    const start = document.getElementById("startDate")?.value;
    const end = document.getElementById("endDate")?.value;
    load(start, end);
  });

  showFullBtn?.addEventListener("click", () => {
    showDetails("fullPaymentDetails", "partialPaymentDetails");
  });
  showPartialBtn?.addEventListener("click", () => {
    showDetails("partialPaymentDetails", "fullPaymentDetails");
  });
  document.getElementById("hideFullPaymentDetailsBtn")?.addEventListener("click", () => {
    hideDetails("fullPaymentDetails");
  });
  document.getElementById("hidePartialPaymentDetailsBtn")?.addEventListener("click", () => {
    hideDetails("partialPaymentDetails");
  });

  load();
  window.addEventListener("cashier:transaction-saved", () => load());
}
