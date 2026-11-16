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
      paidAmount: txn.amountPaid ?? txn.paidAmount,
      status: txn.status,
      cashierName: txn.cashierName,
      isScholar: txn.isScholar,
      scholarCodeName: txn.scholarCodeName,
      voucherAmount: txn.voucherAmount,
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

function isNewStudentPayment() {
  if (!selectedStudentBalance) return false;
  if (selectedStudentBalance.isNewStudent === true) return true;
  const totalPaid = Number(selectedStudentBalance.totalPaid);
  const totalAssessed = Number(selectedStudentBalance.totalAssessed);
  return totalPaid <= 0 && totalAssessed > 0;
}

function hasSelectedStudent() {
  return Boolean(
    selectedStudent &&
      (selectedStudent.registrationId ||
        selectedStudent.id ||
        document.getElementById("selectedRegistrationId")?.value ||
        document.getElementById("selectedStudentId")?.value)
  );
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

function paymentAmounts(totalPayable, amountPaid) {
  const total = Number(totalPayable) || 0;
  const paid = Number(amountPaid) || 0;
  const credited = Math.min(paid, total);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);
  return { total, paid, credited, remaining, change };
}

function isScholarVoucherApplied() {
  const chk = document.getElementById("isScholarCheckbox");
  return Boolean(chk && !chk.disabled && chk.checked);
}

function getScholarVoucherAmount() {
  if (!isScholarVoucherApplied()) return 0;
  const val = parseFloat(document.getElementById("scholarVoucherAmount")?.value);
  return Number.isFinite(val) && val > 0 ? val : 0;
}

function computeParticularsSubtotal() {
  return readParticulars().reduce((sum, p) => sum + p.amount, 0);
}

function computeTotalPayable() {
  const subtotal = computeParticularsSubtotal();
  const voucher = getScholarVoucherAmount();
  return Math.max(0, subtotal - voucher);
}

function validateMinimumPayment(paidAmount, totalPayable) {
  const minPay = getMinPaymentAmount();
  if (totalPayable <= 0) {
    if (paidAmount < 0) {
      return "Amount paid cannot be negative.";
    }
    return "";
  }
  if (paidAmount <= 0) {
    return "Enter the amount paid by the student.";
  }
  if (totalPayable < minPay) {
    if (paidAmount + 0.009 < totalPayable) {
      return `Payment must cover the full balance of ${formatPeso(totalPayable)}.`;
    }
    return "";
  }
  if (paidAmount + 0.009 < minPay) {
    if (isNewStudentPayment()) {
      return `New students must pay at least ${formatPeso(minPay)}. Amounts below ${formatPeso(minPay)} are not allowed.`;
    }
    return `Minimum payment per transaction is ${formatPeso(minPay)}.`;
  }
  return "";
}

function syncPaidAmountFieldState() {
  const paidInput = document.getElementById("paidAmount");
  const minHint = document.getElementById("minPaymentHint");
  if (!paidInput) return;

  const total = computeTotalPayable();
  const studentSelected = hasSelectedStudent();
  const voucherApplied = isScholarVoucherApplied() && getScholarVoucherAmount() > 0;
  const isZeroPayable = total <= 0 && voucherApplied;
  const shouldDisable = !studentSelected || (total <= 0 && !voucherApplied);

  paidInput.disabled = shouldDisable || isZeroPayable;
  paidInput.classList.toggle("cashier-amount-input--muted", shouldDisable || isZeroPayable);

  if (isZeroPayable) {
    paidInput.value = "0";
  } else if (shouldDisable) {
    paidInput.value = "0";
  }

  if (minHint) {
    if (isZeroPayable) {
      minHint.innerHTML = `<span class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>100% covered by scholar grant voucher. No out-of-pocket payment required.</span>`;
    } else {
      const minPay = formatPeso(getMinPaymentAmount());
      if (isNewStudentPayment() && total >= getMinPaymentAmount()) {
        minHint.innerHTML = `New students must pay at least <strong>${minPay}</strong> on their first payment.`;
      } else {
        minHint.innerHTML = `Minimum payment per transaction is <strong>${minPay}</strong> (unless the full balance due is less).`;
      }
    }
  }
}

function showPaidAmountError(message) {
  const el = document.getElementById("paidAmountError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("d-none");
  } else {
    el.textContent = "";
    el.classList.add("d-none");
  }
}

function validatePaidAmountInput() {
  const paidInput = document.getElementById("paidAmount");
  if (!paidInput || paidInput.disabled) {
    showPaidAmountError("");
    return "";
  }

  const total = computeTotalPayable();
  const paid = parseFloat(paidInput.value) || 0;
  if (paid <= 0) {
    showPaidAmountError("");
    paidInput.setCustomValidity("");
    return "";
  }

  const msg = validateMinimumPayment(paid, total);
  showPaidAmountError(msg);
  paidInput.setCustomValidity(msg);
  return msg;
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

function updateTotals() {
  syncPaidAmountFieldState();

  const subtotal = computeParticularsSubtotal();
  const voucher = getScholarVoucherAmount();
  const voucherActive = isScholarVoucherApplied();
  const total = computeTotalPayable();

  const paidInput = document.getElementById("paidAmount");
  const amountPaid =
    paidInput && !paidInput.disabled ? parseFloat(paidInput.value) || 0 : 0;
  const { remaining, change } = paymentAmounts(total, amountPaid);

  const subtotalEl = document.getElementById("particularsSubtotal");
  const voucherRow = document.getElementById("scholarVoucherDeductionRow");
  const voucherEl = document.getElementById("scholarVoucherDeductionDisplay");

  if (subtotalEl) subtotalEl.textContent = formatPeso(subtotal);
  if (voucherRow && voucherEl) {
    if (voucherActive && voucher > 0) {
      voucherRow.classList.remove("d-none");
      voucherEl.textContent = `-${formatPeso(voucher)}`;
    } else {
      voucherRow.classList.add("d-none");
      voucherEl.textContent = "-₱0.00";
    }
  }

  const totalEl = document.getElementById("totalPayable");
  const balanceEl = document.getElementById("remainingBalance");
  const changeEl = document.getElementById("changeDue");
  const badge = document.getElementById("paymentStatusBadge");
  const submitBtn = document.getElementById("paymentSubmitBtn");

  if (totalEl) totalEl.textContent = formatPeso(total);
  if (balanceEl) balanceEl.textContent = formatPeso(remaining);
  if (changeEl) changeEl.textContent = formatPeso(change);

  if (badge) {
    if (subtotal <= 0) {
      badge.textContent = "No Amount";
      badge.className = "badge bg-secondary";
    } else if (voucherActive && voucher >= subtotal && total <= 0) {
      badge.textContent = "Full Payment (Voucher Covered)";
      badge.className = "badge cashier-badge-full";
    } else if (remaining <= 0 && amountPaid >= total) {
      badge.textContent = "Full Payment";
      badge.className = "badge cashier-badge-full";
    } else if (amountPaid > 0) {
      badge.textContent = "Partial Payment";
      badge.className = "badge cashier-badge-partial";
    } else {
      badge.textContent = "Unpaid";
      badge.className = "badge bg-secondary";
    }
  }

  const amountError = validatePaidAmountInput();
  if (submitBtn) {
    const isVoucherFullyCovered = voucherActive && voucher > 0 && total <= 0 && subtotal > 0;
    const blocked =
      !hasSelectedStudent() ||
      subtotal <= 0 ||
      (!isVoucherFullyCovered && (total <= 0 || amountPaid <= 0 || Boolean(amountError)));
    submitBtn.disabled = blocked;
  }
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
    const totalPaid = Number(student.totalPaid) || 0;
    const totalAssessed = Number(student.totalAssessed) || 0;
    feeData = {
      feeLines: student.feeLines || [],
      assessedFeeLines: student.assessedFeeLines || student.feeLines || [],
      totalAssessed: student.totalAssessed,
      totalPaid: student.totalPaid,
      totalRemaining: student.totalRemaining,
      isFullyPaid: student.isFullyPaid,
      isNewStudent: student.isNewStudent ?? (totalPaid <= 0 && totalAssessed > 0),
      isScholar: student.isScholar ?? false,
      scholarCodeName: student.scholarCodeName || "",
      voucherAmount: student.voucherAmount || 0,
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
  if (paidInput) {
    const due = Number(feeData?.totalRemaining) || 0;
    paidInput.value = due > 0 ? "" : "0";
    paidInput.placeholder = due > 0 ? `Up to ${formatPeso(due)}` : "0.00";
  }

  // Scholar Grant Handling
  const scholarCheckbox = document.getElementById("isScholarCheckbox");
  const scholarFieldsWrap = document.getElementById("scholarFieldsWrap");
  const scholarCodeNameInput = document.getElementById("scholarCodeName");
  const scholarVoucherInput = document.getElementById("scholarVoucherAmount");
  const scholarBadge = document.getElementById("scholarGrantStatusBadge");
  const scholarHint = document.getElementById("scholarGrantHint");

  const isScholar = Boolean(feeData?.isScholar ?? student?.isScholar);
  const scholarCodeName = feeData?.scholarCodeName || student?.scholarCodeName || "";
  const voucherAmount = Number(feeData?.voucherAmount ?? student?.voucherAmount) || 0;

  if (scholarCheckbox) {
    if (isScholar) {
      scholarCheckbox.disabled = false;
      scholarCheckbox.checked = true;
      if (scholarBadge) {
        scholarBadge.textContent = "Verified Scholar Grantee";
        scholarBadge.className = "badge bg-success-subtle text-success border border-success-subtle text-xs";
      }
      if (scholarHint) {
        scholarHint.textContent = "Active scholar grant found in database. Voucher deduction will be applied to this student alone.";
      }
      if (scholarFieldsWrap) scholarFieldsWrap.classList.remove("d-none");
      if (scholarCodeNameInput) scholarCodeNameInput.value = scholarCodeName;
      if (scholarVoucherInput) scholarVoucherInput.value = voucherAmount > 0 ? voucherAmount.toFixed(2) : "0.00";
    } else {
      scholarCheckbox.disabled = true;
      scholarCheckbox.checked = false;
      if (scholarBadge) {
        scholarBadge.textContent = "Not in Scholar Grant Database";
        scholarBadge.className = "badge bg-secondary-subtle text-secondary border text-xs";
      }
      if (scholarHint) {
        scholarHint.textContent = "This student has no active scholarship grant record in the database.";
      }
      if (scholarFieldsWrap) scholarFieldsWrap.classList.add("d-none");
      if (scholarCodeNameInput) scholarCodeNameInput.value = "";
      if (scholarVoucherInput) scholarVoucherInput.value = "0.00";
    }
  }

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

function controlNumberFromLocalTransactions() {
  return formatControlNumber(maxControlSeqFromTransactions() + 1);
}

async function assignNextControlNumber() {
  const input = document.getElementById("controlNumber");
  if (!input) return;
  input.removeAttribute("placeholder");
  input.value = controlNumberFromLocalTransactions();
  try {
    const cn = await fetchNextControlNumber();
    if (cn) input.value = cn;
  } catch {
    /* keep local fallback visible */
  }
}

function resetScholarGrantSection() {
  const scholarCheckbox = document.getElementById("isScholarCheckbox");
  if (scholarCheckbox) {
    scholarCheckbox.checked = false;
    scholarCheckbox.disabled = true;
  }
  const scholarFieldsWrap = document.getElementById("scholarFieldsWrap");
  if (scholarFieldsWrap) scholarFieldsWrap.classList.add("d-none");
  const scholarCodeName = document.getElementById("scholarCodeName");
  if (scholarCodeName) scholarCodeName.value = "";
  const scholarVoucherAmount = document.getElementById("scholarVoucherAmount");
  if (scholarVoucherAmount) scholarVoucherAmount.value = "0";
  const scholarBadge = document.getElementById("scholarGrantStatusBadge");
  if (scholarBadge) {
    scholarBadge.textContent = "Select student";
    scholarBadge.className = "badge bg-secondary-subtle text-secondary border text-xs";
  }
  const scholarHint = document.getElementById("scholarGrantHint");
  if (scholarHint) {
    scholarHint.textContent = "Select a student to check scholarship grant status in the database.";
  }
}

function resetPaymentForm() {
  const form = document.getElementById("paymentForm");
  form?.reset();
  selectedStudent = null;
  selectedStudentBalance = null;
  document.getElementById("selectedStudentId").value = "";
  document.getElementById("selectedRegistrationId").value = "";
  resetScholarGrantSection();

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
  updateTotals();
}

function getReceiptLogoUrls() {
  const modal = document.getElementById("receiptModal");
  return {
    valient: modal?.dataset.valientLogo || "/static/img/valient-logo.svg",
    tesda: modal?.dataset.tesdaLogo || "/static/img/TESDA%20Logo%20official.png",
  };
}

function formatInvoiceStudentName(name) {
  return String(name || "").trim().toUpperCase();
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

function getTxnScholarVoucherInfo(txn) {
  let voucherAmount = 0;
  let voucherDescription = "";
  let grantName = "";

  const voucherParticular = (txn.particulars || []).find(
    (p) => p.isVoucher || Number(p.amount) < 0 || /less:\s*scholar/i.test(p.description || "")
  );

  if (voucherParticular) {
    voucherAmount = Math.abs(Number(voucherParticular.amount) || 0);
    voucherDescription = voucherParticular.description || "";
  }

  if (!voucherAmount && (txn.isScholar || Number(txn.voucherAmount) > 0)) {
    voucherAmount = Number(txn.voucherAmount) || 0;
    grantName = txn.scholarCodeName || "Scholarship Grant";
    voucherDescription = `Less: Scholar Grant Voucher (${grantName})`;
  }

  if (voucherParticular && !grantName) {
    const match = voucherParticular.description?.match(/\(([^)]+)\)/);
    grantName = match ? match[1] : (txn.scholarCodeName || "Scholarship Grant");
  } else if (!grantName) {
    grantName = txn.scholarCodeName || "Scholarship Grant";
  }

  return {
    hasVoucher: voucherAmount > 0,
    voucherAmount,
    voucherDescription: voucherDescription || `Less: Scholar Grant Voucher (${grantName})`,
    grantName,
  };
}

function getTxnGrossAssessment(txn) {
  const positiveParticulars = (txn.particulars || []).filter(
    (p) => (Number(p.amount) || 0) > 0 && !p.isVoucher && !/less:\s*scholar/i.test(p.description || "")
  );
  const sum = positiveParticulars.reduce((acc, p) => acc + Number(p.amount), 0);
  if (sum > 0) return sum;
  const { voucherAmount } = getTxnScholarVoucherInfo(txn);
  return (Number(txn.totalPayable) || 0) + voucherAmount;
}

function buildParticularLineItems(txn) {
  const particulars = (txn.particulars || []).filter(
    (p) => (Number(p.amount) || 0) > 0 && !p.isVoucher && !/less:\s*scholar/i.test(p.description || "") && String(p.description || "").trim()
  );
  if (!particulars.length) return [];

  const totalPayable = Number(txn.totalPayable) || 0;
  const credited =
    txn.creditedAmount != null
      ? Number(txn.creditedAmount)
      : Math.min(Number(txn.amountPaid ?? txn.paidAmount) || 0, totalPayable);

  let allocated = 0;
  return particulars.map((p, index) => {
    const assessment = Number(p.amount) || 0;
    const isLast = index === particulars.length - 1;
    let payment = 0;
    if (totalPayable > 0 && credited > 0) {
      payment = isLast
        ? Math.max(0, Math.round((credited - allocated) * 100) / 100)
        : Math.min(
            assessment,
            Math.round(((credited * assessment) / totalPayable) * 100) / 100
          );
    }
    allocated += payment;
    return {
      label: String(p.description).trim(),
      assessment,
      payment,
      balance: Math.max(0, Math.round((assessment - payment) * 100) / 100),
    };
  });
}

function formatInvoiceMoney(amount) {
  if (!amount) return "";
  return formatPeso(amount).replace(/^₱\s?/, "");
}

function formatInvoiceParticularLabel(label) {
  if (!label) return "";
  const trimmed = String(label).trim();
  const match = trimmed.match(/^([^(]+)\s*(\([^)]+\)(?:\s+[A-Za-z0-9\s]+)?)$/);
  if (match) {
    const main = match[1].trim();
    const sub = match[2].trim();
    return `<div>${escapeHtml(main)}</div><div class="service-invoice__grant-subtext" style="font-size:0.56rem;font-weight:normal;color:#333;line-height:1.2;margin-top:0.06rem;">${escapeHtml(sub)}</div>`;
  }
  return `<div>${escapeHtml(trimmed)}</div>`;
}

const SERVICE_INVOICE_BLANK_ROWS = 6;

function buildInvoiceBlankRows() {
  return Array.from({ length: SERVICE_INVOICE_BLANK_ROWS })
    .map(
      () => `
      <tr class="service-invoice__blank-row">
        <td colspan="2"></td>
        <td></td>
        <td></td>
        <td class="service-invoice__spacer" aria-hidden="true"></td>
      </tr>`
    )
    .join("");
}

function buildServiceInvoiceHtml(txn) {
  const logos = getReceiptLogoUrls();
  const voucherInfo = getTxnScholarVoucherInfo(txn);
  const grossAssessment = getTxnGrossAssessment(txn);
  const lineItems = buildParticularLineItems(txn);

  const particularRows = lineItems.length
    ? lineItems
        .map(
          (row) => `
      <tr>
        <td class="service-invoice__assessment-label" style="white-space: normal; word-break: break-word; line-height: 1.25; overflow-wrap: break-word;">${formatInvoiceParticularLabel(row.label)}</td>
        <td class="service-invoice__money service-invoice__assessment-amt" style="text-align: right; white-space: nowrap;">${escapeHtml(formatInvoiceMoney(row.assessment))}</td>
        <td class="service-invoice__money" style="text-align: right; white-space: nowrap;">${escapeHtml(formatInvoiceMoney(row.payment))}</td>
        <td class="service-invoice__money" style="text-align: right; white-space: nowrap;">${escapeHtml(formatInvoiceMoney(row.balance))}</td>
        <td class="service-invoice__spacer" aria-hidden="true"></td>
      </tr>`
        )
        .join("")
    : `
      <tr>
        <td class="service-invoice__assessment-label" colspan="2" style="white-space: normal;">—</td>
        <td></td>
        <td></td>
        <td class="service-invoice__spacer" aria-hidden="true"></td>
      </tr>`;

  const voucherRowHtml = voucherInfo.hasVoucher
    ? `
      <tr class="service-invoice__voucher-row">
        <td class="service-invoice__assessment-label" style="white-space: normal; word-break: break-word; line-height: 1.25; overflow-wrap: break-word;">
          <div>Less: Scholar Voucher</div>
          <div class="service-invoice__grant-subtext" style="font-size:0.56rem;font-weight:normal;color:#333;line-height:1.2;margin-top:0.06rem;">(${escapeHtml(voucherInfo.grantName)})</div>
        </td>
        <td class="service-invoice__money service-invoice__assessment-amt" style="text-align: right; white-space: nowrap;">-${escapeHtml(formatInvoiceMoney(voucherInfo.voucherAmount))}</td>
        <td class="service-invoice__money" style="text-align: right; white-space: nowrap;">${escapeHtml(formatInvoiceMoney(voucherInfo.voucherAmount))}</td>
        <td class="service-invoice__money" style="text-align: right; white-space: nowrap;">0.00</td>
        <td class="service-invoice__spacer" aria-hidden="true"></td>
      </tr>`
    : "";

  const amountPaid = Number(txn.amountPaid ?? txn.paidAmount) || 0;
  const changeDue = Number(txn.changeDue) || 0;

  return `
    <article class="service-invoice" aria-label="Service invoice">
      <!-- Watermark behind receipt (diagonal government-style, per PH reference) -->
      <div class="service-invoice__watermark" aria-hidden="true" data-watermark="NOT OFFICIAL RECEIPT">
        <span>NOT OFFICIAL RECEIPT</span>
      </div>
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
            <span>Control Number</span>
            <strong>${escapeHtml(txn.controlNumber || "—")}</strong>
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
        <p>
          <span>Registered Name:</span> <strong>${escapeHtml(formatInvoiceStudentName(txn.studentName))}</strong>
        </p>
        ${voucherInfo.hasVoucher ? `<p><span>Scholar Grant:</span> <strong>${escapeHtml(voucherInfo.grantName)}</strong></p>` : ""}
        <p><span>TIN:</span> <span class="service-invoice__line"></span></p>
        <p><span>Business Address:</span> <span class="service-invoice__line"></span></p>
      </section>

      <table class="service-invoice__table" style="table-layout: fixed; width: 100%;">
        <colgroup>
          <col class="service-invoice__col-label" style="width: 40%; min-width: 12rem;" />
          <col class="service-invoice__col-assessment-amt" style="width: 15%; min-width: 3.5rem;" />
          <col class="service-invoice__col-payment" style="width: 15%; min-width: 3.5rem;" />
          <col class="service-invoice__col-balance" style="width: 15%; min-width: 3.5rem;" />
          <col class="service-invoice__col-spacer" style="width: 15%;" />
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
          ${particularRows}
          ${voucherRowHtml}
          ${buildInvoiceBlankRows()}
        </tbody>
      </table>

      <footer class="service-invoice__footer">
        <div class="service-invoice__footer-left">
          <p class="service-invoice__received">
            <span class="service-invoice__box" aria-hidden="true"></span>
            Received the amount of:
            <span class="service-invoice__amount-line">${amountPaid > 0 ? escapeHtml(formatPeso(amountPaid)) : "0.00"}</span>
          </p>
          ${
            changeDue > 0
              ? `<p class="service-invoice__change mb-0 mt-1"><span>Change:</span> <strong>${escapeHtml(formatPeso(changeDue))}</strong></p>`
              : ""
          }
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
            <p class="service-invoice__issued-label mb-0"><span>Issued by:</span></p>
            <p class="service-invoice__issued-name mb-0">${escapeHtml(txn.cashierName || "—")}</p>
            <p class="service-invoice__issued-role mb-0">Cashier / Authorized Representative</p>
          </div>
        </div>
        <table class="service-invoice__totals">
          <tbody>
            <tr>
              <th scope="row">Gross Assessment</th>
              <td>${escapeHtml(formatPeso(grossAssessment))}</td>
            </tr>
            ${
              voucherInfo.hasVoucher
                ? `<tr class="service-invoice__discount-row">
                    <th scope="row">
                      LESS: Scholar Voucher
                      <span class="d-block font-monospace" style="font-size:0.56rem;font-weight:normal;color:#333;">(${escapeHtml(voucherInfo.grantName)})</span>
                    </th>
                    <td class="fw-bold">-${escapeHtml(formatPeso(voucherInfo.voucherAmount))}</td>
                  </tr>`
                : `<tr>
                    <th scope="row">LESS: (Discount SC/ PWD/NAAC/MOV/SP)</th>
                    <td></td>
                  </tr>`
            }
            <tr>
              <th scope="row">Less: Withholding Tax</th>
              <td></td>
            </tr>
            ${
              changeDue > 0
                ? `<tr class="service-invoice__change-row">
              <th scope="row">Change</th>
              <td>${escapeHtml(formatPeso(changeDue))}</td>
            </tr>`
                : ""
            }
            <tr class="service-invoice__total-due">
              <th scope="row">TOTAL AMOUNT DUE</th>
              <td>${escapeHtml(formatPeso(txn.totalPayable))}</td>
            </tr>
            <tr>
              <th scope="row">Amount Paid (Cash)</th>
              <td>${escapeHtml(formatPeso(amountPaid))}</td>
            </tr>
            <tr>
              <th scope="row">Remaining Balance</th>
              <td>${escapeHtml(formatPeso(txn.remainingBalance))}</td>
            </tr>
          </tbody>
        </table>
      </footer>
      <p class="service-invoice__disclaimer mb-0">
        THIS DOCUMENT IS NOT AN OFFICIAL RECEIPT &bull; FOR REFERENCE PURPOSES ONLY
      </p>
    </article>
  `;
}

function buildArReceiptHtml(txn) {
  const voucherInfo = getTxnScholarVoucherInfo(txn);
  const grossAssessment = getTxnGrossAssessment(txn);

  const positiveParticulars = (txn.particulars || []).filter(
    (p) => (Number(p.amount) || 0) > 0 && !p.isVoucher && !/less:\s*scholar/i.test(p.description || "")
  );

  const particularsRows = positiveParticulars
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.description)}</td><td class="text-end">${formatPeso(p.amount)}</td></tr>`
    )
    .join("");

  const voucherRow = voucherInfo.hasVoucher
    ? `<tr>
        <td>
          <div>Less: Scholar Voucher</div>
          <div class="small text-muted">(${escapeHtml(voucherInfo.grantName)})</div>
        </td>
        <td class="text-end">-${formatPeso(voucherInfo.voucherAmount)}</td>
       </tr>`
    : "";

  return `
    <div class="cashier-receipt-simple">
      <!-- Watermark behind receipt (diagonal government-style, per PH reference) -->
      <div class="service-invoice__watermark service-invoice__watermark--simple" aria-hidden="true" data-watermark="NOT OFFICIAL RECEIPT">
        <span>NOT OFFICIAL RECEIPT</span>
      </div>
      <div class="text-center mb-3">
        <strong>VTIAC</strong>
        <p class="mb-0 small text-muted">Acknowledgement Receipt</p>
      </div>
      <p><strong>Control No:</strong> ${escapeHtml(txn.controlNumber)}</p>
      ${txn.orNumber ? `<p><strong>OR No:</strong> ${escapeHtml(txn.orNumber)}</p>` : ""}
      <p><strong>Student:</strong> ${escapeHtml(formatInvoiceStudentName(txn.studentName))}</p>
      ${voucherInfo.hasVoucher ? `<p><strong>Scholar Grant:</strong> <span>${escapeHtml(voucherInfo.grantName)}</span></p>` : ""}
      <p><strong>Date:</strong> ${escapeHtml(txn.dateTime)}</p>
      <p><strong>Cashier:</strong> ${escapeHtml(txn.cashierName || "—")}</p>
      ${(txn.changeDue || 0) > 0 ? `<p><strong>Change:</strong> ${formatPeso(txn.changeDue)}</p>` : ""}
      <table class="table table-sm mt-3">
        <thead><tr><th>Particular</th><th class="text-end">Amount</th></tr></thead>
        <tbody>
          ${particularsRows}
          ${voucherRow}
        </tbody>
        <tfoot>
          ${voucherInfo.hasVoucher ? `<tr><th>Gross Assessment</th><th class="text-end">${formatPeso(grossAssessment)}</th></tr>` : ""}
          ${voucherInfo.hasVoucher ? `<tr><th>Less: Voucher (${escapeHtml(voucherInfo.grantName)})</th><th class="text-end">-${formatPeso(voucherInfo.voucherAmount)}</th></tr>` : ""}
          <tr><th>Total Payable</th><th class="text-end">${formatPeso(txn.totalPayable)}</th></tr>
          <tr><th>Amount Paid</th><th class="text-end">${formatPeso(txn.paidAmount ?? txn.amountPaid)}</th></tr>
          <tr><th>Remaining Balance</th><th class="text-end">${formatPeso(txn.remainingBalance)}</th></tr>
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
  const voucherRow = txn.isScholar && txn.voucherAmount > 0
    ? `<dt>Scholar Voucher</dt><dd class="text-success">-${formatPeso(txn.voucherAmount)} (${escapeHtml(txn.scholarCodeName || "Grant")})</dd>`
    : "";
  return `
    <dl>
      <dt>Student</dt><dd>${escapeHtml(txn.studentName)}</dd>
      <dt>Control No.</dt><dd>${escapeHtml(txn.controlNumber)}</dd>
      ${voucherRow}
      <dt>Total payable</dt><dd>${formatPeso(txn.totalPayable)}</dd>
      <dt>Amount paid</dt><dd>${formatPeso(txn.amountPaid ?? txn.paidAmount)}</dd>
      <dt>Change</dt><dd>${formatPeso(txn.changeDue || 0)}</dd>
      <dt>Remaining balance</dt><dd>${formatPeso(txn.remainingBalance)}</dd>
      <dt>Cashier</dt><dd>${escapeHtml(txn.cashierName)}</dd>
    </dl>
  `;
}

function collectPaymentPayload(form) {
  const controlNumber = document.getElementById("controlNumber")?.value?.trim();
  const studentName = document.getElementById("studentSearchInput")?.value?.trim();
  const particulars = readParticulars();
  const particularsSubtotal = computeParticularsSubtotal();
  const isScholar = isScholarVoucherApplied();
  const scholarCodeName = document.getElementById("scholarCodeName")?.value?.trim() || "";
  const voucherAmount = getScholarVoucherAmount();
  const totalPayable = computeTotalPayable();
  const amountPaid = parseFloat(document.getElementById("paidAmount")?.value) || 0;
  const receiptType = form.querySelector('input[name="receiptType"]:checked')?.value || "OR";
  const studentId = document.getElementById("selectedStudentId")?.value;
  const registrationId = document.getElementById("selectedRegistrationId")?.value;
  const amounts = paymentAmounts(totalPayable, amountPaid);

  return {
    controlNumber,
    studentName,
    particulars,
    particularsSubtotal,
    isScholar,
    scholarCodeName,
    voucherAmount,
    totalPayable,
    amountPaid,
    creditedAmount: amounts.credited,
    remainingBalance: amounts.remaining,
    changeDue: amounts.change,
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
    amountPaid,
    studentId,
    registrationId,
    isScholar,
    scholarCodeName,
    voucherAmount,
    particularsSubtotal,
  } = payload;

  if (!controlNumber) return "Please enter or auto-generate a control number.";
  if (!parseControlNumberSeq(controlNumber)) return "Control number must be in CN-0001 format.";
  if (!studentName) return "Please search and select a student.";
  if (!studentId && !registrationId) {
    return "Select a student from the search results (must have an enrollment profile).";
  }
  if (!particulars.length || particularsSubtotal <= 0) {
    return "Add at least one particular with an amount.";
  }

  if (isScholar && voucherAmount > 0 && !scholarCodeName) {
    return "Please enter the scholarship grant code or name.";
  }

  const isVoucherFullyCovered = isScholar && voucherAmount > 0 && totalPayable <= 0;
  if (!isVoucherFullyCovered) {
    const minMsg = validateMinimumPayment(amountPaid, totalPayable);
    if (minMsg) return minMsg;
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
    amountPaid,
    creditedAmount,
    remainingBalance,
    changeDue,
    receiptType,
    studentId,
    registrationId,
    isScholar,
    scholarCodeName,
    voucherAmount,
    particularsSubtotal,
  } = payload;

  let status = "Unpaid";
  if (isScholar && voucherAmount > 0 && totalPayable <= 0 && particularsSubtotal > 0) {
    status = "Full Payment";
  } else if (amountPaid >= totalPayable && totalPayable > 0) {
    status = "Full Payment";
  } else if (amountPaid > 0) {
    status = "Partial Payment";
  }

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
    amountPaid,
    paidAmount: creditedAmount,
    creditedAmount,
    changeDue,
    remainingBalance,
    status,
    isScholar,
    scholarCodeName,
    voucherAmount,
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
    if (saved?.changeDue != null) txn.changeDue = saved.changeDue;
    if (saved?.amountPaid != null) txn.amountPaid = saved.amountPaid;
    if (saved?.paidAmount != null) {
      txn.paidAmount = saved.paidAmount;
      txn.creditedAmount = saved.paidAmount;
    }
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
    updateTotals();
  }
}

export function initPaymentModal() {
  const paymentModal = document.getElementById("paymentModal");
  const form = document.getElementById("paymentForm");
  if (!paymentModal || !form) return;

  initPaymentMessageModal();

  const backdrop = document.getElementById("paymentModalBackdrop");
  const closeBtn = document.getElementById("paymentModalCloseBtn");
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

  addRowBtn?.addEventListener("click", addParticularRow);
  paidInput?.addEventListener("input", updateTotals);
  paidInput?.addEventListener("blur", validatePaidAmountInput);

  const scholarCheckbox = document.getElementById("isScholarCheckbox");
  const scholarFieldsWrap = document.getElementById("scholarFieldsWrap");
  const scholarCodeName = document.getElementById("scholarCodeName");
  const scholarVoucherAmount = document.getElementById("scholarVoucherAmount");

  scholarCheckbox?.addEventListener("change", () => {
    if (scholarCheckbox.checked) {
      scholarFieldsWrap?.classList.remove("d-none");
    } else {
      scholarFieldsWrap?.classList.add("d-none");
    }
    updateTotals();
  });

  scholarCodeName?.addEventListener("input", updateTotals);
  scholarVoucherAmount?.addEventListener("input", updateTotals);

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
    resetScholarGrantSection();
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

    const previewTxn = {
      studentName: payload.studentName,
      controlNumber: payload.controlNumber,
      amountPaid: payload.amountPaid,
      changeDue: payload.changeDue,
      remainingBalance: payload.remainingBalance,
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

export async function selectStudentForPayment(student) {
  if (!student) return;
  selectedStudent = { ...student };
  const input = document.getElementById("studentSearchInput");
  if (input) input.value = selectedStudent.name || "";
  document.getElementById("selectedStudentId").value = selectedStudent.id || "";
  document.getElementById("selectedRegistrationId").value = selectedStudent.registrationId || "";
  await applyStudentFees(selectedStudent);
}

export function openPaymentModal() {
  const paymentModal = document.getElementById("paymentModal");
  if (!paymentModal) return;
  resetPaymentForm();
  const controlInput = document.getElementById("controlNumber");
  if (controlInput) {
    controlInput.removeAttribute("placeholder");
    controlInput.value = controlNumberFromLocalTransactions();
  }
  openModal(paymentModal);
  assignNextControlNumber();
}
