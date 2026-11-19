/**
 * Step 2 — enrollment document uploads with full AJAX technique and Bootstrap modals.
 */

import { initFilePreviewTriggers, openFilePreview } from "./file-upload-preview.js";

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

function getCsrfToken() {
  return (
    document.querySelector('.student-req-upload-form input[name="csrfmiddlewaretoken"]')?.value ||
    document.querySelector('input[name="csrfmiddlewaretoken"]')?.value ||
    ""
  );
}

function syncValidIdUploadButton(form) {
  const idSelect = form.querySelector('select[name="id_type"]');
  if (!idSelect) return;

  const fileInput = form.querySelector(".student-req-file-input");
  const uploadLabel = form.querySelector(".student-req-upload-btn");
  if (!fileInput || !uploadLabel) return;

  const enabled = Boolean(idSelect.value);
  fileInput.disabled = !enabled;
  uploadLabel.classList.toggle("student-req-upload-btn--disabled", !enabled);
  uploadLabel.setAttribute("aria-disabled", String(!enabled));

  if (enabled) {
    uploadLabel.setAttribute("for", fileInput.id);
  } else {
    uploadLabel.removeAttribute("for");
    fileInput.value = "";
    hidePendingUpload(form);
  }
}

function hidePendingUpload(form) {
  const pending = form.querySelector("[data-req-pending]");
  const fileInput = form.querySelector(".student-req-file-input");
  if (!pending) return;
  pending.classList.add("d-none");
  if (fileInput?._pendingObjectUrl) {
    URL.revokeObjectURL(fileInput._pendingObjectUrl);
    fileInput._pendingObjectUrl = null;
  }
  if (fileInput?._abortController) {
    try {
      fileInput._abortController.abort();
    } catch {}
    fileInput._abortController = null;
  }
  if (fileInput) fileInput.value = "";
}

function showPendingUpload(form, file) {
  const pending = form.querySelector("[data-req-pending]");
  const fileInput = form.querySelector(".student-req-file-input");
  if (!pending || !fileInput || !file) return;

  if (fileInput._pendingObjectUrl) {
    URL.revokeObjectURL(fileInput._pendingObjectUrl);
  }
  fileInput._pendingObjectUrl = URL.createObjectURL(file);

  const nameEl = pending.querySelector("[data-req-pending-name]");
  const viewBtn = pending.querySelector("[data-req-pending-view]");
  const statusBadge = pending.querySelector("[data-req-pending-status]");
  const spinner = pending.querySelector(".spinner-border, .bi-check-circle-fill");

  if (nameEl) nameEl.textContent = file.name;
  if (statusBadge) {
    statusBadge.textContent = "Uploading...";
    statusBadge.className = "badge bg-success-subtle text-success border border-success-subtle small ms-1";
  }
  if (spinner) {
    spinner.className = "spinner-border spinner-border-sm text-success";
  }

  if (viewBtn) {
    viewBtn.hidden = false;
    viewBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openFilePreview({
        url: fileInput._pendingObjectUrl,
        filename: file.name,
        revokeOnClose: false,
      });
    };
  }

  pending.classList.remove("d-none");
}

function showToast(message, type = "success") {
  const container = document.getElementById("ajax-toast-container");
  const alertEl = document.getElementById("ajax-toast-alert");
  const msgEl = document.getElementById("ajax-toast-message");
  if (!container || !alertEl || !msgEl) return;

  msgEl.textContent = message;
  alertEl.className = `alert alert-${type} alert-dismissible fade show d-flex align-items-center gap-2 mb-2`;
  container.classList.remove("d-none");

  if (window._ajaxToastTimeout) {
    clearTimeout(window._ajaxToastTimeout);
  }
  window._ajaxToastTimeout = setTimeout(() => {
    container.classList.add("d-none");
  }, 5000);
}

function updatePageIndicators(data) {
  if (!data) return;

  // 1. Progress Bar
  if (data.progress_percent !== undefined) {
    const fillEl = document.getElementById("enrollment-progress-fill");
    const textEl = document.getElementById("enrollment-progress-text");
    const trackEl = document.getElementById("enrollment-progress-track");
    if (fillEl) fillEl.style.width = `${data.progress_percent}%`;
    if (textEl) textEl.textContent = `${data.progress_percent}%`;
    if (trackEl) trackEl.setAttribute("aria-valuenow", data.progress_percent);
  }

  // 2. Digital Upload Status Badge
  const badgeEl = document.getElementById("digital-status-badge");
  const labelEl = document.getElementById("digital-status-label");
  const iconEl = document.getElementById("digital-status-icon");
  const descEl = document.getElementById("digital-status-desc");

  if (badgeEl && data.digital_badge_class) {
    badgeEl.className = `badge ${data.digital_badge_class} px-2 py-1`;
  }
  if (labelEl && data.digital_label) {
    labelEl.textContent = data.digital_label;
  }
  if (iconEl && data.digital_is_uploaded !== undefined) {
    iconEl.className = `bi ${data.digital_is_uploaded ? "bi-check-circle-fill" : "bi-exclamation-circle-fill"} me-1`;
  }
  if (descEl && data.digital_is_uploaded !== undefined) {
    descEl.textContent = data.digital_is_uploaded
      ? "All required documents are uploaded to the system."
      : "Please upload your remaining required documents below.";
  }

  // 3. Clear submission validation alert if all required docs uploaded
  const alertEl = document.getElementById("requirements-form-alert");
  if (alertEl) {
    const requiredMissing = document.querySelectorAll(
      ".student-req-card[data-required='1']:not([data-uploaded='1'])"
    );
    if (!requiredMissing.length) {
      alertEl.classList.add("d-none");
    }
  }
}

let pendingCancelDocType = "";
let pendingRejectedDocType = "";

function bindRequirementEvents() {
  initFilePreviewTriggers(document);

  // Bind upload form inputs
  document.querySelectorAll(".student-req-upload-form").forEach((form) => {
    if (form.dataset.approved === "1") return;

    const fileInput = form.querySelector(".student-req-file-input");
    if (!fileInput) return;

    const pending = form.querySelector("[data-req-pending]");
    const cancelBtn = pending?.querySelector(".student-req-pending__cancel");

    if (form.dataset.requiresIdType === "1") {
      syncValidIdUploadButton(form);
      const idSelect = form.querySelector('select[name="id_type"]');
      idSelect?.addEventListener("change", () => {
        idSelect.classList.remove("is-invalid");
        syncValidIdUploadButton(form);
      });
    }

    fileInput.addEventListener("change", async () => {
      if (!fileInput.files?.length) {
        hidePendingUpload(form);
        return;
      }

      const file = fileInput.files[0];

      // Validate ID type if required
      const idSelect = form.querySelector('select[name="id_type"]');
      if (idSelect && !idSelect.value) {
        idSelect.focus();
        idSelect.classList.add("is-invalid");
        fileInput.value = "";
        syncValidIdUploadButton(form);
        const alertEl = document.getElementById("requirements-form-alert");
        if (alertEl) {
          alertEl.classList.remove("d-none");
          const msgSpan = alertEl.querySelector("span");
          if (msgSpan) msgSpan.textContent = "Please select an ID type before uploading your Valid ID.";
          alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }

      // Check file extension (PDF, JPG, JPEG, PNG)
      const fileNameLower = file.name.toLowerCase();
      const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => fileNameLower.endsWith(ext));
      if (!hasValidExt) {
        showToast("Only PDF, JPEG, and PNG files are supported.", "danger");
        fileInput.value = "";
        hidePendingUpload(form);
        return;
      }

      showPendingUpload(form, file);

      // Automatic upload via fetch
      const formData = new FormData(form);
      const abortCtrl = new AbortController();
      fileInput._abortController = abortCtrl;

      try {
        const postUrl = form.getAttribute("action") || window.location.pathname;
        const res = await fetch(postUrl, {
          method: "POST",
          body: formData,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json",
          },
          signal: abortCtrl.signal,
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.ok) {
          if (data.requirements_list_html) {
            const listEl = document.getElementById("requirements-list");
            if (listEl) {
              listEl.innerHTML = data.requirements_list_html;
            }
            bindRequirementEvents();
            updatePageIndicators(data);
            showToast(data.message || "Document uploaded successfully.", "success");
          } else {
            window.location.reload();
          }
        } else {
          const errText = data?.error || "Upload failed. Please try again.";
          showToast(errText, "danger");
          hidePendingUpload(form);
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return;
        }
        console.error("AJAX upload failed:", err);
        showToast("Network or server error during upload. Please try again.", "danger");
        hidePendingUpload(form);
      }
    });

    cancelBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      hidePendingUpload(form);
    });
  });

  // Cancel / remove uploaded document triggers (Open Bootstrap Modal)
  document.querySelectorAll("[data-remove-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const docType = button.dataset.removeDocument || "";
      const docTitle = button.dataset.removeTitle || "document";
      if (!docType) return;
      pendingCancelDocType = docType;

      const modalEl = document.getElementById("removeDocumentModal");
      const msgEl = document.getElementById("removeDocumentModalMessage");
      const labelEl = document.getElementById("removeDocumentModalLabel");

      if (labelEl) {
        labelEl.textContent = `Remove ${docTitle}?`;
      }
      if (msgEl) {
        msgEl.textContent = `Are you sure you want to cancel and remove your uploaded ${docTitle}? You will need to upload a replacement file.`;
      }

      if (modalEl && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      } else if (window.confirm(`Are you sure you want to cancel and remove your uploaded ${docTitle}?`)) {
        executeCancelDocument(docType);
      }
    });
  });

  // Remove rejected modal triggers (Open Bootstrap Modal)
  document.querySelectorAll("[data-remove-rejected-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const docType = button.dataset.removeRejectedDocument || "";
      const docTitle = button.dataset.removeRejectedTitle || "document";
      if (!docType) return;
      pendingRejectedDocType = docType;

      const removeRejectedModalEl = document.getElementById("removeRejectedModal");
      const removeRejectedModalMessageEl = document.getElementById("removeRejectedModalMessage");

      if (removeRejectedModalMessageEl) {
        removeRejectedModalMessageEl.textContent = `Remove the rejected file for ${docTitle}? You can upload a new file right away.`;
      }

      if (removeRejectedModalEl && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(removeRejectedModalEl);
        modal.show();
      } else if (window.confirm(`Remove the rejected file for ${docTitle}? You can upload a new file right away.`)) {
        handleRemoveRejected(docType);
      }
    });
  });
}

async function executeCancelDocument(docType) {
  const modalEl = document.getElementById("removeDocumentModal");
  const modal = modalEl && window.bootstrap?.Modal ? window.bootstrap.Modal.getInstance(modalEl) : null;
  const confirmBtn = document.getElementById("removeDocumentModalConfirmBtn");
  const spinner = document.getElementById("removeDocumentModalSpinner");
  const textEl = document.getElementById("removeDocumentModalConfirmText");

  if (confirmBtn) confirmBtn.disabled = true;
  if (spinner) spinner.classList.remove("d-none");
  if (textEl) textEl.textContent = "Removing...";

  const csrfToken = getCsrfToken();
  const formData = new FormData();
  formData.append("csrfmiddlewaretoken", csrfToken);
  formData.append("action", "cancel");
  formData.append("document_type", docType);

  try {
    const res = await fetch(window.location.pathname, {
      method: "POST",
      body: formData,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
      },
    });
    const data = await res.json().catch(() => null);

    modal?.hide();

    if (res.ok && data?.ok) {
      if (data.requirements_list_html) {
        const listEl = document.getElementById("requirements-list");
        if (listEl) {
          listEl.innerHTML = data.requirements_list_html;
        }
        bindRequirementEvents();
        updatePageIndicators(data);
        showToast(data.message || "File removed successfully.", "info");
      } else {
        window.location.reload();
      }
    } else {
      showToast(data?.error || "Failed to remove file.", "danger");
    }
  } catch (err) {
    console.error("Remove failed:", err);
    window.location.reload();
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
    if (spinner) spinner.classList.add("d-none");
    if (textEl) textEl.textContent = "Yes, Remove";
    pendingCancelDocType = "";
  }
}

async function handleRemoveRejected(docType) {
  const csrfToken = getCsrfToken();
  const formData = new FormData();
  formData.append("csrfmiddlewaretoken", csrfToken);
  formData.append("action", "remove_rejected");
  formData.append("document_type", docType);

  try {
    const res = await fetch(window.location.pathname, {
      method: "POST",
      body: formData,
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
      },
    });
    const data = await res.json().catch(() => null);

    if (res.ok && data?.ok && data.requirements_list_html) {
      const listEl = document.getElementById("requirements-list");
      if (listEl) {
        listEl.innerHTML = data.requirements_list_html;
      }
      bindRequirementEvents();
      updatePageIndicators(data);
      showToast(data.message || "Rejected file removed.", "info");
    } else {
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  bindRequirementEvents();

  // Remove Document Modal confirm button
  const removeDocumentModalConfirmBtn = document.getElementById("removeDocumentModalConfirmBtn");
  removeDocumentModalConfirmBtn?.addEventListener("click", async () => {
    if (!pendingCancelDocType) return;
    await executeCancelDocument(pendingCancelDocType);
  });

  // Remove Rejected modal confirm button
  const removeRejectedModalConfirmBtn = document.getElementById("removeRejectedModalConfirmBtn");
  const removeRejectedModalEl = document.getElementById("removeRejectedModal");
  removeRejectedModalConfirmBtn?.addEventListener("click", async () => {
    if (!pendingRejectedDocType) return;
    const modal = removeRejectedModalEl && window.bootstrap?.Modal
      ? window.bootstrap.Modal.getInstance(removeRejectedModalEl)
      : null;
    modal?.hide();
    await handleRemoveRejected(pendingRejectedDocType);
    pendingRejectedDocType = "";
  });

  // Client validation before opening Submit modal
  const submitBtn = document.getElementById("requirements-submit-btn");
  const alertEl = document.getElementById("requirements-form-alert");
  if (submitBtn && alertEl) {
    submitBtn.addEventListener("click", (e) => {
      const requiredMissing = document.querySelectorAll(
        ".student-req-card[data-required='1']:not([data-uploaded='1'])"
      );
      if (requiredMissing.length) {
        e.preventDefault();
        e.stopPropagation();

        const missingTitles = [];
        requiredMissing.forEach((card) => {
          const title = card.querySelector(".student-req-card__title")?.textContent?.trim();
          if (title) missingTitles.push(title.replace(/\*$/, "").trim());
        });

        alertEl.classList.remove("d-none");
        const msgSpan = alertEl.querySelector("span");
        if (msgSpan) {
          msgSpan.textContent = `Please upload all required documents (${missingTitles.join(", ")}) before submitting.`;
        }
        alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }

  // AJAX Submission from Confirm Modal
  const submitConfirmForm = document.getElementById("submit-confirm-form");
  const submitConfirmBtn = document.getElementById("submit-confirm-btn");
  const submitConfirmSpinner = document.getElementById("submit-confirm-spinner");
  const submitConfirmBtnText = document.getElementById("submit-confirm-btn-text");
  const submitConfirmModalEl = document.getElementById("submitConfirmModal");

  submitConfirmForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(submitConfirmForm);
    if (submitConfirmBtn) submitConfirmBtn.disabled = true;
    if (submitConfirmSpinner) submitConfirmSpinner.classList.remove("d-none");
    if (submitConfirmBtnText) submitConfirmBtnText.textContent = "Submitting...";

    try {
      const postUrl = submitConfirmForm.getAttribute("action") || window.location.pathname;
      const res = await fetch(postUrl, {
        method: "POST",
        body: formData,
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Accept": "application/json",
        },
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        if (submitConfirmModalEl && window.bootstrap?.Modal) {
          const modal = window.bootstrap.Modal.getInstance(submitConfirmModalEl);
          modal?.hide();
        }
        showToast(data.message || "Submitted successfully!", "success");
        setTimeout(() => {
          window.location.href = data.redirect_url || "/dashboard/student/enrollment/pending/";
        }, 300);
      } else {
        if (submitConfirmModalEl && window.bootstrap?.Modal) {
          const modal = window.bootstrap.Modal.getInstance(submitConfirmModalEl);
          modal?.hide();
        }
        if (submitConfirmBtn) submitConfirmBtn.disabled = false;
        if (submitConfirmSpinner) submitConfirmSpinner.classList.add("d-none");
        if (submitConfirmBtnText) submitConfirmBtnText.textContent = "Yes, Submit";

        const errors = data?.errors || [data?.error || "Submission failed. Please check your documents."];
        if (alertEl) {
          alertEl.classList.remove("d-none");
          const msgSpan = alertEl.querySelector("span");
          if (msgSpan) msgSpan.textContent = errors.join(" ");
          alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    } catch (err) {
      console.error("AJAX submission error:", err);
      HTMLFormElement.prototype.submit.call(submitConfirmForm);
    }
  });
});
