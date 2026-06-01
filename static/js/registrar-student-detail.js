/** Shared student detail helpers (student list, enrollment, etc.). */

import { initFilePreviewTriggers } from "./file-upload-preview.js";

export const DOC_STATUS = {
  verified: { label: "Verified", class: "text-bg-success" },
  pending: { label: "Pending review", class: "text-bg-warning" },
  missing: { label: "Not uploaded", class: "text-bg-secondary" },
};

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statusBadgeClass(status) {
  const s = status.toLowerCase();
  if (s.includes("verified") || s === "assessed") return "bg-success-subtle text-success";
  if (s.includes("pending") || s.includes("for assessment")) return "bg-warning-subtle text-warning";
  return "bg-primary-subtle text-primary";
}

/** Demo detail fields — replace with API response later. */
export function buildStudentDetails(student, moduleKey = "training", overrides = {}) {
  const slug = student.name.toLowerCase().replace(/\s+/g, ".");
  const phoneSuffix = String(100000000 + student.id * 137).slice(-9);
  const verified = student.status.toLowerCase().includes("verified") || student.status === "Assessed";
  const pending = student.status.toLowerCase().includes("pending") || student.status === "For Assessment";

  const documents = [
    { name: "Birth Certificate (PSA)", status: verified ? "verified" : "pending", uploaded: verified ? "2026-02-28" : null },
    { name: "Form 137 / Transcript of Records", status: verified ? "verified" : pending ? "pending" : "missing", uploaded: verified ? "2026-03-01" : pending ? "2026-03-10" : null },
    { name: "2×2 ID Photo", status: verified || pending ? "verified" : "missing", uploaded: verified || pending ? "2026-03-05" : null },
    { name: "Medical Certificate", status: pending ? "pending" : verified ? "verified" : "missing", uploaded: verified ? "2026-03-08" : null },
    { name: "Barangay Clearance", status: moduleKey === "assessment" ? "missing" : verified ? "verified" : "pending", uploaded: verified && moduleKey !== "assessment" ? "2026-03-06" : null },
  ];

  if (moduleKey === "assessment") {
    documents.push({ name: "Assessment Application Form", status: verified ? "verified" : "pending", uploaded: verified ? student.date : "2026-03-12" });
  } else {
    documents.push({ name: "Enrollment Form (signed)", status: student.status === "Pending Enrollment" ? "pending" : "verified", uploaded: student.status === "Pending Enrollment" ? null : student.date });
  }

  return {
    ...student,
    studentId: `VTIAC-2026-${String(student.id).padStart(4, "0")}`,
    email: overrides.email ?? `${slug.split(".")[0]}@student.demo`,
    phone: overrides.phone ?? `09${phoneSuffix}`,
    birthdate: overrides.birthdate ?? "May 14, 1999",
    gender: overrides.gender ?? (student.id % 2 === 0 ? "Male" : "Female"),
    address: overrides.address ?? "Brgy. Malued, Dagupan City, Pangasinan 2400",
    enrollmentType: overrides.enrollmentType ?? (moduleKey === "assessment" ? "Assessment Only" : "Training with Assessment"),
    guardianName: overrides.guardianName ?? "Guardian / Emergency Contact",
    guardianPhone: overrides.guardianPhone ?? `0917${String(2000000 + student.id).slice(-7)}`,
    registeredDate: student.date ?? student.registered,
    documents: overrides.documents ?? documents,
    notes: overrides.notes ?? "Demo profile — connect to student records API when ready.",
    ...overrides,
  };
}

function renderDetailField(label, value) {
  return `<div class="registrar-student-detail__field">
    <label>${escapeHtml(label)}</label>
    <p>${escapeHtml(value)}</p>
  </div>`;
}

export function renderStudentDetailBody(detail, options = {}) {
  const { showNotes = true } = options;
  const docsHtml = detail.documents
    .map((doc) => {
      const st = DOC_STATUS[doc.status] || DOC_STATUS.missing;
      const meta = doc.uploaded ? `Uploaded ${doc.uploaded}` : "No file on record";
      return `<li class="registrar-student-detail__doc">
        <div>
          <p class="registrar-student-detail__doc-name"><i class="bi bi-file-earmark-text" aria-hidden="true"></i>${escapeHtml(doc.name)}</p>
          <p class="registrar-student-detail__doc-meta">${escapeHtml(meta)}</p>
        </div>
        <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
      </li>`;
    })
    .join("");

  const notesSection = showNotes
    ? `<section class="registrar-student-detail__section mb-0">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-journal-text" aria-hidden="true"></i> Notes</h4>
      <p class="registrar-student-detail__note">${escapeHtml(detail.notes || "")}</p>
    </section>`
    : "";

  return `
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-person-vcard" aria-hidden="true"></i> Personal information</h4>
      <div class="registrar-student-detail__grid">
        ${renderDetailField("Student ID", detail.studentId)}
        ${renderDetailField("Full name", detail.name)}
        ${renderDetailField("Email", detail.email)}
        ${renderDetailField("Phone", detail.phone)}
        ${renderDetailField("Date of birth", detail.birthdate)}
        ${renderDetailField("Gender", detail.gender)}
        ${renderDetailField("Address", detail.address)}
        ${renderDetailField("Scholarship", detail.scholarship || "Regular")}
      </div>
    </section>
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-mortarboard" aria-hidden="true"></i> Enrollment</h4>
      <div class="registrar-student-detail__grid">
        ${renderDetailField("Program / course", detail.program)}
        ${renderDetailField("Enrollment type", detail.enrollmentType)}
        ${renderDetailField("Status", detail.status)}
        ${renderDetailField("Date registered", detail.registeredDate)}
        ${renderDetailField("Emergency contact", detail.guardianName)}
        ${renderDetailField("Contact phone", detail.guardianPhone)}
      </div>
    </section>
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-folder2-open" aria-hidden="true"></i> Documents</h4>
      <ul class="registrar-student-detail__docs">${docsHtml}</ul>
    </section>
    ${notesSection}`;
}

export function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString("en-PH")}`;
}

export function renderPaymentSection(enrollment) {
  const isFull = enrollment.paymentStatus === "full";
  const badgeClass = isFull ? "registrar-enrollment-payment--full" : "registrar-enrollment-payment--partial";
  const label = isFull ? "Payment: Fully Paid" : "Payment: Partially Paid";
  const paidLine = `Paid: ${formatPeso(enrollment.paidAmount)} / ${formatPeso(enrollment.totalAmount)}`;
  const deadlineLine = enrollment.paymentDeadline
    ? `<p class="registrar-enrollment-payment__deadline mb-0"><strong>Deadline:</strong> ${escapeHtml(enrollment.paymentDeadline)}</p>`
    : "";

  return `
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-credit-card" aria-hidden="true"></i> Payment</h4>
      <span class="badge registrar-enrollment-payment ${badgeClass}">${escapeHtml(label)}</span>
      <p class="registrar-enrollment-payment__amount mt-2 mb-1">${escapeHtml(paidLine)}</p>
      ${deadlineLine}
      ${enrollment.paymentReference ? `<p class="text-muted small mb-0 mt-2"><strong>Reference:</strong> ${escapeHtml(enrollment.paymentReference)}</p>` : ""}
    </section>`;
}

/** Cashier approval block — digital signature / signed document (demo). */
export function renderCashierApprovalSection(approval) {
  if (!approval) {
    return `
      <section class="registrar-student-detail__section registrar-cashier-approval registrar-cashier-approval--pending">
        <h4 class="registrar-student-detail__heading"><i class="bi bi-pen" aria-hidden="true"></i> Cashier enrollment approval</h4>
        <p class="text-muted small mb-0">Awaiting cashier payment confirmation and signature. (Demo)</p>
      </section>`;
  }

  const docLink = approval.documentUrl
    ? `<a href="${escapeHtml(approval.documentUrl)}" class="registrar-cashier-approval__doc-link" target="_blank" rel="noopener noreferrer">
        <i class="bi bi-file-earmark-pdf me-1" aria-hidden="true"></i>${escapeHtml(approval.documentName || "View signed document")}
      </a>`
    : "";

  return `
    <section class="registrar-student-detail__section registrar-cashier-approval">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-patch-check-fill" aria-hidden="true"></i> Cashier enrollment approval</h4>
      <p class="registrar-cashier-approval__lead small text-muted mb-3">Proof of payment verified and signed by cashier before registrar enrollment approval.</p>
      <div class="registrar-cashier-approval__proof">
        <div class="registrar-cashier-approval__sig-wrap">
          <span class="registrar-cashier-approval__sig" aria-label="Cashier digital signature">${escapeHtml(approval.signatureLabel)}</span>
          <span class="registrar-cashier-approval__verified badge text-bg-success">Verified</span>
        </div>
        <div class="registrar-cashier-approval__meta">
          <p class="mb-1"><strong>${escapeHtml(approval.cashierName)}</strong> · ${escapeHtml(approval.cashierRole || "Cashier")}</p>
          <p class="text-muted small mb-1">Approved: ${escapeHtml(approval.approvedAt)}</p>
          ${approval.referenceNo ? `<p class="text-muted small mb-2">OR / Ref: ${escapeHtml(approval.referenceNo)}</p>` : ""}
          ${docLink}
        </div>
      </div>
    </section>`;
}

/** Full enrollment view: student profile + payment + cashier proof. */
export function renderEnrollmentDetailBody(enrollment, studentDetail) {
  const base = renderStudentDetailBody(studentDetail, { showNotes: false });
  const payment = renderPaymentSection(enrollment);
  const cashier = renderCashierApprovalSection(enrollment.cashierApproval);
  const docIdx = base.indexOf("bi-folder2-open");
  if (docIdx === -1) return base + payment + cashier;
  const sectionStart = base.lastIndexOf("<section", docIdx);
  return base.slice(0, sectionStart) + payment + cashier + base.slice(sectionStart);
}

/** Demo trainer profile — replace with API response later. */
export function buildTrainerDetails(trainer, overrides = {}) {
  const slug = trainer.name.toLowerCase().replace(/\s+/g, ".");
  const phoneSuffix = String(100000000 + trainer.id * 173).slice(-9);
  const complete = trainer.documentsStatus === "complete";

  const documents = [
    { name: "Resume / Curriculum Vitae", status: complete ? "verified" : "pending", uploaded: complete ? "2026-03-18" : "2026-03-20" },
    { name: "TESDA Trainer Certificate", status: complete ? "verified" : "pending", uploaded: complete ? "2026-03-18" : null },
    { name: "NC II / Competency Certificate", status: complete ? "verified" : "pending", uploaded: complete ? "2026-03-19" : null },
    { name: "NBI Clearance", status: complete ? "verified" : "pending", uploaded: complete ? "2026-03-17" : null },
    { name: "2×2 ID Photo", status: "verified", uploaded: "2026-03-15" },
    { name: "Barangay Clearance", status: complete ? "verified" : "missing", uploaded: complete ? "2026-03-16" : null },
  ];

  return {
    ...trainer,
    trainerId: `VTIAC-TR-${String(trainer.id).padStart(4, "0")}`,
    email: overrides.email ?? trainer.email ?? `${slug.split(".")[0]}@trainer.demo`,
    phone: overrides.phone ?? trainer.phone ?? `09${phoneSuffix}`,
    birthdate: overrides.birthdate ?? "August 3, 1988",
    address: overrides.address ?? "Brgy. Lucao, Dagupan City, Pangasinan 2400",
    highestNc: overrides.highestNc ?? trainer.highestNc ?? "NC II",
    yearsExperience: overrides.yearsExperience ?? trainer.yearsExperience ?? "8 years",
    submittedDate: trainer.submittedDate ?? "2026-04-12",
    documents: overrides.documents ?? documents,
    notes: overrides.notes ?? "Demo trainer profile — connect to staff records API when ready.",
    ...overrides,
  };
}

export function renderTrainerDetailBody(detail, options = {}) {
  const { showNotes = true } = options;
  const specs = Array.isArray(detail.specializations)
    ? detail.specializations.join(", ")
    : detail.specializations || detail.program || "—";

  const docsHtml = detail.documents
    .map((doc) => {
      const st = DOC_STATUS[doc.status] || DOC_STATUS.missing;
      const meta = doc.uploaded ? `Uploaded ${doc.uploaded}` : "No file on record";
      return `<li class="registrar-student-detail__doc">
        <div>
          <p class="registrar-student-detail__doc-name"><i class="bi bi-file-earmark-text" aria-hidden="true"></i>${escapeHtml(doc.name)}</p>
          <p class="registrar-student-detail__doc-meta">${escapeHtml(meta)}</p>
        </div>
        <span class="badge ${st.class}">${escapeHtml(st.label)}</span>
      </li>`;
    })
    .join("");

  const notesSection = showNotes
    ? `<section class="registrar-student-detail__section mb-0">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-journal-text" aria-hidden="true"></i> Notes</h4>
      <p class="registrar-student-detail__note">${escapeHtml(detail.notes || "")}</p>
    </section>`
    : "";

  return `
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-person-vcard" aria-hidden="true"></i> Personal information</h4>
      <div class="registrar-student-detail__grid">
        ${renderDetailField("Trainer ID", detail.trainerId)}
        ${renderDetailField("Full name", detail.name)}
        ${renderDetailField("Email", detail.email)}
        ${renderDetailField("Phone", detail.phone)}
        ${renderDetailField("Date of birth", detail.birthdate)}
        ${renderDetailField("Address", detail.address)}
      </div>
    </section>
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-award" aria-hidden="true"></i> Professional qualifications</h4>
      <div class="registrar-student-detail__grid">
        ${renderDetailField("Specializations", specs)}
        ${renderDetailField("Highest NC held", detail.highestNc)}
        ${renderDetailField("Industry experience", detail.yearsExperience)}
        ${renderDetailField("Account status", detail.status)}
        ${renderDetailField("Date submitted", detail.submittedDate)}
      </div>
    </section>
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-folder2-open" aria-hidden="true"></i> Documents</h4>
      <ul class="registrar-student-detail__docs">${docsHtml}</ul>
    </section>
    ${notesSection}`;
}

export function renderTrainerDocumentsSection(trainer) {
  const isComplete = trainer.documentsStatus === "complete";
  const badgeClass = isComplete ? "registrar-enrollment-payment--full" : "registrar-enrollment-payment--partial";
  const label = isComplete ? "Documents: Complete" : "Documents: Incomplete";
  const missingLine =
    !isComplete && trainer.missingDocuments?.length
      ? `<p class="registrar-enrollment-card__deadline mb-0"><strong>Missing:</strong> ${escapeHtml(trainer.missingDocuments.join(", "))}</p>`
      : "";

  return `
    <section class="registrar-student-detail__section">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-folder-check" aria-hidden="true"></i> Document package</h4>
      <span class="badge registrar-enrollment-payment ${badgeClass}">${escapeHtml(label)}</span>
      ${missingLine}
    </section>`;
}

/** System admin pre-approval before registrar activates trainer account (same pattern as cashier). */
export function renderAdminTrainerApprovalSection(approval) {
  if (!approval) {
    return `
      <section class="registrar-student-detail__section registrar-cashier-approval registrar-cashier-approval--pending">
        <h4 class="registrar-student-detail__heading"><i class="bi bi-pen" aria-hidden="true"></i> System admin account verification</h4>
        <p class="text-muted small mb-0">Awaiting system admin review and signature. (Demo)</p>
      </section>`;
  }

  const docLink = approval.documentUrl
    ? `<a href="${escapeHtml(approval.documentUrl)}" class="registrar-cashier-approval__doc-link" target="_blank" rel="noopener noreferrer">
        <i class="bi bi-file-earmark-pdf me-1" aria-hidden="true"></i>${escapeHtml(approval.documentName || "View signed document")}
      </a>`
    : "";

  return `
    <section class="registrar-student-detail__section registrar-cashier-approval">
      <h4 class="registrar-student-detail__heading"><i class="bi bi-patch-check-fill" aria-hidden="true"></i> System admin account verification</h4>
      <p class="registrar-cashier-approval__lead small text-muted mb-3">Credentials and documents verified by system admin before registrar trainer account approval.</p>
      <div class="registrar-cashier-approval__proof">
        <div class="registrar-cashier-approval__sig-wrap">
          <span class="registrar-cashier-approval__sig" aria-label="Admin digital signature">${escapeHtml(approval.signatureLabel)}</span>
          <span class="registrar-cashier-approval__verified badge text-bg-success">Verified</span>
        </div>
        <div class="registrar-cashier-approval__meta">
          <p class="mb-1"><strong>${escapeHtml(approval.adminName)}</strong> · ${escapeHtml(approval.adminRole || "System Admin")}</p>
          <p class="text-muted small mb-1">Approved: ${escapeHtml(approval.approvedAt)}</p>
          ${approval.referenceNo ? `<p class="text-muted small mb-2">Ref: ${escapeHtml(approval.referenceNo)}</p>` : ""}
          ${docLink}
        </div>
      </div>
    </section>`;
}

/** Full trainer approval view: profile + documents + admin proof. */
export function renderTrainerApprovalDetailBody(trainer, trainerDetail) {
  const base = renderTrainerDetailBody(trainerDetail, { showNotes: false });
  const documents = renderTrainerDocumentsSection(trainer);
  const admin = renderAdminTrainerApprovalSection(trainer.adminApproval);
  const docIdx = base.indexOf("bi-folder2-open");
  if (docIdx === -1) return base + documents + admin;
  const sectionStart = base.lastIndexOf("<section", docIdx);
  return base.slice(0, sectionStart) + documents + admin + base.slice(sectionStart);
}

/** Wire Bootstrap modal elements for viewing a student record. */
export function initStudentViewModal(modalEl, options = {}) {
  const {
    nameSelector = "#view-student-name",
    metaSelector = "#view-student-meta",
    bodySelector = "#view-student-body",
    renderBody = renderStudentDetailBody,
    renderOptions = {},
  } = options;

  const viewModal = modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
  const viewNameEl = modalEl?.querySelector(nameSelector);
  const viewMetaEl = modalEl?.querySelector(metaSelector);
  const viewBodyEl = modalEl?.querySelector(bodySelector);

  function open(detail, bodyExtra = null) {
    if (!viewModal || !detail) return;
    if (viewNameEl) viewNameEl.textContent = detail.name;
    if (viewMetaEl) {
      const metaHtml = detail.metaHtml
        ? detail.metaHtml
        : `${escapeHtml(detail.studentId)} · <span class="badge ${statusBadgeClass(detail.status)}">${escapeHtml(detail.status)}</span>`;
      viewMetaEl.innerHTML = metaHtml;
    }
    if (viewBodyEl) {
      viewBodyEl.innerHTML = bodyExtra ?? renderBody(detail, renderOptions);
      initFilePreviewTriggers(viewBodyEl);
    }
    viewModal.show();
  }

  return { open, modal: viewModal };
}
