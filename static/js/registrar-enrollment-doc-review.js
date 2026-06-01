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

export function initEnrollmentDocReview({ viewBodyEl, getItem, onReleased }) {
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

  viewBodyEl?.addEventListener("click", async (e) => {
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
