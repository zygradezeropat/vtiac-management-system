/**
 * Step 2 — enrollment document uploads with automatic background upload.
 */

import { initFilePreviewTriggers, openFilePreview } from "./file-upload-preview.js";

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

document.addEventListener("DOMContentLoaded", () => {
  initFilePreviewTriggers(document);
  const csrfToken = document.querySelector(
    '.student-req-upload-form input[name="csrfmiddlewaretoken"]'
  )?.value;
  const removeRejectedModalEl = document.getElementById("removeRejectedModal");
  const removeRejectedModalMessageEl = document.getElementById(
    "removeRejectedModalMessage"
  );
  const removeRejectedModalConfirmBtn = document.getElementById(
    "removeRejectedModalConfirmBtn"
  );
  const removeRejectedModal =
    removeRejectedModalEl && window.bootstrap?.Modal
      ? new window.bootstrap.Modal(removeRejectedModalEl)
      : null;
  let pendingRejectedDocType = "";

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
          alertEl.querySelector("span").textContent =
            "Please select an ID type before uploading your Valid ID.";
        }
        return;
      }

      // Check file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert("The selected file exceeds 5MB. Please upload a PDF under 5MB.");
        fileInput.value = "";
        hidePendingUpload(form);
        return;
      }

      // Check file type
      if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        alert("Only PDF files are supported.");
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

        if (res.ok) {
          const statusBadge = pending?.querySelector("[data-req-pending-status]");
          const spinner = pending?.querySelector(".spinner-border");
          if (statusBadge) {
            statusBadge.textContent = "Uploaded!";
            statusBadge.className = "badge bg-success text-white small ms-1";
          }
          if (spinner) {
            spinner.className = "bi bi-check-circle-fill text-success fs-6";
          }
          setTimeout(() => {
            window.location.reload();
          }, 400);
        } else {
          let errText = "Upload failed.";
          try {
            const errData = await res.json();
            if (errData.error) errText = errData.error;
          } catch {}
          alert(errText);
          hidePendingUpload(form);
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return; // Cancelled by user
        }
        console.error("Upload failed, falling back to form submit:", err);
        // Fallback: standard form submit
        form.submit();
      }
    });

    cancelBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      hidePendingUpload(form);
    });
  });

  // Cancel / remove uploaded document
  document.querySelectorAll("[data-remove-document]").forEach((button) => {
    button.addEventListener("click", async () => {
      const docType = button.dataset.removeDocument || "";
      const docTitle = button.dataset.removeTitle || "document";
      if (!docType) return;

      if (window.confirm(`Are you sure you want to cancel and remove your uploaded ${docTitle}?`)) {
        const formData = new FormData();
        if (csrfToken) formData.append("csrfmiddlewaretoken", csrfToken);
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
          if (res.ok) {
            window.location.reload();
            return;
          }
        } catch {}

        // Fallback form submit
        const form = document.createElement("form");
        form.method = "post";
        form.action = window.location.pathname;
        form.innerHTML = `
          <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken || ""}">
          <input type="hidden" name="action" value="cancel">
          <input type="hidden" name="document_type" value="${docType}">
        `;
        document.body.appendChild(form);
        form.submit();
      }
    });
  });

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
        alertEl.classList.remove("d-none");
        alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }

  document.querySelectorAll("[data-remove-rejected-document]").forEach((button) => {
    button.addEventListener("click", () => {
      const docType = button.dataset.removeRejectedDocument || "";
      const docTitle = button.dataset.removeRejectedTitle || "document";
      if (!docType || !csrfToken) return;
      pendingRejectedDocType = docType;

      if (removeRejectedModal && removeRejectedModalMessageEl) {
        removeRejectedModalMessageEl.textContent = `Remove the rejected file for ${docTitle}? You can upload a new file right away.`;
        removeRejectedModal.show();
        return;
      }

      // Fallback if Bootstrap modal is unavailable.
      if (
        window.confirm(
          `Remove the rejected file for ${docTitle}? You can upload a new file right away.`
        )
      ) {
        const form = document.createElement("form");
        form.method = "post";
        form.action = window.location.pathname;
        form.innerHTML = `
          <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
          <input type="hidden" name="action" value="remove_rejected">
          <input type="hidden" name="document_type" value="${docType}">
        `;
        document.body.appendChild(form);
        form.submit();
      }
    });
  });

  removeRejectedModalConfirmBtn?.addEventListener("click", () => {
    if (!pendingRejectedDocType || !csrfToken) return;
    const form = document.createElement("form");
    form.method = "post";
    form.action = window.location.pathname;
    form.innerHTML = `
      <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
      <input type="hidden" name="action" value="remove_rejected">
      <input type="hidden" name="document_type" value="${pendingRejectedDocType}">
    `;
    document.body.appendChild(form);
    form.submit();
  });
});
