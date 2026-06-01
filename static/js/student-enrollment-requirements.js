/**
 * Step 2 — enrollment document uploads.
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
  if (nameEl) nameEl.textContent = file.name;
  if (viewBtn) {
    viewBtn.hidden = false;
    viewBtn.onclick = () =>
      openFilePreview({
        url: fileInput._pendingObjectUrl,
        filename: file.name,
        revokeOnClose: false,
      });
  }

  pending.classList.remove("d-none");
}

document.addEventListener("DOMContentLoaded", () => {
  initFilePreviewTriggers(document);

  document.querySelectorAll(".student-req-upload-form").forEach((form) => {
    const fileInput = form.querySelector(".student-req-file-input");
    if (!fileInput) return;

    const pending = form.querySelector("[data-req-pending]");
    const confirmBtn = pending?.querySelector(".student-req-pending__confirm");
    const cancelBtn = pending?.querySelector(".student-req-pending__cancel");

    if (form.dataset.requiresIdType === "1") {
      syncValidIdUploadButton(form);
      const idSelect = form.querySelector('select[name="id_type"]');
      idSelect?.addEventListener("change", () => {
        idSelect.classList.remove("is-invalid");
        syncValidIdUploadButton(form);
      });
    }

    fileInput.addEventListener("change", () => {
      if (!fileInput.files?.length) {
        hidePendingUpload(form);
        return;
      }

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

      showPendingUpload(form, fileInput.files[0]);
    });

    confirmBtn?.addEventListener("click", () => {
      if (!fileInput.files?.length) return;
      form.submit();
    });

    cancelBtn?.addEventListener("click", () => hidePendingUpload(form));
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
});
