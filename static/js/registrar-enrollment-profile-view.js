/**
 * TESDA Learner's Profile Form — read-only view for registrar enrollment modal.
 */

import { FILE_PREVIEW_ICON } from "./file-upload-preview.js";
import { escapeHtml } from "./registrar-student-detail.js";

function reviewStatusBadge(status, rejectionReason) {
  const s = status || "pending";
  if (s === "approved") {
    return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--approved">Approved</span>`;
  }
  if (s === "rejected") {
    const reason = rejectionReason
      ? `<p class="registrar-doc-review__reject-reason mb-0 mt-1"><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>`
      : "";
    return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--rejected">Rejected</span>${reason}`;
  }
  return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--pending">Pending review</span>`;
}

function docReviewActions(doc, released) {
  if (!doc.reviewable || released) return "";
  const approved = doc.reviewStatus === "approved";
  const rejectDisabled = approved ? " disabled" : "";
  const approveDisabled = approved ? " disabled" : "";
  return `<div class="registrar-doc-review__actions" role="group" aria-label="Review ${escapeHtml(doc.title)}">
    <button
      type="button"
      class="registrar-doc-review__btn registrar-doc-review__btn--approve doc-review-approve-btn"
      data-doc-key="${escapeHtml(doc.key)}"
      title="Approve document"
      aria-label="Approve ${escapeHtml(doc.title)}"
      ${approveDisabled}
    >
      <i class="bi bi-check-lg" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="registrar-doc-review__btn registrar-doc-review__btn--reject doc-review-reject-btn"
      data-doc-key="${escapeHtml(doc.key)}"
      data-doc-title="${escapeHtml(doc.title)}"
      title="Reject document"
      aria-label="Reject ${escapeHtml(doc.title)}"
      ${rejectDisabled}
    >
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>
  </div>`;
}

function renderDocumentRows(docs, released) {
  return docs
    .map((doc) => {
      const meta = [doc.filename, doc.subtitle, doc.uploadedAt ? `Uploaded ${doc.uploadedAt}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<li class="registrar-doc-review__item" data-doc-key="${escapeHtml(doc.key)}">
        <div class="registrar-doc-review__info">
          <p class="registrar-doc-review__title mb-0">${escapeHtml(doc.title)}</p>
          <p class="registrar-doc-review__meta mb-0">${escapeHtml(meta)}</p>
          ${reviewStatusBadge(doc.reviewStatus, doc.rejectionReason)}
        </div>
        <div class="registrar-doc-review__tools">
          ${docReviewActions(doc, released)}
          <button
            type="button"
            class="file-preview-btn"
            data-preview-url="${escapeHtml(doc.fileUrl)}"
            data-preview-name="${escapeHtml(doc.filename || doc.title)}"
            aria-label="Preview ${escapeHtml(doc.title)}"
          >
            ${FILE_PREVIEW_ICON}
          </button>
        </div>
      </li>`;
    })
    .join("");
}

export function renderDocumentSubmissionIndicatorsSection(detail) {
  const docIndicators = detail?.docIndicators;
  const digital = docIndicators?.digital;
  const hardCopy = docIndicators?.hardCopy;

  const isDigitalUploaded = Boolean(digital?.isUploaded);
  const digitalBadgeClass = digital?.badgeClass || (isDigitalUploaded ? "registrar-doc-badge--uploaded" : "registrar-doc-badge--pending");
  const digitalLabel = digital?.label || (isDigitalUploaded ? "Uploaded" : "Pending");

  const isHardSubmitted = Boolean(hardCopy?.isSubmitted);
  const hardBadgeClass = hardCopy?.badgeClass || (isHardSubmitted ? "registrar-doc-badge--hard-submitted" : "registrar-doc-badge--hard-pending");
  const hardLabel = hardCopy?.label || (isHardSubmitted ? "Hard Copies: Submitted" : "Hard Copies: Pending");

  const hardCopyItems = hardCopy?.items || [];
  const itemsHtml = hardCopyItems
    .map((item) => {
      const checked = item.received ? "checked" : "";
      return `
        <div class="col-md-6">
          <label class="registrar-hard-copies-item form-check d-flex align-items-center justify-content-between p-2 px-3 rounded-2 border mb-0 cursor-pointer">
            <div class="d-flex align-items-center gap-2 min-w-0">
              <input class="form-check-input hard-copy-doc-check flex-shrink-0 mt-0" type="checkbox" data-key="${escapeHtml(item.key)}" ${checked}>
              <div>
                <div class="fw-medium small text-truncate">${escapeHtml(item.title)} ${item.required ? '<span class="text-danger">*</span>' : '<span class="text-muted text-2xs">(optional)</span>'}</div>
                ${item.hint ? `<div class="text-muted text-2xs">${escapeHtml(item.hint)}</div>` : ""}
              </div>
            </div>
            <span class="badge ${item.received ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary'} text-2xs ms-2 hard-copy-item-badge">
              ${item.received ? 'Received' : 'Pending'}
            </span>
          </label>
        </div>`;
    })
    .join("");

  const receivedMeta = isHardSubmitted
    ? `<span class="text-muted small"><i class="bi bi-calendar-check me-1"></i>Received on: <strong>${escapeHtml(hardCopy?.submittedAt || "On file")}</strong>${hardCopy?.receivedBy ? ` by <strong>${escapeHtml(hardCopy.receivedBy)}</strong>` : ""}</span>`
    : `<span class="text-muted small"><i class="bi bi-clock me-1"></i>Waiting for student to submit physical copies to the registrar office.</span>`;

  return `
    <section class="tesda-view-section mt-3" data-hard-copies-section>
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h4 class="tesda-view-section__title mb-0">
          <i class="bi bi-folder-check me-2" aria-hidden="true"></i>Document Submission Indicators
        </h4>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <span class="badge registrar-doc-badge ${digitalBadgeClass}">
            <i class="bi ${isDigitalUploaded ? 'bi-cloud-check-fill' : 'bi-cloud-arrow-up'} me-1"></i>${escapeHtml(digitalLabel)}
          </span>
          <span class="badge registrar-doc-badge ${hardBadgeClass}">
            <i class="bi ${isHardSubmitted ? 'bi-file-earmark-check-fill' : 'bi-file-earmark-x'} me-1"></i>${escapeHtml(hardLabel)}
          </span>
        </div>
      </div>

      <div class="registrar-hard-copies-box ${isHardSubmitted ? 'registrar-hard-copies-box--submitted' : 'registrar-hard-copies-box--pending'} mb-3">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <div>
            <div class="fw-bold d-flex align-items-center gap-2">
              <i class="bi ${isHardSubmitted ? 'bi-check-circle-fill text-success fs-5' : 'bi-exclamation-circle-fill text-warning fs-5'}"></i>
              <span>${isHardSubmitted ? 'Hard Copies Submitted to Organization' : 'Physical Hard Copies Not Yet Received'}</span>
            </div>
            <div class="mt-1">${receivedMeta}</div>
          </div>
          <div class="d-flex gap-2">
            ${isHardSubmitted ? `
              <button type="button" class="btn btn-outline-danger btn-sm hard-copies-toggle-btn" data-action="unmark">
                <i class="bi bi-arrow-counterclockwise me-1"></i>Mark as Pending Hard Copies
              </button>
            ` : `
              <button type="button" class="btn btn-primary btn-sm hard-copies-toggle-btn" data-action="mark">
                <i class="bi bi-file-earmark-check-fill me-1"></i>Mark All Hard Copies Received
              </button>
            `}
          </div>
        </div>

        <div class="row g-2 mb-3">
          ${itemsHtml}
        </div>

        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2 border-top">
          <div class="flex-grow-1" style="max-width: 28rem;">
            <input type="text" class="form-control form-control-sm hard-copies-notes-input" placeholder="Optional notes (e.g. Received by Registrar, 1 PSA + 2 valid IDs)..." value="${escapeHtml(hardCopy?.notes || "")}">
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary hard-copies-save-checklist-btn">
            <i class="bi bi-save me-1"></i>Save Checklist & Notes
          </button>
        </div>
      </div>
    </section>`;
}

export function renderUploadedDocumentsSection(detail) {
  const docs = detail?.uploadedDocuments || [];
  const paymentDocs = detail?.paymentDocuments || [];
  const released = Boolean(detail?.documentsReviewReleased);

  if (!docs.length && !paymentDocs.length) {
    return `<section class="tesda-view-section registrar-doc-review mt-3">
      <h4 class="tesda-view-section__title"><i class="bi bi-folder2-open me-2" aria-hidden="true"></i>Uploaded Documents</h4>
      <p class="text-muted small mb-0">No documents have been uploaded yet.</p>
    </section>`;
  }

  let html = `<section class="tesda-view-section registrar-doc-review mt-3" data-doc-review-section>
    <h4 class="tesda-view-section__title"><i class="bi bi-folder2-open me-2" aria-hidden="true"></i>Uploaded Documents</h4>`;

  if (docs.length) {
    const hint = released
      ? "All documents were approved. The student may proceed to payment."
      : "Approve each file with the check button, or reject with X and provide a reason.";
    html += `<p class="tesda-view-section__hint mb-3">${escapeHtml(hint)}</p>
    <ul class="registrar-doc-review__list list-unstyled mb-0">${renderDocumentRows(docs, released)}</ul>`;
  }

  if (paymentDocs.length) {
    html += `<h5 class="tesda-view-section__subtitle mt-3 mb-2">Payment proofs</h5>
    <ul class="registrar-doc-review__list list-unstyled mb-0">${renderDocumentRows(paymentDocs, true)}</ul>`;
  }

  html += `</section>`;
  return html;
}

export function updateEnrollmentDocReviewFooter(detail) {
  const nextBtn = document.getElementById("view-enrollment-doc-next");
  if (!nextBtn) return;
  const docs = detail?.uploadedDocuments || [];
  const hasReviewable = docs.some((d) => d.reviewable !== false);
  const allApproved = Boolean(detail?.allDocumentsApproved);
  const released = Boolean(detail?.documentsReviewReleased);

  if (!hasReviewable || released) {
    nextBtn.classList.add("d-none");
    nextBtn.disabled = true;
    return;
  }

  nextBtn.classList.remove("d-none");
  nextBtn.disabled = !allApproved;
  nextBtn.title = allApproved
    ? "Release student to the payment step"
    : "Approve every document before releasing to payment";
}

function fieldRow(label, value, cols = "col-md-4") {
  return `<div class="${cols} tesda-view-field">
    <span class="tesda-view-field__label">${escapeHtml(label)}</span>
    <p class="tesda-view-field__value">${escapeHtml(value || "—")}</p>
  </div>`;
}

function checkGrid(title, hint, options, selected, sectionNum) {
  const selectedSet = new Set(selected || []);
  const cells = (options || [])
    .map(
      (opt) => `<div class="col-md-4">
      <div class="tesda-view-check${selectedSet.has(opt) ? " tesda-view-check--on" : ""}">
        <i class="bi ${selectedSet.has(opt) ? "bi-check-square-fill" : "bi-square"}" aria-hidden="true"></i>
        <span>${escapeHtml(opt)}</span>
      </div>
    </div>`
    )
    .join("");
  return `<section class="tesda-view-section">
    <h4 class="tesda-view-section__title">${sectionNum}. ${escapeHtml(title)}</h4>
    ${hint ? `<p class="tesda-view-section__hint">${escapeHtml(hint)}</p>` : ""}
    <div class="row g-2">${cells}</div>
  </section>`;
}

export function renderTrainingLearnerProfile(detail) {
  const s1 = detail.section1;
  const s2 = detail.section2;
  const s3 = detail.section3;
  const s10 = detail.section10;

  const photoHtml = s10.photoUrl
    ? `<img src="${escapeHtml(s10.photoUrl)}" alt="Learner photo" class="tesda-view-photo__img" />`
    : `<span class="tesda-view-photo__placeholder text-muted small">1×1 picture<br />taken within the<br />last 6 months</span>`;

  return `
    <div class="tesda-view-form">
      <header class="tesda-view-header text-center mb-3">
        <p class="tesda-view-header__agency mb-0 small text-muted">Technical Education and Skills Development Authority</p>
        <p class="tesda-view-header__agency-fil mb-1 small text-muted">Pangasiwaan sa Edukasyong Teknikal at Pagpapaunlad ng Kasanayan</p>
        <h2 class="tesda-view-header__title mb-0">Registration Form</h2>
        <h3 class="tesda-view-header__subtitle">LEARNER'S PROFILE FORM</h3>
        <p class="tesda-view-header__meta small text-muted mb-0">Ref. ${escapeHtml(detail.referenceId || "—")} · ${escapeHtml(detail.programTypeLabel || "")}</p>
      </header>

      <div class="tesda-view-layout">
        <div class="tesda-view-layout__main">
          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">1. T2MIS Auto Generated</h4>
            <div class="row g-2">
              ${fieldRow("TSMIS", s1.tsmis, "col-md-4")}
              ${fieldRow("Unique Learner Identifier (ULI)", s1.uli, "col-md-4")}
              ${fieldRow("Entry Date (MM/DD/YY)", s1.entryDate, "col-md-4")}
            </div>
          </section>

          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">2. Learner / Manpower Profile</h4>
            <div class="row g-2 mb-2">
              ${fieldRow("Last Name", s2.lastName, "col-md-3")}
              ${fieldRow("First Name", s2.firstName, "col-md-3")}
              ${fieldRow("Middle Name", s2.middleName, "col-md-3")}
              ${fieldRow("Extension", s2.nameExtension, "col-md-3")}
            </div>
            <p class="tesda-view-section__hint mb-2">Complete Permanent Mailing Address</p>
            <div class="row g-2 mb-2">
              ${fieldRow("Number, Street", s2.street, "col-md-6")}
              ${fieldRow("District", s2.district, "col-md-6")}
              ${fieldRow("Barangay", s2.barangay, "col-md-6")}
              ${fieldRow("City / Municipality", s2.city, "col-md-6")}
              ${fieldRow("Province", s2.province, "col-md-6")}
              ${fieldRow("Region", s2.region, "col-md-6")}
            </div>
            <div class="row g-2">
              ${fieldRow("Email Address / Facebook Account", s2.email, "col-md-4")}
              ${fieldRow("Contact No.", s2.contact, "col-md-4")}
              ${fieldRow("Nationality", s2.nationality, "col-md-4")}
            </div>
          </section>

          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">3. Personal Information</h4>
            <div class="row g-2">
              ${fieldRow("Sex", s3.sex, "col-md-3")}
              ${fieldRow("Civil Status", s3.civilStatus, "col-md-3")}
              ${fieldRow("Employment Status (before training)", s3.employmentStatus, "col-md-3")}
              ${fieldRow("Employment Type", s3.employmentType, "col-md-3")}
              ${fieldRow("Birthdate", s3.birthDate, "col-md-4")}
              ${fieldRow("Birthplace", s3.birthplace, "col-md-8")}
              ${fieldRow("Educational Attainment Before the Training", s3.education, "col-12")}
              ${fieldRow("Parent / Guardian Name", s3.guardianName, "col-md-6")}
              ${fieldRow("Parent / Guardian Complete Address", s3.guardianAddress, "col-md-6")}
            </div>
          </section>

          ${checkGrid(
            "Learner / Trainee / Student (Client) Classification",
            "Selected classifications",
            detail.section4.options,
            detail.section4.selected,
            4
          )}

          ${checkGrid(
            "Type of Disability",
            "For persons with disability only",
            detail.section5.options,
            detail.section5.selected,
            5
          )}
          ${
            detail.section5.otherSpecify
              ? `<p class="tesda-view-section__hint ms-1 mb-3"><strong>Multiple disabilities specify:</strong> ${escapeHtml(detail.section5.otherSpecify)}</p>`
              : ""
          }

          ${checkGrid(
            "Causes of Disability",
            "For persons with disability only",
            detail.section6.options,
            detail.section6.selected,
            6
          )}

          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">7. Name of Course / Qualification</h4>
            <p class="tesda-view-field__value tesda-view-field__value--emphasis mb-0">${escapeHtml(detail.section7.course)}</p>
          </section>

          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">8. Scholarship Package (TWSP, PESFA, STEP, others)</h4>
            ${fieldRow("Scholarship type", detail.section8.scholarship, "col-12")}
          </section>

          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">9. Privacy Consent and Disclaimer</h4>
            <div class="tesda-view-consent">
              <i class="bi ${detail.section9.privacyConsent ? "bi-check-circle-fill text-success" : "bi-x-circle text-danger"}" aria-hidden="true"></i>
              <span>${detail.section9.privacyConsent ? "Applicant agreed to TESDA privacy notice and data processing." : "Privacy consent not recorded."}</span>
            </div>
          </section>

          <section class="tesda-view-section">
            <h4 class="tesda-view-section__title">10. Applicant's Signature</h4>
            <p class="tesda-view-section__hint">This is to certify that the information stated above is true and correct.</p>
            <div class="row g-2 align-items-end">
              ${fieldRow("Applicant's Signature (printed name)", s10.signature, "col-md-4")}
              ${fieldRow("Date Accomplished", s10.dateAccomplished, "col-md-4")}
              ${fieldRow("Noted by (Registrar / School Administrator)", s10.notedBy, "col-md-4")}
              ${fieldRow("Date Received", s10.dateReceived, "col-md-4")}
            </div>
          </section>
        </div>

        <aside class="tesda-view-layout__photo" aria-label="Learner photo">
          <div class="tesda-view-photo">${photoHtml}</div>
          <div class="tesda-view-thumb" aria-hidden="true">
            <span class="small text-muted">Right Thumbmark</span>
          </div>
        </aside>
      </div>
    </div>`;
}

export function renderAssessmentOnlyNotice(detail) {
  return `<div class="alert alert-info mb-3">This enrollee selected <strong>Assessment Only</strong>. Open their TESDA application form from the student portal for full assessment fields.</div>
    ${renderTrainingLearnerProfile(detail)}`;
}

export function renderIncompleteProfileNotice(detail) {
  return `<div class="alert alert-warning mb-3">
    <strong>Learner profile not yet completed.</strong> Showing data from initial registration only. Fields below may be incomplete until the student submits the full TESDA form.
  </div>
  ${renderTrainingLearnerProfile(detail)}`;
}

export function renderLearnerProfileModalBody(detail) {
  if (!detail) return "<p class=\"text-muted mb-0\">No data available.</p>";
  const submissionIndicatorsBlock = renderDocumentSubmissionIndicatorsSection(detail);
  const documentsBlock = renderUploadedDocumentsSection(detail);
  let body;
  if (detail.formType === "assessment_only") {
    body = renderAssessmentOnlyNotice(detail);
  } else if (detail.source === "registration") {
    body = renderIncompleteProfileNotice(detail);
  } else {
    body = renderTrainingLearnerProfile(detail);
  }
  return `${body}${submissionIndicatorsBlock}${documentsBlock}`;
}
