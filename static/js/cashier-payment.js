/**
 * Cashier payment modal — control number, student search, particulars, receipt.
 */

import { escapeHtml } from "./registrar-student-detail.js";
import {
  addTransaction,
  formatControlNumber,
  formatPeso,
  maxControlSeqFromTransactions,
  parseControlNumberSeq,
} from "./cashier-store.js";

const MIN_PAYMENT_AMOUNT = 500;

let searchTimer = null;
let selectedStudent = null;
let selectedStudentBalance = null;
let paymentMessagePrimaryHandler = null;

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function recordPaymentOnServer(txn) {
  const res = await fetch("/cashier/api/payments/record/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      controlNumber: txn.controlNumber,
      orNumber: txn.orNumber,
      receiptType: txn.receiptType,
      studentName: txn.studentName,
      studentId: txn.studentId,
      registrationId: txn.registrationId,
      particulars: txn.particulars,
      totalPayable: txn.totalPayable,
      paidAmount: txn.paidAmount,
      amountTendered: txn.amountTendered,
      status: txn.status,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Could not save payment to the student record.");
  }
  return data.payment;
}

function openModal(modal) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function getCashierName() {
  const fromHeader = document.getElementById("staff-display-name")?.textContent?.trim();
  if (fromHeader) return fromHeader;
  const modal = document.getElementById("paymentModal");
  return modal?.dataset.cashierName?.trim() || "Cashier";
}

function getMinPaymentAmount() {
  const modal = document.getElementById("paymentModal");
  const raw = Number(modal?.dataset.minPayment);
  return Number.isFinite(raw) && raw > 0 ? raw : MIN_PAYMENT_AMOUNT;
}

function initPaymentMessageModal() {
  const modal = document.getElementById("paymentMessageModal");
  const backdrop = document.getElementById("paymentMessageModalBackdrop");
  const closeBtn = document.getElementById("paymentMessageModalCloseBtn");
  const cancelBtn = document.getElementById("paymentMessageModalCancelBtn");
  const primaryBtn = document.getElementById("paymentMessageModalPrimaryBtn");

  const close = () => {
    paymentMessagePrimaryHandler = null;
    closeModal(modal);
  };

  backdrop?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  primaryBtn?.addEventListener("click", () => {
    const handler = paymentMessagePrimaryHandler;
    paymentMessagePrimaryHandler = null;
    closeModal(modal);
    handler?.();
  });
}

function showPaymentMessage({
  title = "Notice",
  subtitle = "",
  message,
  primaryLabel = "OK",
  showCancel = false,
  onPrimary = null,
  summaryHtml = "",
}) {
  const modal = document.getElementById("paymentMessageModal");
  const titleEl = document.getElementById("paymentMessageModalTitle");
  const subtitleEl = document.getElementById("paymentMessageModalSubtitle");
  const bodyEl = document.getElementById("paymentMessageModalBody");
  const summaryEl = document.getElementById("paymentConfirmSummary");
  const primaryBtn = document.getElementById("paymentMessageModalPrimaryBtn");
  const cancelBtn = document.getElementById("paymentMessageModalCancelBtn");

  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) {
    subtitleEl.textContent = subtitle;
    subtitleEl.classList.toggle("d-none", !subtitle);
  }
  bodyEl.textContent = message || "";

  if (summaryEl) {
    if (summaryHtml) {
      summaryEl.innerHTML = summaryHtml;
      summaryEl.classList.remove("d-none");
    } else {
      summaryEl.innerHTML = "";
      summaryEl.classList.add("d-none");
    }
  }

  if (primaryBtn) primaryBtn.textContent = primaryLabel;
  if (cancelBtn) cancelBtn.classList.toggle("d-none", !showCancel);

  paymentMessagePrimaryHandler = onPrimary;
  openModal(modal);
}

function updateChangeDue() {
  const paid = parseFloat(document.getElementById("paidAmount")?.value) || 0;
  const tendered = parseFloat(document.getElementById("amountTendered")?.value);
  const changeEl = document.getElementById("changeDue");
  if (!changeEl) return;

  if (!Number.isFinite(tendered)) {
    changeEl.textContent = formatPeso(0);
    return;
  }

  const change = Math.max(0, tendered - paid);
  changeEl.textContent = formatPeso(change);
}

function validateMinimumPayment(paidAmount, totalPayable) {
  const minPay = getMinPaymentAmount();
  if (paidAmount <= 0) {
    return "Enter the amount the student is paying now.";
  }
  if (totalPayable < minPay) {
    if (paidAmount + 0.009 < totalPayable) {
      return `Payment must cover the full balance of ${formatPeso(totalPayable)}.`;
    }
    return "";
  }
  if (paidAmount + 0.009 < minPay) {
    return `Minimum payment per transaction is ${formatPeso(minPay)}.`;
  }
  return "";
}

/** Print only #receiptContent (invoice / AR), not the dashboard or modal chrome. */
export function printReceiptOnly() {
  const content = document.getElementById("receiptContent");
  if (!content?.innerHTML.trim()) return;

  const bodyClass = "cashier-print-invoice";
  const cleanup = () => {
    document.body.classList.remove(bodyClass);
    window.removeEventListener("afterprint", cleanup);
  };

  document.body.classList.add(bodyClass);
  window.addEventListener("afterprint", cleanup);
  window.print();
}

function getParticularRows() {
  return [...document.querySelectorAll("#particularsBody .particular-row")];
}

function readParticulars() {
  return getParticularRows()
    .map((row) => {
      const desc = row.querySelector(".particular-desc")?.value?.trim() || "";
      const amt = parseFloat(row.querySelector(".particular-amt")?.value) || 0;
      return { description: desc, amount: amt };
    })
    .filter((p) => p.description || p.amount > 0);
}

function computeTotalPayable() {
  return readParticulars().reduce((sum, p) => sum + p.amount, 0);
}

function updateTotals() {
  const total = computeTotalPayable();
  const paid = parseFloat(document.getElementById("paidAmount")?.value) || 0;
  const remaining = Math.max(0, total - paid);

  const totalEl = document.getElementById("totalPayable");
  const balanceEl = document.getElementById("remainingBalance");
  const badge = document.getElementById("paymentStatusBadge");

  if (totalEl) totalEl.textContent = formatPeso(total);
  if (balanceEl) balanceEl.textContent = formatPeso(remaining);

  if (badge) {
    if (total <= 0) {
      badge.textContent = "No Amount";
      badge.className = "badge bg-secondary";
    } else if (remaining <= 0 && paid >= total) {
      badge.textContent = "Full Payment";
      badge.className = "badge cashier-badge-full";
    } else if (paid > 0) {
      badge.textContent = "Partial Payment";
      badge.className = "badge cashier-badge-partial";
    } else {
      badge.textContent = "Unpaid";
      badge.className = "badge bg-secondary";
    }
  }
  updateChangeDue();
}

function syncRemoveButtons() {
  const rows = getParticularRows();
  rows.forEach((row, idx) => {
    const btn = row.querySelector(".btn-remove-particular");
    if (btn) btn.style.visibility = rows.length > 1 ? "visible" : "hidden";
    if (idx === 0 && rows.length === 1) btn.style.visibility = "hidden";
  });
}

function createParticularRow(description = "", amount = 0) {
  const tr = document.createElement("tr");
  tr.className = "particular-row";
  tr.innerHTML = `
    <td><input type="text" class="form-control particular-desc" placeholder="Enter particular" /></td>
    <td><input type="number" class="form-control particular-amt" placeholder="0.00" step="0.01" min="0" value="0" /></td>
    <td><button type="button" class="btn btn-sm btn-outline-secondary btn-remove-particular" aria-label="Remove row"><i class="bi bi-x-lg" aria-hidden="true"></i></button></td>
  `;
  tr.querySelector(".particular-desc").value = description;
  tr.querySelector(".particular-amt").value = amount;
  return tr;
}

function addParticularRow() {
  const tbody = document.getElementById("particularsBody");
  if (!tbody) return;
  const tr = createParticularRow();
  tbody.appendChild(tr);
  bindParticularRow(tr);
  syncRemoveButtons();
}

function setParticularsFromLines(lines) {
  const tbody = document.getElementById("particularsBody");
  if (!tbody) return;
  const items = lines?.length ? lines : [{ description: "", amount: 0 }];
  tbody.innerHTML = "";
  items.forEach((line) => {
    const tr = createParticularRow(line.description || "", line.amount ?? 0);
    tbody.appendChild(tr);
    bindParticularRow(tr);
  });
  syncRemoveButtons();
  updateTotals();
}

function renderPaymentList(lines) {
  const wrap = document.getElementById("cashierPaymentListWrap");
  const list = document.getElementById("cashierPaymentList");
  if (!wrap || !list) return;

  if (!lines?.length) {
    wrap.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  list.innerHTML = lines
    .map((line) => {
      const assessed = Number(line.assessedAmount ?? line.amount ?? 0);
      const paid = Number(line.paidAmount ?? 0);
      const remaining = Number(line.amount ?? Math.max(0, assessed - paid));
      return `<li>
        <span>${escapeHtml(line.description)}</span>
        <span class="cashier-payment-list__detail">
          ${formatPeso(assessed)} assessed · ${formatPeso(paid)} paid · <strong>${formatPeso(remaining)} due</strong>
        </span>
      </li>`;
    })
    .join("");
  wrap.classList.remove("hidden");
}

function renderBalanceSummary(summary) {
  const wrap = document.getElementById("cashierBalanceSummaryWrap");
  const el = document.getElementById("cashierBalanceSummary");
  if (!wrap || !el) return;

  if (!summary || summary.totalAssessed == null) {
    wrap.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  const remaining = Number(summary.totalRemaining) || 0;
  const paid = Number(summary.totalPaid) || 0;
  const assessed = Number(summary.totalAssessed) || 0;

  let statusHtml = "";
  if (summary.isFullyPaid) {
    statusHtml = `<p class="cashier-balance-summary__note mb-0">This student has no remaining balance on enrollment fees.</p>`;
  } else if (paid > 0) {
    statusHtml = `<p class="cashier-balance-summary__note mb-0">Partial payment on file — collect remaining balance below.</p>`;
  } else {
    statusHtml = `<p class="cashier-balance-summary__note mb-0">Unpaid — registration and course fees are due.</p>`;
  }

  el.innerHTML = `
    <div class="cashier-balance-summary__grid">
      <div><span>Total assessed</span><strong>${formatPeso(assessed)}</strong></div>
      <div><span>Total paid</span><strong>${formatPeso(paid)}</strong></div>
      <div><span>Balance due</span><strong class="cashier-balance-summary__due">${formatPeso(remaining)}</strong></div>
    </div>
    ${statusHtml}
  `;
  wrap.classList.remove("hidden");
}

function hideBalanceSummary() {
  document.getElementById("cashierBalanceSummaryWrap")?.classList.add("hidden");
  const el = document.getElementById("cashierBalanceSummary");
  if (el) el.innerHTML = "";
}

async function fetchStudentFeeBalance(registrationId) {
  const res = await fetch(
    `/cashier/api/students/fees/?registration_id=${encodeURIComponent(registrationId)}`,
    { credentials: "same-origin" }
  );
  if (!res.ok) return null;
  return res.json();
}

async function applyStudentFees(student) {
  let feeData = null;

  if (student?.registrationId) {
    feeData = await fetchStudentFeeBalance(student.registrationId);
  }

  if (!feeData && student) {
    feeData = {
      feeLines: student.feeLines || [],
      assessedFeeLines: student.assessedFeeLines || student.feeLines || [],
      totalAssessed: student.totalAssessed,
      totalPaid: student.totalPaid,
      totalRemaining: student.totalRemaining,
      isFullyPaid: student.isFullyPaid,
    };
  }

  const remainingLines = feeData?.feeLines || [];
  const assessedLines = feeData?.assessedFeeLines || remainingLines;

  renderBalanceSummary(feeData);
  renderPaymentList(assessedLines);

  const particulars =
    remainingLines.length > 0
      ? remainingLines
      : [{ description: "", amount: 0 }];

  setParticularsFromLines(particulars);
  selectedStudentBalance = feeData;

  const paidInput = document.getElementById("paidAmount");
  const tenderedInput = document.getElementById("amountTendered");
  if (paidInput) {
    const due = Number(feeData?.totalRemaining) || 0;
    paidInput.value = due > 0 ? "" : "0";
    paidInput.placeholder = due > 0 ? `Up to ${formatPeso(due)}` : "0.00";
  }
  if (tenderedInput) tenderedInput.value = "";
  updateTotals();
}

function bindParticularRow(row) {
  row.querySelector(".particular-amt")?.addEventListener("input", updateTotals);
  row.querySelector(".particular-desc")?.addEventListener("input", updateTotals);
  row.querySelector(".btn-remove-particular")?.addEventListener("click", () => {
    if (getParticularRows().length <= 1) return;
    row.remove();
    syncRemoveButtons();
    updateTotals();
  });
}

function hideStudentDropdown() {
  const dd = document.getElementById("studentDropdown");
  if (dd) dd.classList.add("hidden");
}

function showStudentDropdown() {
  const dd = document.getElementById("studentDropdown");
  if (dd) dd.classList.remove("hidden");
}

function renderStudentDropdown(students) {
  const dd = document.getElementById("studentDropdown");
  if (!dd) return;

    if (!students.length) {
    dd.innerHTML = `<div class="cashier-student-dropdown__empty">No students found</div>`;
    showStudentDropdown();
    return;
  }

  dd.innerHTML = students
    .map(
      (s) => `
      <button type="button" class="cashier-student-dropdown__item">
        <span class="cashier-student-dropdown__name">${escapeHtml(s.name)}</span>
        <span class="cashier-student-dropdown__meta">${escapeHtml(s.paymentLabel || "Payment: Unpaid")} · ${escapeHtml(s.program)}</span>
      </button>
    `
    )
    .join("");

  dd.querySelectorAll(".cashier-student-dropdown__item").forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const s = students[idx];
      selectedStudent = { ...s };
      const input = document.getElementById("studentSearchInput");
      if (input) input.value = selectedStudent.name;
      document.getElementById("selectedStudentId").value = selectedStudent.id || "";
      document.getElementById("selectedRegistrationId").value = selectedStudent.registrationId || "";
      hideStudentDropdown();
      applyStudentFees(selectedStudent);
    });
  });
  showStudentDropdown();
}

async function searchStudents(query) {
  const q = encodeURIComponent(query);
  const res = await fetch(`/cashier/api/students/search/?q=${q}`, { credentials: "same-origin" });
  if (!res.ok) return [];
  const data = await res.json();
  return data.students || [];
}

async function fetchNextControlNumber() {
  try {
    const res = await fetch("/cashier/api/control-number/", { credentials: "same-origin" });
    if (res.ok) {
      const data = await res.json();
      if (data.controlNumber) return data.controlNumber;
    }
  } catch {
    /* fallback below */
  }
  const next = maxControlSeqFromTransactions() + 1;
  return formatControlNumber(next);
}

function resetPaymentForm() {
  const form = document.getElementById("paymentForm");
  form?.reset();
  selectedStudent = null;
  selectedStudentBalance = null;
  document.getElementById("selectedStudentId").value = "";
  document.getElementById("selectedRegistrationId").value = "";

  const tbody = document.getElementById("particularsBody");
  if (tbody) {
    tbody.innerHTML = "";
    const tr = createParticularRow();
    tbody.appendChild(tr);
    bindParticularRow(tr);
    syncRemoveButtons();
  }
  renderPaymentList([]);
  hideBalanceSummary();
  hideStudentDropdown();
  const tenderedInput = document.getElementById("amountTendered");
  if (tenderedInput) tenderedInput.value = "";
  updateTotals();
}

const SERVICE_INVOICE_ASSESSMENT_ROWS = [
  "REGISTRATION",
  "TRAINING FEE:",
  "LABORATORY FEE:",
  "ASSESSMENT FEE",
  "*OTHERS",
];

const SERVICE_INVOICE_EMPTY_ROWS = 8;

function getReceiptLogoUrls() {
  const modal = document.getElementById("receiptModal");
  return {
    valient: modal?.dataset.valientLogo || "/static/img/valient-logo.svg",
    tesda: modal?.dataset.tesdaLogo || "/static/img/TESDA%20Logo%20official.png",
  };
}

function formatInvoiceSerial(txn) {
  const raw = (txn.orNumber || txn.controlNumber || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits) return digits.slice(-6).padStart(6, "0");
  return "000000";
}

function formatInvoiceDate(txn) {
  const parsed = txn.createdAt ? new Date(txn.createdAt) : new Date();
  const source = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return source.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function matchAssessmentRowIndex(description) {
  const d = (description || "").toLowerCase();
  if (d.includes("registration")) return 0;
  if (d.includes("training")) return 1;
  if (d.includes("laboratory") || d.includes("lab fee") || d === "lab") return 2;
  if (d.includes("assessment")) return 3;
  return 4;
}

function buildAssessmentLineItems(particulars) {
  const rows = SERVICE_INVOICE_ASSESSMENT_ROWS.map((label) => ({
    label,
    assessment: 0,
    payment: 0,
    balance: 0,
  }));

  (particulars || []).forEach((p) => {
    const idx = matchAssessmentRowIndex(p.description);
    rows[idx].assessment += p.amount || 0;
  });

  return rows;
}

function distributePaymentAcrossRows(rows, totalPayable, paidAmount) {
  if (totalPayable <= 0 || paidAmount <= 0) {
    rows.forEach((row) => {
      row.payment = 0;
      row.balance = row.assessment;
    });
    return;
  }

  let allocated = 0;
  rows.forEach((row, index) => {
    if (row.assessment <= 0) {
      row.payment = 0;
      row.balance = 0;
      return;
    }

    const isLastWithAmount =
      rows.slice(index + 1).every((r) => r.assessment <= 0);
    const share = isLastWithAmount
      ? Math.max(0, paidAmount - allocated)
      : Math.min(row.assessment, (paidAmount * row.assessment) / totalPayable);
    row.payment = Math.round(share * 100) / 100;
    row.balance = Math.max(0, Math.round((row.assessment - row.payment) * 100) / 100);
    allocated += row.payment;
  });
}

function formatInvoiceMoney(amount) {
  if (!amount) return "";
  return formatPeso(amount).replace(/^₱\s?/, "");
}

function buildServiceInvoiceHtml(txn) {
  const logos = getReceiptLogoUrls();
  const lineItems = buildAssessmentLineItems(txn.particulars);
  distributePaymentAcrossRows(lineItems, txn.totalPayable, txn.paidAmount);

  const filledRows = lineItems
    .map(
      (row) => `
      <tr>
        <td class="service-invoice__assessment-label">${escapeHtml(row.label)}</td>
        <td class="service-invoice__money service-invoice__assessment-amt">${escapeHtml(formatInvoiceMoney(row.assessment))}</td>
        <td class="service-invoice__money">${escapeHtml(formatInvoiceMoney(row.payment))}</td>
        <td class="service-invoice__money">${escapeHtml(formatInvoiceMoney(row.balance))}</td>
        <td class="service-invoice__spacer" aria-hidden="true"></td>
      </tr>`
    )
    .join("");

  const emptyRows = Array.from({ length: SERVICE_INVOICE_EMPTY_ROWS })
    .map(
      () => `
      <tr>
        <td colspan="2"></td>
        <td></td>
        <td></td>
        <td class="service-invoice__spacer" aria-hidden="true"></td>
      </tr>`
    )
    .join("");

  const isFullPayment = txn.paidAmount >= txn.totalPayable && txn.totalPayable > 0;

  return `
    <article class="service-invoice" aria-label="Service invoice">
      <header class="service-invoice__header">
        <div class="service-invoice__logo service-invoice__logo--left">
          <img src="${escapeHtml(logos.valient)}" alt="Valiant Technical Institute logo" />
        </div>
        <div class="service-invoice__company">
          <h1 class="service-invoice__company-name">VALIANT TECHNICAL INSTITUTE AND ASSESSMENT CENTER, INC.</h1>
          <p>NON-VAT REG. TIN: 409-676-315-00000</p>
          <p>Bangoy St., Salvacion, 8105 City of Panabo</p>
          <p>Davao del Norte, Philippines</p>
          <p>E-mail Address: valianttiaci@gmail.com</p>
        </div>
        <div class="service-invoice__brand-side">
          <div class="service-invoice__logo service-invoice__logo--right">
            <img src="${escapeHtml(logos.tesda)}" alt="TESDA logo" />
          </div>
          <div class="service-invoice__doc-badge">Service INVOICE</div>
          <p class="service-invoice__invoice-no">
            <span>Invoice No.</span>
            <strong>${escapeHtml(formatInvoiceSerial(txn))}</strong>
          </p>
        </div>
      </header>

      <section class="service-invoice__meta">
        <div class="service-invoice__sales-type">
          <label class="service-invoice__check"><span class="service-invoice__box" aria-hidden="true"></span> CASH SALES</label>
          <label class="service-invoice__check"><span class="service-invoice__box" aria-hidden="true"></span> CHARGE SALES</label>
        </div>
        <div class="service-invoice__date">
          <span>Date:</span>
          <span class="service-invoice__date-value">${escapeHtml(formatInvoiceDate(txn))}</span>
        </div>
      </section>

      <section class="service-invoice__sold-to">
        <span class="service-invoice__sold-to-label">SOLD TO</span>
        <p><span>Registered Name:</span> <strong>${escapeHtml(txn.studentName || "")}</strong></p>
        <p><span>TIN:</span> <span class="service-invoice__line"></span></p>
        <p><span>Business Address:</span> <span class="service-invoice__line"></span></p>
        <p class="service-invoice__control-ref"><span>Control No:</span> ${escapeHtml(txn.controlNumber || "")}</p>
      </section>

      <table class="service-invoice__table">
        <colgroup>
          <col class="service-invoice__col-label" />
          <col class="service-invoice__col-assessment-amt" />
          <col class="service-invoice__col-payment" />
          <col class="service-invoice__col-balance" />
          <col class="service-invoice__col-spacer" />
        </colgroup>
        <thead>
          <tr>
            <th colspan="2">ASSESSMENT</th>
            <th>PAYMENT</th>
            <th>BALANCES</th>
            <th class="service-invoice__spacer" scope="col" aria-hidden="true"></th>
          </tr>
        </thead>
        <tbody>
          ${filledRows}
          ${emptyRows}
        </tbody>
      </table>

      <footer class="service-invoice__footer">
        <div class="service-invoice__footer-left">
          <p class="service-invoice__received">
            <span class="service-invoice__box" aria-hidden="true"></span>
            Received the amount of:
            <span class="service-invoice__amount-line">${escapeHtml(isFullPayment ? formatPeso(txn.paidAmount) : "")}</span>
          </p>
          <div class="service-invoice__id-sign">
            <div>
              <span>SC/PWD/NAAC/MOV/Solo Parent I.D. NO.:</span>
              <span class="service-invoice__mini-line"></span>
            </div>
            <div>
              <span>SC/PWD/NAAC/MOV Signature:</span>
              <span class="service-invoice__mini-line"></span>
            </div>
          </div>
          <div class="service-invoice__issued">
            <span>Issued by:</span>
            <span class="service-invoice__issued-line">${escapeHtml(txn.cashierName || "")}</span>
            <small>Cashier/Authorized Representative</small>
          </div>
          ${
            txn.amountTendered > 0
              ? `<p class="service-invoice__cash-meta mb-0 mt-2">
            <span>Cash tendered:</span> ${escapeHtml(formatPeso(txn.amountTendered))}
            · <span>Sukli:</span> ${escapeHtml(formatPeso(txn.changeDue || 0))}
          </p>`
              : ""
          }
        </div>
        <table class="service-invoice__totals">
          <tbody>
            <tr>
              <th scope="row">Total Sales</th>
              <td>${escapeHtml(formatPeso(txn.totalPayable))}</td>
            </tr>
            <tr>
              <th scope="row">LESS: (Discount SC/ PWD/NAAC/MOV/SP</th>
              <td></td>
            </tr>
            <tr>
              <th scope="row">Less: Withholding Tax</th>
              <td></td>
            </tr>
            <tr class="service-invoice__total-due">
              <th scope="row">TOTAL AMOUNT DUE</th>
              <td>${escapeHtml(formatPeso(txn.remainingBalance))}</td>
            </tr>
          </tbody>
        </table>
      </footer>

      <p class="service-invoice__disclaimer">"THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX"</p>

      <table class="service-invoice__printer" aria-label="Printer accreditation details">
        <tbody>
          <tr>
            <td colspan="6">Printer Name: DENORA PRINTING PRESS</td>
          </tr>
          <tr>
            <td colspan="3">TIN: 458-298-543-00000</td>
            <td colspan="3">Address: 035 Prk. Bearbrand, New Pandan, Panabo City, DDN</td>
          </tr>
          <tr>
            <td colspan="2">Printer's Accrdyn No.</td>
            <td colspan="2">Date Issued</td>
            <td colspan="2">Expiry Date</td>
          </tr>
          <tr>
            <td>BKLT. NO.</td>
            <td>CPS PER SET</td>
            <td>SERIAL NO.</td>
            <td>SETS</td>
            <td>BIR ATP NO.</td>
            <td>DATE ISSUED</td>
          </tr>
        </tbody>
      </table>
    </article>
  `;
}

function buildArReceiptHtml(txn) {
  const particularsRows = txn.particulars
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.description)}</td><td class="text-end">${formatPeso(p.amount)}</td></tr>`
    )
    .join("");

  return `
    <div class="cashier-receipt-simple">
      <div class="text-center mb-3">
        <strong>VTIAC</strong>
        <p class="mb-0 small text-muted">Acknowledgement Receipt</p>
      </div>
      <p><strong>Control No:</strong> ${escapeHtml(txn.controlNumber)}</p>
      ${txn.orNumber ? `<p><strong>OR No:</strong> ${escapeHtml(txn.orNumber)}</p>` : ""}
      <p><strong>Student:</strong> ${escapeHtml(txn.studentName)}</p>
      <p><strong>Date:</strong> ${escapeHtml(txn.dateTime)}</p>
      <p><strong>Cashier:</strong> ${escapeHtml(txn.cashierName || "—")}</p>
      ${
        txn.amountTendered > 0
          ? `<p><strong>Cash tendered:</strong> ${formatPeso(txn.amountTendered)} · <strong>Sukli:</strong> ${formatPeso(txn.changeDue || 0)}</p>`
          : ""
      }
      <table class="table table-sm mt-3">
        <thead><tr><th>Particular</th><th class="text-end">Amount</th></tr></thead>
        <tbody>${particularsRows}</tbody>
        <tfoot>
          <tr><th>Total</th><th class="text-end">${formatPeso(txn.totalPayable)}</th></tr>
          <tr><th>Paid</th><th class="text-end">${formatPeso(txn.paidAmount)}</th></tr>
          <tr><th>Balance</th><th class="text-end">${formatPeso(txn.remainingBalance)}</th></tr>
        </tfoot>
      </table>
      <p class="small text-muted mb-0">Status: ${escapeHtml(txn.status)}</p>
    </div>
  `;
}

function buildReceiptHtml(txn) {
  if (txn.receiptType === "AR") return buildArReceiptHtml(txn);
  return buildServiceInvoiceHtml(txn);
}

export function showReceiptModal(txn) {
  const receiptModal = document.getElementById("receiptModal");
  const content = document.getElementById("receiptContent");
  const title = document.getElementById("receiptTitle");
  if (!receiptModal || !content) return;

  if (title) {
    title.textContent = txn.receiptType === "AR" ? "Acknowledgement Receipt" : "Invoice";
  }
  content.innerHTML = buildReceiptHtml(txn);
  openModal(receiptModal);
}

function buildPaymentConfirmSummary(txn) {
  return `
    <dl>
      <dt>Student</dt><dd>${escapeHtml(txn.studentName)}</dd>
      <dt>Control No.</dt><dd>${escapeHtml(txn.controlNumber)}</dd>
      <dt>Amount to pay</dt><dd>${formatPeso(txn.paidAmount)}</dd>
      <dt>Cash tendered</dt><dd>${formatPeso(txn.amountTendered)}</dd>
      <dt>Sukli (change)</dt><dd>${formatPeso(txn.changeDue)}</dd>
      <dt>Remaining balance</dt><dd>${formatPeso(txn.remainingBalance)}</dd>
      <dt>Cashier</dt><dd>${escapeHtml(txn.cashierName)}</dd>
    </dl>
  `;
}

function collectPaymentPayload(form) {
  const controlNumber = document.getElementById("controlNumber")?.value?.trim();
  const studentName = document.getElementById("studentSearchInput")?.value?.trim();
  const particulars = readParticulars();
  const totalPayable = computeTotalPayable();
  const paidAmount = parseFloat(document.getElementById("paidAmount")?.value) || 0;
  const amountTendered = parseFloat(document.getElementById("amountTendered")?.value);
  const receiptType = form.querySelector('input[name="receiptType"]:checked')?.value || "OR";
  const studentId = document.getElementById("selectedStudentId")?.value;
  const registrationId = document.getElementById("selectedRegistrationId")?.value;

  return {
    controlNumber,
    studentName,
    particulars,
    totalPayable,
    paidAmount,
    amountTendered: Number.isFinite(amountTendered) ? amountTendered : paidAmount,
    receiptType,
    studentId,
    registrationId,
  };
}

function validatePaymentPayload(payload) {
  const {
    controlNumber,
    studentName,
    particulars,
    totalPayable,
    paidAmount,
    amountTendered,
    studentId,
    registrationId,
  } = payload;

  if (!controlNumber) return "Please enter or auto-generate a control number.";
  if (!parseControlNumberSeq(controlNumber)) return "Control number must be in CN-0001 format.";
  if (!studentName) return "Please search and select a student.";
  if (!studentId && !registrationId) {
    return "Select a student from the search results (must have an enrollment profile).";
  }
  if (!particulars.length || totalPayable <= 0) {
    return "Add at least one particular with an amount.";
  }

  const minMsg = validateMinimumPayment(paidAmount, totalPayable);
  if (minMsg) return minMsg;

  if (!Number.isFinite(amountTendered) || amountTendered <= 0) {
    return "Enter the cash amount tendered by the student.";
  }
  if (amountTendered + 0.009 < paidAmount) {
    return `Cash tendered (${formatPeso(amountTendered)}) is less than the amount to pay (${formatPeso(paidAmount)}).`;
  }

  const accountDue = Number(selectedStudentBalance?.totalRemaining);
  if (accountDue > 0 && totalPayable > accountDue + 0.01) {
    return `Total payable cannot exceed this student's remaining balance (${formatPeso(accountDue)}).`;
  }

  return "";
}

async function savePaymentTransaction(form, payload) {
  const {
    controlNumber,
    studentName,
    particulars,
    totalPayable,
    paidAmount,
    amountTendered,
    receiptType,
    studentId,
    registrationId,
  } = payload;

  const remainingBalance = Math.max(0, totalPayable - paidAmount);
  let status = "Unpaid";
  if (paidAmount >= totalPayable && totalPayable > 0) status = "Full Payment";
  else if (paidAmount > 0) status = "Partial Payment";

  const now = new Date();
  const txn = {
    id: `txn-${Date.now()}`,
    controlNumber,
    orNumber: document.getElementById("orNumber")?.value?.trim() || "",
    receiptType,
    studentName,
    studentId: studentId || null,
    registrationId: registrationId || null,
    particulars,
    totalPayable,
    paidAmount,
    amountTendered,
    changeDue: Math.max(0, amountTendered - paidAmount),
    remainingBalance,
    status,
    cashierName: getCashierName(),
    dateTime: now.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAt: now.toISOString(),
  };

  const submitBtn = form.querySelector("#paymentSubmitBtn") || form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const saved = await recordPaymentOnServer(txn);
    txn.serverPaymentId = saved?.id;
    if (saved?.cashierName) txn.cashierName = saved.cashierName;
    addTransaction(txn);
    closeModal(document.getElementById("paymentModal"));
    resetPaymentForm();
    showReceiptModal(txn);
    window.dispatchEvent(new CustomEvent("cashier:transaction-saved", { detail: txn }));
  } catch (err) {
    showPaymentMessage({
      title: "Payment not saved",
      message: err.message || "Payment could not be saved.",
    });
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export function initPaymentModal() {
  const paymentModal = document.getElementById("paymentModal");
  const form = document.getElementById("paymentForm");
  if (!paymentModal || !form) return;

  initPaymentMessageModal();

  const backdrop = document.getElementById("paymentModalBackdrop");
  const closeBtn = document.getElementById("paymentModalCloseBtn");
  const generateBtn = document.getElementById("generateControlNumberBtn");
  const addRowBtn = document.getElementById("addParticularRowBtn");
  const studentInput = document.getElementById("studentSearchInput");
  const paidInput = document.getElementById("paidAmount");

  backdrop?.addEventListener("click", () => closeModal(paymentModal));
  closeBtn?.addEventListener("click", () => closeModal(paymentModal));

  document.getElementById("receiptModalBackdrop")?.addEventListener("click", () => {
    const rm = document.getElementById("receiptModal");
    if (rm) closeModal(rm);
  });
  document.getElementById("receiptModalClose")?.addEventListener("click", () => {
    const rm = document.getElementById("receiptModal");
    if (rm) closeModal(rm);
  });
  document.getElementById("receiptPrintBtn")?.addEventListener("click", printReceiptOnly);

  generateBtn?.addEventListener("click", async () => {
    const cn = await fetchNextControlNumber();
    const input = document.getElementById("controlNumber");
    if (input) input.value = cn;
  });

  addRowBtn?.addEventListener("click", addParticularRow);
  paidInput?.addEventListener("input", () => {
    updateTotals();
    const tenderedEl = document.getElementById("amountTendered");
    const paid = parseFloat(paidInput?.value) || 0;
    if (tenderedEl && (!tenderedEl.value || parseFloat(tenderedEl.value) < paid)) {
      tenderedEl.value = paid > 0 ? String(paid) : "";
    }
    updateChangeDue();
  });
  document.getElementById("amountTendered")?.addEventListener("input", updateChangeDue);

  getParticularRows().forEach(bindParticularRow);
  syncRemoveButtons();
  updateTotals();

  studentInput?.addEventListener("input", () => {
    selectedStudent = null;
    selectedStudentBalance = null;
    document.getElementById("selectedStudentId").value = "";
    document.getElementById("selectedRegistrationId").value = "";
    renderPaymentList([]);
    hideBalanceSummary();
    const q = studentInput.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) {
      hideStudentDropdown();
      return;
    }
    searchTimer = setTimeout(async () => {
      const students = await searchStudents(q);
      renderStudentDropdown(students);
    }, 250);
  });

  studentInput?.addEventListener("blur", () => {
    setTimeout(hideStudentDropdown, 200);
  });

  studentInput?.addEventListener("focus", () => {
    const q = studentInput.value.trim();
    if (q.length >= 2) {
      searchStudents(q).then(renderStudentDropdown);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const payload = collectPaymentPayload(form);
    const error = validatePaymentPayload(payload);
    if (error) {
      showPaymentMessage({ title: "Check payment details", message: error });
      return;
    }

    const remainingBalance = Math.max(0, payload.totalPayable - payload.paidAmount);
    const changeDue = Math.max(0, payload.amountTendered - payload.paidAmount);
    const previewTxn = {
      studentName: payload.studentName,
      controlNumber: payload.controlNumber,
      paidAmount: payload.paidAmount,
      amountTendered: payload.amountTendered,
      changeDue,
      remainingBalance,
      cashierName: getCashierName(),
    };

    showPaymentMessage({
      title: "Confirm payment",
      subtitle: "Review amounts before generating the receipt.",
      message: "Proceed with this payment?",
      primaryLabel: "Yes, generate receipt",
      showCancel: true,
      summaryHtml: buildPaymentConfirmSummary(previewTxn),
      onPrimary: () => savePaymentTransaction(form, payload),
    });
  });
}

export function selectStudentForPayment(student) {
  if (!student) return;
  selectedStudent = { ...student };
  const input = document.getElementById("studentSearchInput");
  if (input) input.value = selectedStudent.name || "";
  document.getElementById("selectedStudentId").value = selectedStudent.id || "";
  document.getElementById("selectedRegistrationId").value = selectedStudent.registrationId || "";
  applyStudentFees(selectedStudent);
}

export function openPaymentModal() {
  const paymentModal = document.getElementById("paymentModal");
  if (!paymentModal) return;
  resetPaymentForm();
  openModal(paymentModal);
}
