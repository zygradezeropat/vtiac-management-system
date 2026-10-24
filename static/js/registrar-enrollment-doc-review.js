/**
 * Registrar enrollment modal — per-document approve / reject / release.
 */

import { initFilePreviewTriggers } from "./file-upload-preview.js";
import {
  renderLearnerProfileModalBody,
  updateEnrollmentDocReviewFooter,
} from "./registrar-enrollment-profile-view.js";
function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function initEnrollmentDocReview({ viewBodyEl, getItem, onReleased, onUpdated }) {
  const rejectModalEl = document.getElementById("doc-reject-reason-modal");
  const rejectTitleEl = document.getElementById("doc-reject-reason-title");
  const rejectInputEl = document.getElementById("doc-reject-reason-input");
  const rejectErrorEl = document.getElementById("doc-reject-reason-error");
  const rejectSubmitBtn = document.getElementById("doc-reject-reason-submit");
  const nextBtn = document.getElementById("view-enrollment-doc-next");

  const rejectModal = rejectModalEl ? bootstrap.Modal.getOrCreateInstance(rejectModalEl) : null;
  let pendingRejectKey = "";
  let pendingRejectTitle = "";
  let currentDetail = null;
  let actionInFlight = false;

  function applyDetail(detail) {
    currentDetail = detail;
    if (!viewBodyEl || !detail) return;
    viewBodyEl.innerHTML = renderLearnerProfileModalBody(detail);
    initFilePreviewTriggers(viewBodyEl);
    updateEnrollmentDocReviewFooter(detail);
  }

  async function postDocumentAction(action, extra = {}) {
    const item = getItem();
    if (!item) throw new Error("No enrollment record selected.");

    const body = new URLSearchParams();
    if (item.id != null) body.set("profile_id", String(item.id));
    if (item.registrationId) body.set("registration_id", item.registrationId);
    Object.entries(extra).forEach(([k, v]) => body.set(k, v));

    const res = await fetch(`/registrar/api/enrollment/document/${action}/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      credentials: "same-origin",
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function postHardCopiesAction(extra = {}) {
    const item = getItem();
    if (!item) throw new Error("No enrollment record selected.");

    const body = new URLSearchParams();
    if (item.id != null) body.set("profile_id", String(item.id));
    if (item.registrationId) body.set("registration_id", item.registrationId);
    Object.entries(extra).forEach(([k, v]) => body.set(k, v));

    const res = await fetch("/registrar/api/enrollment/hard-copies/update/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      credentials: "same-origin",
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  viewBodyEl?.addEventListener("change", (e) => {
    const cb = e.target.closest(".hard-copy-doc-check");
    if (!cb) return;
    const label = cb.closest(".registrar-hard-copies-item");
    const badge = label?.querySelector(".hard-copy-item-badge");
    if (badge) {
      if (cb.checked) {
        badge.className = "badge bg-success-subtle text-success border border-success-subtle text-2xs ms-2 hard-copy-item-badge";
        badge.textContent = "Received";
      } else {
        badge.className = "badge bg-secondary-subtle text-secondary text-2xs ms-2 hard-copy-item-badge";
        badge.textContent = "Pending";
      }
    }
  });

  viewBodyEl?.addEventListener("click", async (e) => {
    const toggleHardCopiesBtn = e.target.closest(".hard-copies-toggle-btn");
    const saveChecklistBtn = e.target.closest(".hard-copies-save-checklist-btn");

    if (toggleHardCopiesBtn) {
      if (actionInFlight) return;
      const isMark = toggleHardCopiesBtn.dataset.action === "mark";
      actionInFlight = true;
      const origHtml = toggleHardCopiesBtn.innerHTML;
      toggleHardCopiesBtn.disabled = true;
      toggleHardCopiesBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Updating...`;
      const scrollTop = viewBodyEl.scrollTop;
      try {
        const detail = await postHardCopiesAction({
          hard_copies_submitted: isMark ? "1" : "0",
        });
        applyDetail(detail);
        viewBodyEl.scrollTop = scrollTop;
        onUpdated?.(detail);
      } catch (err) {
        window.alert(err.message || "Could not update hard copies status.");
        toggleHardCopiesBtn.disabled = false;
        toggleHardCopiesBtn.innerHTML = origHtml;
      } finally {
        actionInFlight = false;
      }
      return;
    }

    if (saveChecklistBtn) {
      if (actionInFlight) return;
      actionInFlight = true;
      const origHtml = saveChecklistBtn.innerHTML;
      saveChecklistBtn.disabled = true;
      saveChecklistBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Saving...`;
      const scrollTop = viewBodyEl.scrollTop;
      try {
        const checks = {};
        viewBodyEl.querySelectorAll(".hard-copy-doc-check").forEach((cb) => {
          checks[cb.dataset.key] = cb.checked;
        });
        const notes = (viewBodyEl.querySelector(".hard-copies-notes-input")?.value || "").trim();
        const hasRequiredChecked = ["birth_certificate", "valid_id", "photo_2x2"].every((k) => checks[k]);

        const detail = await postHardCopiesAction({
          hard_copies_submitted: hasRequiredChecked ? "1" : "0",
          notes: notes,
          documents: JSON.stringify(checks),
        });
        applyDetail(detail);
        viewBodyEl.scrollTop = scrollTop;
        const newSaveBtn = viewBodyEl.querySelector(".hard-copies-save-checklist-btn");
        if (newSaveBtn) {
          newSaveBtn.className = "btn btn-sm btn-outline-success hard-copies-save-checklist-btn";
          newSaveBtn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>Saved!`;
          setTimeout(() => {
            if (newSaveBtn) {
              newSaveBtn.className = "btn btn-sm btn-outline-secondary hard-copies-save-checklist-btn";
              newSaveBtn.innerHTML = origHtml;
            }
          }, 2000);
        }
        onUpdated?.(detail);
      } catch (err) {
        window.alert(err.message || "Could not save checklist.");
        saveChecklistBtn.disabled = false;
        saveChecklistBtn.innerHTML = origHtml;
      } finally {
        actionInFlight = false;
      }
      return;
    }

    const approveBtn = e.target.closest(".doc-review-approve-btn");
    const rejectBtn = e.target.closest(".doc-review-reject-btn");
    if (!approveBtn && !rejectBtn) return;
    if (actionInFlight) return;

    if (rejectBtn) {
      pendingRejectKey = rejectBtn.dataset.docKey || "";
      pendingRejectTitle = rejectBtn.dataset.docTitle || "Document";
      if (rejectTitleEl) {
        rejectTitleEl.textContent = `Rejecting: ${pendingRejectTitle}`;
      }
      if (rejectInputEl) rejectInputEl.value = "";
      if (rejectErrorEl) rejectErrorEl.classList.add("d-none");
      rejectModal?.show();
      return;
    }

    const documentKey = approveBtn?.dataset.docKey;
    if (!documentKey) return;

    actionInFlight = true;
    approveBtn.disabled = true;
    try {
      const detail = await postDocumentAction("approve", { document_key: documentKey });
      applyDetail(detail);
    } catch (err) {
      window.alert(err.message || "Could not approve document.");
    } finally {
      actionInFlight = false;
    }
  });

  rejectSubmitBtn?.addEventListener("click", async () => {
    const reason = (rejectInputEl?.value || "").trim();
    if (!reason) {
      if (rejectErrorEl) {
        rejectErrorEl.textContent = "Please enter a reason for rejection.";
        rejectErrorEl.classList.remove("d-none");
      }
      rejectInputEl?.focus();
      return;
    }
    if (rejectErrorEl) rejectErrorEl.classList.add("d-none");
    if (actionInFlight) return;

    actionInFlight = true;
    rejectSubmitBtn.disabled = true;
    try {
      const detail = await postDocumentAction("reject", {
        document_key: pendingRejectKey,
        reason,
      });
      applyDetail(detail);
      rejectModal?.hide();
    } catch (err) {
      if (rejectErrorEl) {
        rejectErrorEl.textContent = err.message || "Could not reject document.";
        rejectErrorEl.classList.remove("d-none");
      }
    } finally {
      actionInFlight = false;
      rejectSubmitBtn.disabled = false;
    }
  });

  nextBtn?.addEventListener("click", async () => {
    if (actionInFlight || nextBtn.disabled) return;
    actionInFlight = true;
    nextBtn.disabled = true;
    try {
      const detail = await postDocumentAction("release");
      applyDetail(detail);
      onReleased?.(detail);
    } catch (err) {
      window.alert(err.message || "Could not continue.");
      updateEnrollmentDocReviewFooter(currentDetail);
    } finally {
      actionInFlight = false;
      if (currentDetail && !currentDetail.documentsReviewReleased) {
        nextBtn.disabled = !currentDetail.allDocumentsApproved;
      }
    }
  });

  return {
    onDetailLoaded(detail) {
      currentDetail = detail;
      updateEnrollmentDocReviewFooter(detail);
    },
  };
}
