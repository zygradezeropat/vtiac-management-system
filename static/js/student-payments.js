/**
 * Student payments — proof of payment file upload.
 */

import { initFilePreviewTriggers, openFilePreview } from "./file-upload-preview.js";

document.addEventListener("DOMContentLoaded", () => {
  initFilePreviewTriggers(document);
  const form = document.getElementById("payment-proof-form");
  const fileInput = document.getElementById("payment-proof-file");
  const pending = document.getElementById("payment-proof-pending");
  const confirmBtn = document.getElementById("payment-proof-confirm");
  const cancelBtn = document.getElementById("payment-proof-cancel");

  if (!form || !fileInput) return;

  function hidePending() {
    pending?.classList.add("d-none");
    if (fileInput._pendingObjectUrl) {
      URL.revokeObjectURL(fileInput._pendingObjectUrl);
      fileInput._pendingObjectUrl = null;
    }
    fileInput.value = "";
  }

  function showPending(file) {
    if (!pending || !file) return;
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

  fileInput.addEventListener("change", () => {
    if (!fileInput.files?.length) {
      hidePending();
      return;
    }
    showPending(fileInput.files[0]);
  });

  confirmBtn?.addEventListener("click", () => {
    if (fileInput.files?.length) {
      form.requestSubmit();
    }
  });

  cancelBtn?.addEventListener("click", hidePending);
});
