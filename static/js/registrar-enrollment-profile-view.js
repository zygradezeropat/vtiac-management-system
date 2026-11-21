/**
 * TESDA Learner's Profile Form — read-only view for registrar enrollment modal.
 */

import { FILE_PREVIEW_ICON } from "./file-upload-preview.js";
import { escapeHtml } from "./registrar-student-detail.js";

function reviewStatusBadge(status, rejectionReason, doc = {}) {
  const isMissing = Boolean(doc.isMissing || !doc.uploaded || status === "missing");
  if (isMissing) {
    if (doc.required) {
      return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--missing"><i class="bi bi-exclamation-circle me-1"></i>Missing (Required)</span>`;
    }
    return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--optional"><i class="bi bi-dash-circle me-1"></i>Not uploaded (Optional)</span>`;
  }
  const s = status || "pending";
  if (s === "approved") {
    return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--approved"><i class="bi bi-check-circle me-1"></i>Approved</span>`;
  }
  if (s === "rejected") {
    const reason = rejectionReason
      ? `<p class="registrar-doc-review__reject-reason mb-0 mt-1"><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>`
      : "";
    return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--rejected"><i class="bi bi-x-circle me-1"></i>Rejected</span>${reason}`;
  }
  return `<span class="badge registrar-doc-review__badge registrar-doc-review__badge--pending"><i class="bi bi-clock me-1"></i>Pending review</span>`;
}

function docReviewActions(doc, released) {
  if (!doc.reviewable || released) return "";
  const status = (doc.reviewStatus || "").toLowerCase();

  // Once a document is reviewed (approved or rejected), hide the action buttons
  if (status === "approved" || status === "rejected") return "";

  return `<div class="registrar-doc-review__actions" role="group" aria-label="Review ${escapeHtml(doc.title)}">
    <button
      type="button"
      class="registrar-doc-review__btn registrar-doc-review__btn--approve doc-review-approve-btn"
      data-doc-key="${escapeHtml(doc.key)}"
      title="Approve document"
      aria-label="Approve ${escapeHtml(doc.title)}"
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
    >
      <i class="bi bi-x-lg" aria-hidden="true"></i>
    </button>
  </div>`;
}

function renderDocumentRows(docs, released) {
  return docs
    .filter((doc) => doc.required || doc.uploaded || !doc.isMissing)
    .map((doc) => {
      const isMissing = Boolean(doc.isMissing || !doc.uploaded || doc.reviewStatus === "missing");
      const isRequired = Boolean(doc.required);

      let metaHtml = "";
      if (isMissing) {
        metaHtml = isRequired
          ? `<span class="text-danger fw-semibold"><i class="bi bi-exclamation-triangle me-1"></i>Required document not uploaded by student</span>`
          : `<span class="text-muted"><i class="bi bi-info-circle me-1"></i>Optional document — not uploaded</span>`;
      } else {
        const metaParts = [doc.filename, doc.subtitle, doc.uploadedAt ? `Uploaded ${doc.uploadedAt}` : ""]
          .filter(Boolean);
        metaHtml = escapeHtml(metaParts.join(" · "));
      }

      const itemClass = isMissing && isRequired
        ? "registrar-doc-review__item registrar-doc-review__item--missing"
        : isMissing
        ? "registrar-doc-review__item registrar-doc-review__item--optional"
        : "registrar-doc-review__item";

      const titleSuffix = isRequired
        ? '<span class="text-danger ms-1 fw-bold" title="Required">*</span>'
        : '<span class="text-muted fw-normal small ms-1">(optional)</span>';

      // Action buttons and view button ONLY appear when document is uploaded
      const actions = (!isMissing && doc.reviewable) ? docReviewActions(doc, released) : "";
      const previewBtn = (!isMissing && doc.fileUrl)
        ? `<button
            type="button"
            class="file-preview-btn"
            data-preview-url="${escapeHtml(doc.fileUrl)}"
            data-preview-name="${escapeHtml(doc.filename || doc.title)}"
            aria-label="Preview ${escapeHtml(doc.title)}"
            title="View ${escapeHtml(doc.title)}"
          >
            ${FILE_PREVIEW_ICON}
          </button>`
        : "";

      const toolsHtml = (actions || previewBtn)
        ? `<div class="registrar-doc-review__tools">${actions}${previewBtn}</div>`
        : `<div class="registrar-doc-review__tools"><span class="badge bg-light text-muted border text-2xs px-2 py-1">No file attached</span></div>`;

      return `<li class="${itemClass}" data-doc-key="${escapeHtml(doc.key)}">
        <div class="registrar-doc-review__info">
          <p class="registrar-doc-review__title mb-0">${escapeHtml(doc.title)} ${titleSuffix}</p>
          <p class="registrar-doc-review__meta mb-0">${metaHtml}</p>
          ${reviewStatusBadge(doc.reviewStatus, doc.rejectionReason, doc)}
        </div>
        ${toolsHtml}
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

  const hardCopyItems = (hardCopy?.items || []).filter((item) => item.required || item.isUploaded);
  const itemsHtml = hardCopyItems
    .map((item) => {
      const checked = item.received ? "checked" : "";
      const isUploaded = Boolean(item.isUploaded);
      const filename = item.filename || "";
      const fileUrl = item.fileUrl || "";

      let fileLine = "";
      if (isUploaded && fileUrl) {
        fileLine = `
          <div class="d-flex align-items-center gap-1 mt-1 text-2xs text-muted">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle px-1.5 py-0.5">
              <i class="bi bi-cloud-check-fill me-1"></i>Uploaded
            </span>
            <span class="text-truncate" style="max-width: 13rem;" title="${escapeHtml(filename)}">
              ${escapeHtml(filename)}
            </span>
            <button
              type="button"
              class="btn btn-sm btn-link p-0 text-primary file-preview-btn ms-1"
              data-preview-url="${escapeHtml(fileUrl)}"
              data-preview-name="${escapeHtml(filename || item.title)}"
              title="View uploaded ${escapeHtml(item.title)}"
              aria-label="View ${escapeHtml(item.title)}"
              onclick="event.stopPropagation();"
            >
              ${FILE_PREVIEW_ICON}
            </button>
          </div>`;
      } else if (item.required) {
        fileLine = `<div class="text-danger text-2xs mt-1"><i class="bi bi-exclamation-triangle me-1"></i>Required document not uploaded by applicant</div>`;
      } else {
        fileLine = `<div class="text-muted text-2xs mt-1"><i class="bi bi-dash-circle me-1"></i>Not uploaded (optional)</div>`;
      }

      return `
        <div class="col-md-6">
          <label class="registrar-hard-copies-item form-check d-flex align-items-center justify-content-between p-2 px-3 rounded-2 border mb-0 cursor-pointer ${isUploaded ? 'border-primary-subtle bg-white' : ''}">
            <div class="d-flex align-items-start gap-2 min-w-0">
              <input class="form-check-input hard-copy-doc-check flex-shrink-0 mt-1" type="checkbox" data-key="${escapeHtml(item.key)}" ${checked}>
              <div class="min-w-0">
                <div class="fw-medium small text-truncate">
                  ${escapeHtml(item.title)} ${item.required ? '<span class="text-danger">*</span>' : '<span class="text-muted text-2xs">(optional)</span>'}
                </div>
                ${item.hint ? `<div class="text-muted text-2xs text-truncate">${escapeHtml(item.hint)}</div>` : ""}
                ${fileLine}
              </div>
            </div>
            <div class="ms-2 flex-shrink-0 text-end">
              <span class="badge ${item.received ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary'} text-2xs hard-copy-item-badge">
                ${item.received ? 'Received' : 'Pending'}
              </span>
            </div>
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
  const isLocked = detail?.currentUserPrimaryRole === "cashier" && Boolean(detail?.registrarStaffTouched);
  const released = Boolean(detail?.documentsReviewReleased) || isLocked;

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
  const isLocked = detail?.currentUserPrimaryRole === "cashier" && Boolean(detail?.registrarStaffTouched);
  if (isLocked) {
    nextBtn.classList.remove("d-none");
    nextBtn.disabled = true;
    nextBtn.classList.add("disabled");
    nextBtn.style.cursor = "not-allowed";
    nextBtn.style.opacity = "0.75";
    nextBtn.title = "Locked: This application was processed by Registrar Staff and cannot be modified while acting as Registrar.";
    nextBtn.innerHTML = '<i class="bi bi-lock-fill me-1"></i>Locked (Registrar Touch)';
    return;
  }
  const docs = detail?.uploadedDocuments || [];
  const hasReviewable = docs.some((d) => d.reviewable !== false);
  const hasMissingRequired = docs.some((d) => d.required && (d.isMissing || !d.uploaded));
  const allApproved = Boolean(detail?.allDocumentsApproved);
  const released = Boolean(detail?.documentsReviewReleased);

  if (!hasReviewable || released) {
    nextBtn.classList.add("d-none");
    nextBtn.disabled = true;
    return;
  }

  nextBtn.classList.remove("d-none");
  nextBtn.disabled = !allApproved;
  if (hasMissingRequired) {
    nextBtn.title = "Cannot release: required document(s) not uploaded by student";
  } else if (!allApproved) {
    nextBtn.title = "Approve every uploaded document before releasing to payment";
  } else {
    nextBtn.title = "Release student to the payment step";
  }
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

function renderCheck(label, isChecked) {
  return `<span class="tesda-form-check ${isChecked ? 'tesda-form-check--on' : ''}">
    <span class="tesda-box">${isChecked ? '✔' : '&nbsp;'}</span>
    <span class="tesda-form-check__label">${escapeHtml(label)}</span>
  </span>`;
}

function renderLetterBoxes(text, totalBoxes = 30) {
  const clean = (text || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  const chars = clean.split("");
  let boxes = "";
  for (let i = 0; i < totalBoxes; i++) {
    const ch = chars[i] ? escapeHtml(chars[i]) : "&nbsp;";
    boxes += `<span class="tesda-char-box">${ch}</span>`;
  }
  return `<div class="tesda-char-boxes">${boxes}</div>`;
}

function renderRefBoxes() {
  const groups = [
    { cls: "tesda-ref-box--y", count: 3, label: "Web appl. code" },
    { cls: "tesda-ref-box--b", count: 2, label: "TV" },
    { cls: "tesda-ref-box--pink", count: 2, label: "Region" },
    { cls: "tesda-ref-box--g", count: 2, label: "Province" },
    { cls: "tesda-ref-box--o", count: 4, label: "Number Series Assigned in AC" },
    { cls: "tesda-ref-box--p", count: 4, label: "Number Series" },
  ];
  return `<div class="d-inline-flex flex-wrap align-items-start gap-1">` + groups
    .map((grp) => {
      let bHtml = "";
      for (let i = 0; i < grp.count; i++) {
        bHtml += `<span class="tesda-ref-box ${grp.cls}">&nbsp;</span>`;
      }
      return `<div class="d-flex flex-column align-items-center">
        <div class="d-inline-flex gap-0.5">${bHtml}</div>
        <div class="text-center text-muted tesda-ref-sublabel">${grp.label}</div>
      </div>`;
    })
    .join("") + `</div>`;
}

function renderUliBoxes() {
  const groups = [3, 2, 3, 3, 3];
  return groups
    .map((count, idx) => {
      let bHtml = "";
      for (let i = 0; i < count; i++) {
        bHtml += `<span class="tesda-ref-box tesda-ref-box--b">&nbsp;</span>`;
      }
      return `${idx > 0 ? '<span class="fw-bold text-muted px-0.5">-</span>' : ""}<div class="d-inline-flex gap-0.5">${bHtml}</div>`;
    })
    .join("");
}

function renderWorkExperienceRows(rows) {
  const validRows = (rows || []).filter((r) => r && Object.values(r).some((v) => String(v).trim()));
  const displayRows = [...validRows];
  while (displayRows.length < 4) displayRows.push({});
  return displayRows
    .slice(0, 4)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.company || "—")}</td>
        <td>${escapeHtml(r.position || "—")}</td>
        <td>${escapeHtml(r.inclusive_dates || "—")}</td>
        <td>${escapeHtml(r.monthly_salary || "—")}</td>
        <td>${escapeHtml(r.appointment_status || "—")}</td>
        <td>${escapeHtml(r.years_experience || "—")}</td>
      </tr>`
    )
    .join("");
}

function renderTrainingRows(rows) {
  const validRows = (rows || []).filter((r) => r && Object.values(r).some((v) => String(v).trim()));
  const displayRows = [...validRows];
  while (displayRows.length < 4) displayRows.push({});
  return displayRows
    .slice(0, 4)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.title || "—")}</td>
        <td>${escapeHtml(r.venue || "—")}</td>
        <td>${escapeHtml(r.inclusive_dates || "—")}</td>
        <td>${escapeHtml(r.hours || "—")}</td>
        <td>${escapeHtml(r.conducted_by || "—")}</td>
      </tr>`
    )
    .join("");
}

function renderLicenseRows(rows) {
  const validRows = (rows || []).filter((r) => r && Object.values(r).some((v) => String(v).trim()));
  const displayRows = [...validRows];
  while (displayRows.length < 3) displayRows.push({});
  return displayRows
    .slice(0, 3)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.title || "—")}</td>
        <td>${escapeHtml(r.year_taken || "—")}</td>
        <td>${escapeHtml(r.venue || "—")}</td>
        <td>${escapeHtml(r.rating || "—")}</td>
        <td>${escapeHtml(r.remarks || "—")}</td>
        <td>${escapeHtml(r.expiry_date || "—")}</td>
      </tr>`
    )
    .join("");
}

function renderCompetencyRows(rows) {
  const validRows = (rows || []).filter((r) => r && Object.values(r).some((v) => String(v).trim()));
  const displayRows = [...validRows];
  while (displayRows.length < 2) displayRows.push({});
  return displayRows
    .slice(0, 2)
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.title || "—")}</td>
        <td>${escapeHtml(r.qualification_level || "—")}</td>
        <td>${escapeHtml(r.industry_sector || "—")}</td>
        <td>${escapeHtml(r.certificate_number || "—")}</td>
        <td>${escapeHtml(r.date_issued || "—")}</td>
        <td>${escapeHtml(r.expiration_date || "—")}</td>
      </tr>`
    )
    .join("");
}

export function renderAdmissionSlip(detail, { school, contact, nameObj, assessmentTypes } = {}) {
  const aa = detail?.assessmentApplication || {};
  const admissionData = aa.admissionSlip || {};
  const orNumber = admissionData.orNumber || detail?.officialReceiptNumber || detail?.orNumber || "";
  const dateIssued = admissionData.dateIssued || detail?.receiptDateIssued || detail?.dateIssued || "";
  const assessmentDate = admissionData.assessmentDate || detail?.assessmentDate || "";
  const assessmentTime = admissionData.assessmentTime || detail?.assessmentTime || "";

  const nameParts = [nameObj?.firstName, nameObj?.middleName, nameObj?.surname].filter(Boolean);
  const fullName = nameParts.length ? nameParts.join(" ") : (detail?.name || "—");
  const phone = contact?.mobile || contact?.tel || detail?.section2?.contact || "—";
  const assessmentTitle = school?.assessmentTitle || detail?.program || "—";
  const centerName = school?.name || "Valiant Technical Institute and Assessment Center, Inc.";

  return `
    <div class="tesda-admission-slip">
      <!-- Cut line with scissors -->
      <div class="tesda-cut-line">
        <div class="tesda-cut-dashes"></div>
        <span class="tesda-cut-scissors">✂</span>
        <div class="tesda-cut-dashes"></div>
      </div>

      <div class="border border-dark">
        <!-- Header banner -->
        <div class="tesda-slip-header border-bottom border-dark">
          ADMISSION SLIP
        </div>

        <!-- Reference Number and Photo Box Row -->
        <div class="tesda-flex-row border-bottom border-dark">
          <div style="flex: 1 1 auto; min-width: 0;" class="border-end border-dark">
            <!-- Reference Number -->
            <div class="p-1 border-bottom border-dark d-flex align-items-center gap-1 flex-wrap">
              <span class="fw-bold text-uppercase text-2xs" style="white-space: nowrap;">REFERENCE NUMBER :</span>
              <div class="d-flex flex-wrap align-items-center">
                ${renderRefBoxes()}
              </div>
            </div>

            <!-- Name of Applicant & Tel Number -->
            <div class="tesda-flex-row border-bottom border-dark">
              <div style="flex: 0 0 60%; max-width: 60%;" class="p-1 border-end border-dark">
                <span class="text-2xs fw-bold text-dark">Name of Applicant:</span>
                <span class="fw-bold text-dark ms-1">${escapeHtml(fullName)}</span>
              </div>
              <div style="flex: 0 0 40%; max-width: 40%;" class="p-1">
                <span class="text-2xs fw-bold text-dark">Tel. Number:</span>
                <span class="fw-bold text-dark ms-1">${escapeHtml(phone)}</span>
              </div>
            </div>

            <!-- Assessment Applied for & OR / Date Issued -->
            <div class="tesda-flex-row">
              <div style="flex: 0 0 60%; max-width: 60%;" class="p-1 border-end border-dark">
                <span class="text-2xs fw-bold text-dark">Assessment Applied for:</span>
                <div class="fw-bold text-dark mt-0.5">${escapeHtml(assessmentTitle)}</div>
              </div>
              <div style="flex: 0 0 40%; max-width: 40%;" class="p-1">
                <div>
                  <span class="text-2xs fw-bold text-dark">Official Receipt Number:</span>
                  <span class="fw-bold text-dark ms-1">${escapeHtml(orNumber || "—")}</span>
                </div>
                <div>
                  <span class="text-2xs fw-bold text-dark">Date Issued:</span>
                  <span class="fw-bold text-dark ms-1">${escapeHtml(dateIssued || "—")}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Passport Picture Box on Right -->
          <div class="p-1 d-flex flex-column align-items-center justify-content-center text-center flex-shrink-0" style="width: 100px; background: #fff;">
            <div class="border border-dark w-100 h-100 d-flex flex-column align-items-center justify-content-center p-1" style="min-height: 68px; max-height: 78px;">
              <div class="fw-bold text-dark" style="font-size: 0.72rem; letter-spacing: 0.05em;">PICTURE</div>
              <div class="fst-italic text-muted mt-0.5" style="font-size: 0.58rem; line-height: 1.15;">
                (Passport<br>size)
              </div>
            </div>
          </div>
        </div>

        <!-- Banner: To be accomplished by the Processing Officer -->
        <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold fst-italic text-dark" style="font-size: 0.68rem;">
          To be accomplished by the Processing Officer
        </div>

        <!-- Name of Assessment Center -->
        <div class="p-1 border-bottom border-dark">
          <span class="text-2xs fw-bold text-dark">Name of Assessment Center:</span>
          <span class="fw-bold text-dark ms-1">${escapeHtml(centerName)}</span>
        </div>

        <!-- Check submitted requirements & Remarks -->
        <div class="tesda-flex-row border-bottom border-dark">
          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1 border-end border-dark">
            <div class="text-2xs fw-bold text-dark mb-0.5">Check submitted requirements:</div>
            <div class="d-flex flex-column gap-0.5 ms-1">
              <div class="d-flex align-items-center gap-1">
                <span class="tesda-box">&nbsp;</span>
                <span class="text-2xs text-dark">Accomplished Self-Assessment Guide</span>
              </div>
              <div class="d-flex align-items-center gap-1">
                <span class="tesda-box">&nbsp;</span>
                <span class="text-2xs text-dark">Three (3) pieces colored passport size pictures</span>
              </div>
            </div>
          </div>

          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1">
            <div class="text-2xs fw-bold text-dark mb-0.5">Remarks:</div>
            <div class="d-flex flex-column gap-0.5 ms-1">
              <div class="d-flex align-items-center gap-1">
                <span class="tesda-box">&nbsp;</span>
                <span class="text-2xs text-dark">Bring own Personal Protective Equipment</span>
              </div>
              <div class="d-flex align-items-center gap-1">
                <span class="tesda-box">&nbsp;</span>
                <span class="text-2xs text-dark">Others. Pls. specify</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Assessment Date & Time -->
        <div class="tesda-flex-row border-bottom border-dark">
          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1 border-end border-dark">
            <span class="text-2xs fw-bold text-dark">Assessment Date:</span>
            <span class="fw-bold text-dark ms-1">${escapeHtml(assessmentDate || "—")}</span>
          </div>
          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1">
            <span class="text-2xs fw-bold text-dark">Assessment Time:</span>
            <span class="fw-bold text-dark ms-1">${escapeHtml(assessmentTime || "—")}</span>
          </div>
        </div>

        <!-- Signatures Row -->
        <div class="tesda-flex-row border-bottom border-dark">
          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1 border-end border-dark d-flex flex-column justify-content-between text-center" style="min-height: 40px;">
            <div class="mt-auto">
              <div class="border-bottom border-dark mx-auto" style="width: 80%; height: 14px;"></div>
              <div class="text-2xs fw-bold text-dark mt-0.5">Printed Name & Signature of Processing Officer</div>
            </div>
            <div class="text-start mt-0.5">
              <span class="text-2xs fw-bold text-dark">Date:</span>
              <span class="text-2xs text-dark ms-1">________________</span>
            </div>
          </div>

          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1 d-flex flex-column justify-content-between text-center" style="min-height: 40px;">
            <div class="mt-auto">
              <div class="border-bottom border-dark mx-auto fw-bold text-dark small" style="width: 80%; min-height: 13px;">
                ${escapeHtml(fullName)}
              </div>
              <div class="text-2xs fw-bold text-dark mt-0.5">Printed Name & Signature of Applicant</div>
            </div>
            <div class="text-start mt-0.5">
              <span class="text-2xs fw-bold text-dark">Date:</span>
              <span class="text-2xs text-dark ms-1">________________</span>
            </div>
          </div>
        </div>

        <!-- Footer note -->
        <div class="text-center py-0.5 fst-italic fw-semibold text-primary" style="font-size: 0.72rem;">
          Note: Please bring this Admission Slip on your assessment date.
        </div>
      </div>
    </div>
  `;
}

export function printCandidateAssessmentForm(detail) {
  if (!detail) return;
  let printArea = document.getElementById("registrarPrintArea");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "registrarPrintArea";
    document.body.appendChild(printArea);
  } else if (printArea.parentElement !== document.body) {
    document.body.appendChild(printArea);
  }

  printArea.classList.remove("d-none");
  printArea.innerHTML = renderAssessmentApplicationProfile(detail);

  const bodyClass = "registrar-print-candidate";
  const cleanup = () => {
    document.body.classList.remove(bodyClass);
    if (printArea) {
      printArea.innerHTML = "";
      printArea.classList.add("d-none");
    }
    window.removeEventListener("afterprint", cleanup);
  };

  document.body.classList.add(bodyClass);
  window.addEventListener("afterprint", cleanup);

  setTimeout(() => {
    window.print();
  }, 150);
}

export function renderAssessmentApplicationProfile(detail) {
  const aa = detail?.assessmentApplication || {};
  const header = aa.header || {};
  const school = aa.school || {};
  const sec1 = aa.section1_clientType || {};
  const sec2 = aa.section2_profile || {};
  const nameObj = sec2.name || {
    surname: detail.section2?.lastName || "",
    firstName: detail.section2?.firstName || "",
    middleName: detail.section2?.middleName || "",
    middleInitial: "",
    nameExtension: detail.section2?.nameExtension || "",
  };
  const addr = sec2.address || {
    street: detail.section2?.street || "—",
    barangay: detail.section2?.barangay || "—",
    district: detail.section2?.district || "—",
    city: detail.section2?.city || "—",
    province: detail.section2?.province || "—",
    region: detail.section2?.region || "—",
    zipCode: "—",
  };
  const parents = sec2.parents || { motherName: "—", fatherName: "—" };
  const contact = sec2.contact || {
    tel: "—",
    mobile: detail.section2?.contact || "—",
    email: detail.section2?.email || "—",
    fax: "—",
    others: "—",
  };
  const edu = sec2.education || {
    value: "",
    label: detail.section3?.education || "—",
  };
  const emp = sec2.employment || {
    value: "",
    label: detail.section3?.employmentStatus || "—",
  };
  const birth = sec2.birth || {
    date: detail.section3?.birthDate || "—",
    mm: "",
    dd: "",
    yy: "",
    birthplace: detail.section3?.birthplace || "—",
    age: "—",
  };

  const workRows = aa.section3_workExperience || [];
  const trainingRows = aa.section4_trainingSeminars || [];
  const licenseRows = aa.section5_licensureExams || [];
  const competencyRows = aa.section6_competencyAssessments || [];

  const assessmentTypes = Array.isArray(school.assessmentTypes) ? school.assessmentTypes : [];
  const clientTypes = Array.isArray(sec1.selected) ? sec1.selected : [];

  const photoHtml = `<div class="border border-dark w-100 h-100 d-flex flex-column align-items-center justify-content-center p-1" style="min-height: 80px; max-height: 90px; background: #fff;">
    <div class="fw-bold text-dark" style="font-size: 0.72rem; letter-spacing: 0.05em;">PICTURE</div>
    <div class="fst-italic text-muted mt-0.5 text-center" style="font-size: 0.58rem; line-height: 1.15;">
      colored,<br>
      passport size,
    </div>
  </div>`;

  const incompleteBanner = detail.source === "registration"
    ? `<div class="alert alert-warning mb-2 no-print"><strong>Candidate profile not yet completed.</strong> Showing initial registration data. The candidate must submit the full TESDA Application Form (Step 1).</div>`
    : "";

  // Education matching
  const rawEdu = (edu.value || "").toLowerCase();
  const isElementary = rawEdu.includes("elementary");
  const isHighSchool = rawEdu.includes("high_school") || rawEdu.includes("secondary_undergrad");
  const isTvet = rawEdu.includes("tvet") || rawEdu.includes("post_secondary");
  const isCollegeLevel = rawEdu.includes("college_level") || rawEdu.includes("college_undergrad");
  const isCollegeGrad = rawEdu.includes("college_grad") || rawEdu.includes("masteral") || rawEdu.includes("doctorate");
  const isEduOther = Boolean(rawEdu && !isElementary && !isHighSchool && !isTvet && !isCollegeLevel && !isCollegeGrad);

  // Employment matching
  const rawEmp = (emp.value || "").toLowerCase();
  const isCasual = rawEmp === "casual";
  const isJobOrder = rawEmp === "job_order" || rawEmp.includes("job");
  const isProbationary = rawEmp === "probationary";
  const isPermanent = rawEmp === "permanent";
  const isSelfEmployed = rawEmp === "self_employed" || rawEmp.includes("self");
  const isOfw = rawEmp === "ofw";

  const sex = (sec2.sex || detail.section3?.sex || "").toLowerCase();
  const civilStatus = (sec2.civilStatus || "").toLowerCase();

  return `
    ${incompleteBanner}
    <div class="tesda-official-form tesda-print-page tesda-print-page--1">
      <!-- Top header line -->
      <div class="tesda-official-form__top-bar mb-1">
        <span>TESDA-OP-CO-05-F26</span> &nbsp;&nbsp; <span>Rev. 00 — 03/01/17</span>
      </div>

      <!-- Main agency header -->
      <header class="tesda-official-form__header mb-1">
        <img src="/static/img/TESDA%20Logo%20official.png" alt="TESDA Logo" class="tesda-official-form__logo" onerror="this.style.display='none'" />
        <div class="text-center flex-grow-1">
          <p class="tesda-official-form__agency-en mb-0">TECHNICAL EDUCATION AND SKILLS DEVELOPMENT AUTHORITY</p>
          <p class="tesda-official-form__agency-fil mb-0">Pangasiwaan sa Edukasyong Teknikal at Pagpapaunlad ng Kasanayan</p>
          <h2 class="tesda-official-form__title mb-0">APPLICATION FORM</h2>
        </div>
      </header>

      <!-- Reference number, ULI, Signature & Photo header box -->
      <div class="border border-dark mb-0">
        <div class="tesda-flex-row">
          <div style="flex: 1 1 auto; min-width: 0;" class="border-end border-dark p-1 d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex flex-wrap align-items-center gap-1 mb-1">
                <span class="fw-bold text-2xs text-uppercase" style="white-space: nowrap;">REFERENCE NUMBER :</span>
                <div class="d-flex flex-wrap align-items-center">
                  ${renderRefBoxes()}
                </div>
              </div>

              <div class="d-flex flex-wrap align-items-center gap-1 mb-0.5">
                <span class="fw-bold text-2xs text-uppercase" style="white-space: nowrap;">UNIQUE LEARNERS IDENTIFIER (ULI):</span>
                <div class="d-flex flex-wrap align-items-center">
                  ${renderUliBoxes()}
                </div>
              </div>
              <div class="text-center fst-italic text-muted mb-1" style="font-size: 0.6rem;">to be filled - out by the Processing Officer</div>
            </div>

            <div class="tesda-flex-row pt-1 border-top border-dark">
              <div style="flex: 0 0 50%; max-width: 50%;" class="text-center px-2">
                <div class="border-bottom border-dark pb-0.5 fw-bold small text-dark">${escapeHtml(header.signature || detail.name || "—")}</div>
                <div class="text-muted mt-0.5" style="font-size: 0.65rem;">Applicant's Signature</div>
              </div>
              <div style="flex: 0 0 50%; max-width: 50%;" class="text-center px-2">
                <div class="border-bottom border-dark pb-0.5 fw-bold small text-dark">${escapeHtml(header.dateOfApplication || detail.section1?.entryDate || "—")}</div>
                <div class="text-muted mt-0.5" style="font-size: 0.65rem;">Date of Application</div>
              </div>
            </div>
          </div>

          <div class="p-1 d-flex align-items-center justify-content-center flex-shrink-0" style="width: 100px; background: #fff;">
            ${photoHtml}
          </div>
        </div>
      </div>

      <!-- Training Center & Assessment Applied for -->
      <div class="border border-dark border-top-0 p-1">
        <div class="mb-0.5"><span class="fw-bold text-primary">Name of School/Training Center/Company:</span> <span class="fw-semibold text-dark ms-1">${escapeHtml(school.name || "Valiant Technical Institute and Assessment Center, Inc.")}</span></div>
        <div class="mb-0.5"><span class="fw-bold text-primary">Address:</span> <span class="fw-semibold text-dark ms-1">${escapeHtml(school.address || "Bangoy St., Salvacion, Panabo, Philippines, 8105")}</span></div>
        <div class="mb-0.5"><span class="fw-bold text-primary">Title of Assessment applied for:</span> <span class="fw-bold text-primary ms-1">${escapeHtml(school.assessmentTitle || detail.program || "—")}</span></div>
        <div class="d-flex flex-wrap align-items-center gap-3 mt-1 pt-0.5 border-top border-secondary-subtle">
          ${renderCheck("Full Qualification", assessmentTypes.includes("full_qualification"))}
          ${renderCheck("COC", assessmentTypes.includes("coc"))}
          ${renderCheck("Renewal", assessmentTypes.includes("renewal"))}
        </div>
      </div>

      <!-- 1. Client Type -->
      <div class="border border-dark border-top-0">
        <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold text-primary tesda-section-title">
          1. Client Type
        </div>
        <div class="p-1 d-flex flex-wrap gap-3 align-items-center">
          ${renderCheck("TVET Graduating Student", clientTypes.includes("tvet_graduating"))}
          ${renderCheck("TVET graduate", clientTypes.includes("tvet_graduate"))}
          ${renderCheck("Industry worker", clientTypes.includes("industry_worker"))}
          ${renderCheck("K-12", clientTypes.includes("k12"))}
          ${renderCheck("OFW", clientTypes.includes("ofw"))}
        </div>
      </div>

      <!-- 2. Profile -->
      <div class="border border-dark border-top-0">
        <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold text-primary tesda-section-title">
          2. Profile
        </div>

        <!-- 2.1 Name -->
        <div class="p-1 border-bottom border-dark">
          <div class="fw-bold text-2xs text-muted mb-0.5">2.1. Name:</div>
          <table class="tesda-name-table w-100 mb-0">
            <tbody>
              <tr>
                <td class="tesda-name-label" style="width: 85px;">SURNAME</td>
                <td class="p-0.5">${renderLetterBoxes(nameObj.surname, 30)}</td>
              </tr>
              <tr>
                <td class="tesda-name-label">FIRST NAME</td>
                <td class="p-0.5">${renderLetterBoxes(nameObj.firstName, 30)}</td>
              </tr>
              <tr>
                <td class="tesda-name-label">MIDDLE NAME</td>
                <td class="p-0.5">
                  <div class="d-flex flex-wrap align-items-center gap-1">
                    ${renderLetterBoxes(nameObj.middleName, 18)}
                    <div class="d-flex align-items-center gap-0.5 ms-1">
                      <span class="text-2xs text-muted" style="white-space: nowrap;">middle initial:</span>
                      <span class="tesda-char-box bg-light fw-bold">${escapeHtml(nameObj.middleInitial || (nameObj.middleName ? nameObj.middleName[0] : ""))}</span>
                    </div>
                    <div class="d-flex align-items-center gap-0.5 ms-1">
                      <span class="text-2xs text-muted" style="white-space: nowrap;">extension:</span>
                      <span class="tesda-char-box bg-light fw-bold px-1" style="width: auto; min-width: 1.4rem;">${escapeHtml(nameObj.nameExtension || "")}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 2.2 Mailing Address -->
        <div class="border-bottom border-dark">
          <div class="px-2 py-0.5 bg-light-subtle text-2xs fw-bold text-muted border-bottom border-dark">2.2. Mailing Address:</div>
          <!-- Row 1: Street, Barangay, District -->
          <div class="tesda-flex-row border-bottom border-dark">
            <div style="flex: 0 0 34%; max-width: 34%;" class="p-1 border-end border-dark">
              <span class="text-2xs text-muted d-block">Number, Street</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.street)}</span>
            </div>
            <div style="flex: 0 0 33%; max-width: 33%;" class="p-1 border-end border-dark">
              <span class="text-2xs text-muted d-block">Barangay</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.barangay)}</span>
            </div>
            <div style="flex: 0 0 33%; max-width: 33%;" class="p-1">
              <span class="text-2xs text-muted d-block">District</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.district)}</span>
            </div>
          </div>
          <!-- Row 2: City / Municipality, Province, Region, Zip Code -->
          <div class="tesda-flex-row">
            <div style="flex: 0 0 28%; max-width: 28%;" class="p-1 border-end border-dark">
              <span class="text-2xs text-muted d-block">City / Municipality</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.city)}</span>
            </div>
            <div style="flex: 0 0 28%; max-width: 28%;" class="p-1 border-end border-dark">
              <span class="text-2xs text-muted d-block">Province</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.province)}</span>
            </div>
            <div style="flex: 0 0 28%; max-width: 28%;" class="p-1 border-end border-dark">
              <span class="text-2xs text-muted d-block">Region</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.region)}</span>
            </div>
            <div style="flex: 0 0 16%; max-width: 16%;" class="p-1">
              <span class="text-2xs text-muted d-block">Zip Code</span>
              <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(addr.zipCode)}</span>
            </div>
          </div>
        </div>

        <!-- 2.3 & 2.4 Parents -->
        <div class="tesda-flex-row border-bottom border-dark">
          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1 border-end border-dark">
            <span class="text-2xs text-muted d-block">2.3. Mother's Name</span>
            <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(parents.motherName)}</span>
          </div>
          <div style="flex: 0 0 50%; max-width: 50%;" class="p-1">
            <span class="text-2xs text-muted d-block">2.4. Father's Name</span>
            <span class="fw-semibold text-dark small text-truncate d-block">${escapeHtml(parents.fatherName)}</span>
          </div>
        </div>

        <!-- 2.5 - 2.9 (5-Column Grid side-by-side) -->
        <div class="tesda-flex-row border-bottom border-dark tesda-profile-5col">
          <!-- 2.5 Sex -->
          <div style="flex: 0 0 10%; max-width: 10%;" class="p-1 border-end border-dark">
            <span class="text-2xs text-muted d-block mb-0.5 fw-bold">2.5. Sex</span>
            <div class="d-flex flex-column gap-0.5">
              ${renderCheck("Male", sex === "male")}
              ${renderCheck("Female", sex === "female")}
            </div>
          </div>

          <!-- 2.6 Civil Status -->
          <div style="flex: 0 0 13%; max-width: 13%;" class="p-1 border-end border-dark">
            <span class="text-2xs text-muted d-block mb-0.5 fw-bold">2.6. Civil Status</span>
            <div class="d-flex flex-column gap-0.5">
              ${renderCheck("Single", civilStatus === "single")}
              ${renderCheck("Married", civilStatus === "married")}
              ${renderCheck("Widow/er", civilStatus === "widow" || civilStatus === "widowed")}
              ${renderCheck("Separated", civilStatus === "separated")}
            </div>
          </div>

          <!-- 2.7 Contact Number(s) -->
          <div style="flex: 0 0 28%; max-width: 28%;" class="p-1 border-end border-dark">
            <span class="text-2xs text-muted d-block mb-0.5 fw-bold">2.7. Contact Number(s)</span>
            <div class="d-flex flex-column gap-0.5 small">
              <div><span class="text-muted text-2xs">Tel:</span> <span class="fw-medium">${escapeHtml(contact.tel)}</span></div>
              <div><span class="text-muted text-2xs">Mobile:</span> <span class="fw-bold">${escapeHtml(contact.mobile)}</span></div>
              <div class="text-truncate" title="${escapeHtml(contact.email)}"><span class="text-muted text-2xs">E-mail:</span> <span class="fw-medium">${escapeHtml(contact.email)}</span></div>
              <div><span class="text-muted text-2xs">Fax:</span> <span class="fw-medium">${escapeHtml(contact.fax)}</span></div>
              <div><span class="text-muted text-2xs">Others:</span> <span class="fw-medium">${escapeHtml(contact.others)}</span></div>
            </div>
          </div>

          <!-- 2.8 Highest Educational Attainment -->
          <div style="flex: 0 0 27%; max-width: 27%;" class="p-1 border-end border-dark">
            <span class="text-2xs text-muted d-block mb-0.5 fw-bold">2.8. Highest Educational Attainment</span>
            <div class="d-flex flex-column gap-0.5">
              ${renderCheck("Elementary Graduate", isElementary)}
              ${renderCheck("High School Graduate", isHighSchool)}
              ${renderCheck("TVET Graduate", isTvet)}
              ${renderCheck("College Level", isCollegeLevel)}
              ${renderCheck("College Graduate", isCollegeGrad)}
              ${renderCheck("Others: " + (isEduOther ? escapeHtml(edu.label) : "__________"), isEduOther)}
            </div>
          </div>

          <!-- 2.9 Employment Status -->
          <div style="flex: 0 0 22%; max-width: 22%;" class="p-1">
            <span class="text-2xs text-muted d-block mb-0.5 fw-bold">2.9. Employment Status</span>
            <div class="d-flex flex-column gap-0.5">
              ${renderCheck("Casual", isCasual)}
              ${renderCheck("Job Order", isJobOrder)}
              ${renderCheck("Probationary", isProbationary)}
              ${renderCheck("Permanent", isPermanent)}
              ${renderCheck("Self-Employed", isSelfEmployed)}
              ${renderCheck("OFW", isOfw)}
            </div>
          </div>
        </div>

        <!-- 2.10 - 2.12 Birth Date, Birth Place, Age -->
        <div class="tesda-flex-row p-1 align-items-center">
          <div style="flex: 0 0 40%; max-width: 40%;" class="d-flex align-items-center gap-1 border-end border-dark pe-2">
            <span class="text-2xs text-muted text-nowrap">2.10 Birth date (mm/dd/yy):</span>
            <div class="d-flex align-items-center gap-0.5">
              <span class="tesda-char-box bg-light fw-bold">${escapeHtml(birth.mm || "MM")}</span> /
              <span class="tesda-char-box bg-light fw-bold">${escapeHtml(birth.dd || "DD")}</span> /
              <span class="tesda-char-box bg-light fw-bold" style="width: auto; min-width: 1.6rem; padding: 0 2px;">${escapeHtml(birth.yy || "YY")}</span>
            </div>
          </div>
          <div style="flex: 0 0 45%; max-width: 45%;" class="d-flex align-items-center gap-1 border-end border-dark px-2">
            <span class="text-2xs text-muted text-nowrap">2.11 Birth place:</span>
            <span class="fw-semibold small text-dark text-truncate">${escapeHtml(birth.birthplace)}</span>
          </div>
          <div style="flex: 0 0 15%; max-width: 15%;" class="d-flex align-items-center gap-1 ps-2">
            <span class="text-2xs text-muted text-nowrap">2.12 Age:</span>
            <span class="fw-bold small text-dark">${escapeHtml(birth.age)}</span>
          </div>
        </div>
      </div>

      <!-- 3. Work Experience -->
      <div class="border border-dark border-top-0 mb-0">
        <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold text-primary tesda-section-title">
          3. Work Experience <span class="fw-normal text-muted" style="font-size: 0.72rem;">(National Qualification-related)</span>
        </div>
        <div class="table-responsive mb-0">
          <table class="tesda-official-table w-100 mb-0">
            <thead>
              <tr>
                <th style="width: 25%;">3.1 Name of Company</th>
                <th style="width: 20%;">3.2 Position</th>
                <th style="width: 15%;">3.3 Inclusive Dates</th>
                <th style="width: 12%;">3.4 Monthly Salary</th>
                <th style="width: 14%;">3.5 Status of Appointment</th>
                <th style="width: 14%;">3.6 No. of Yrs. Working Exp.</th>
              </tr>
            </thead>
            <tbody>
              ${renderWorkExperienceRows(workRows)}
            </tbody>
          </table>
        </div>
        <div class="px-2 py-0.5 text-muted fst-italic" style="font-size: 0.62rem;">(For more information, please use separate sheet)</div>
      </div>
    </div>

    <!-- Page 2 separator (screen only) -->
    <div class="d-flex align-items-center justify-content-between my-2 text-muted text-2xs px-1 no-print">
      <span class="border-top border-secondary-subtle flex-grow-1 me-2"></span>
      <span class="fw-bold text-uppercase text-secondary"><i class="bi bi-file-earmark-text me-1"></i>Page 2 — Qualifications & History & Admission Slip</span>
      <span class="border-top border-secondary-subtle flex-grow-1 ms-2"></span>
    </div>

    <div class="tesda-official-form tesda-print-page tesda-print-page--2">
      <!-- TOP HALF: Qualifications & History -->
      <div class="tesda-page-2-top-half">
        <!-- 4. Other Training/Seminars Attended -->
        <div class="border border-dark mb-0">
          <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold text-primary tesda-section-title">
            4. Other Training/Seminars Attended <span class="fw-normal text-muted" style="font-size: 0.72rem;">(National Qualification-related)</span>
          </div>
          <div class="table-responsive mb-0">
            <table class="tesda-official-table w-100 mb-0">
              <thead>
                <tr>
                  <th style="width: 30%;">4.1 Title</th>
                  <th style="width: 25%;">4.2 Venue</th>
                  <th style="width: 15%;">4.3 Inclusive Dates</th>
                  <th style="width: 12%;">4.4 No. of Hours</th>
                  <th style="width: 18%;">4.5 Conducted By</th>
                </tr>
              </thead>
              <tbody>
                ${renderTrainingRows(trainingRows)}
              </tbody>
            </table>
          </div>
          <div class="px-2 py-0.5 text-muted fst-italic" style="font-size: 0.62rem;">(For more information, please use separate sheet)</div>
        </div>

        <!-- 5. Licensure Examination(s) Passed -->
        <div class="border border-dark border-top-0 mb-0">
          <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold text-primary tesda-section-title">
            5. Licensure Examination(s) Passed
          </div>
          <div class="table-responsive mb-0">
            <table class="tesda-official-table w-100 mb-0">
              <thead>
                <tr>
                  <th style="width: 26%;">5.1 Title</th>
                  <th style="width: 12%;">5.2 Year Taken</th>
                  <th style="width: 26%;">5.3 Examination Venue</th>
                  <th style="width: 12%;">5.4 Rating</th>
                  <th style="width: 12%;">5.5 Remarks</th>
                  <th style="width: 12%;">5.6 Expiry Date</th>
                </tr>
              </thead>
              <tbody>
                ${renderLicenseRows(licenseRows)}
              </tbody>
            </table>
          </div>
          <div class="px-2 py-0.5 text-muted fst-italic" style="font-size: 0.62rem;">(For more information, please use separate sheet)</div>
        </div>

        <!-- 6. Competency Assessment(s) Passed -->
        <div class="border border-dark border-top-0">
          <div class="bg-light px-2 py-0.5 border-bottom border-dark fw-bold text-primary tesda-section-title">
            6. Competency Assessment(s) Passed
          </div>
          <div class="table-responsive mb-0">
            <table class="tesda-official-table w-100 mb-0">
              <thead>
                <tr>
                  <th style="width: 25%;">6.1 Title</th>
                  <th style="width: 15%;">6.2 Qualification Level</th>
                  <th style="width: 18%;">6.3 Industry Sector</th>
                  <th style="width: 18%;">6.4 Certificate Number</th>
                  <th style="width: 12%;">6.5 Date of Issuance</th>
                  <th style="width: 12%;">6.6 Expiration Date</th>
                </tr>
              </thead>
              <tbody>
                ${renderCompetencyRows(competencyRows)}
              </tbody>
            </table>
          </div>
          <div class="px-2 py-0.5 text-muted fst-italic" style="font-size: 0.62rem;">(For more information, please use separate sheet)</div>
        </div>
      </div>

      <!-- BOTTOM HALF: ADMISSION SLIP ("half to half cut") -->
      ${renderAdmissionSlip(detail, { school, contact, nameObj, assessmentTypes })}
    </div>`;
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
    body = renderAssessmentApplicationProfile(detail);
  } else if (detail.source === "registration") {
    body = renderIncompleteProfileNotice(detail);
  } else {
    body = renderTrainingLearnerProfile(detail);
  }
  return `${body}${submissionIndicatorsBlock}${documentsBlock}`;
}
