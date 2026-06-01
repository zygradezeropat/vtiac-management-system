/**
 * Registrar — trainer account approval (database-backed).
 */

import {
  buildTrainerDetails,
  escapeHtml,
  initStudentViewModal,
  renderTrainerApprovalDetailBody,
} from "./registrar-student-detail.js";

function loadTrainerApprovalData() {
  const el = document.getElementById("trainer-approval-data");
  if (!el?.textContent) return [];
  try {
    const data = JSON.parse(el.textContent);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function documentsBadge(item) {
  const isComplete = item.documentsStatus === "complete";
  const cls = isComplete ? "registrar-enrollment-payment--full" : "registrar-enrollment-payment--partial";
  const label = isComplete ? "Documents: Complete" : "Documents: Incomplete";
  return `<span class="badge registrar-enrollment-payment ${cls}">${escapeHtml(label)}</span>`;
}

function accountTypeBadge(item) {
  if (!item.accountType) return "";
  const cls = item.accountTypeBadgeClass || "registrar-enrollment-scholarship";
  return `<span class="badge ${cls}">${escapeHtml(item.accountType)}</span>`;
}

function documentsExtraLines(item) {
  if (item.documentsStatus === "complete" || !item.missingDocuments?.length) return "";
  return `<p class="registrar-enrollment-card__deadline mb-0"><strong>Missing:</strong> ${escapeHtml(item.missingDocuments.join(", "))}</p>`;
}

function specializationsLine(item) {
  const specs = Array.isArray(item.specializations) ? item.specializations.join(", ") : item.specializations;
  return escapeHtml(specs);
}

function buildTrainerViewDetail(item) {
  const trainerDetail = buildTrainerDetails(item);
  return { item, trainerDetail };
}

document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("trainer-approval-list");
  const countEl = document.getElementById("trainer-approval-count");
  const searchEl = document.getElementById("trainer-approval-search");
  const emptyEl = document.getElementById("trainer-approval-empty");
  const confirmModalEl = document.getElementById("trainer-approval-confirm-modal");
  const confirmTitleEl = document.getElementById("trainer-approval-confirm-title");
  const confirmBodyEl = document.getElementById("trainer-approval-confirm-body");
  const confirmActionBtn = document.getElementById("trainer-approval-confirm-action");

  if (!listEl) return;

  const approveUrl = listEl.dataset.approveUrl || "";
  const rejectUrl = listEl.dataset.rejectUrl || "";
  let pending = loadTrainerApprovalData();
  let searchQuery = "";
  let pendingAction = null;
  let actionInFlight = false;

  const viewModal = initStudentViewModal(document.getElementById("view-trainer-approval-modal"), {
    nameSelector: "#view-trainer-approval-name",
    metaSelector: "#view-trainer-approval-meta",
    bodySelector: "#view-trainer-approval-body",
  });

  const confirmModal = confirmModalEl ? bootstrap.Modal.getOrCreateInstance(confirmModalEl) : null;

  function filtered() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pending;
    return pending.filter((p) => {
      const specs = Array.isArray(p.specializations) ? p.specializations.join(" ") : p.specializations || "";
      return (
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        specs.toLowerCase().includes(q) ||
        (p.accountType && p.accountType.toLowerCase().includes(q))
      );
    });
  }

  function updateCount() {
    if (countEl) countEl.textContent = String(pending.length);
  }

  function renderCard(item) {
    const badges = `${accountTypeBadge(item)}${documentsBadge(item)}`;
    return `
      <article class="registrar-enrollment-card" data-id="${item.id}">
        <div class="registrar-enrollment-card__main">
          <div class="registrar-enrollment-card__info">
            <h3 class="registrar-enrollment-card__name">${escapeHtml(item.name)}</h3>
            <p class="registrar-enrollment-card__email mb-2">${escapeHtml(item.email)}</p>
            <p class="registrar-enrollment-card__course mb-2"><strong>Specializations:</strong> ${specializationsLine(item)}</p>
            <div class="registrar-enrollment-card__badges d-flex flex-wrap gap-2 align-items-center">
              ${badges}
            </div>
            ${documentsExtraLines(item)}
          </div>
          <div class="registrar-enrollment-card__aside">
            <div class="registrar-enrollment-card__actions">
              <button type="button" class="btn btn-outline-secondary btn-sm trainer-approval-view-btn" data-id="${item.id}">
                <i class="bi bi-eye me-1" aria-hidden="true"></i>View
              </button>
              <button type="button" class="btn btn-success btn-sm trainer-approval-approve-btn" data-id="${item.id}">
                <i class="bi bi-check-lg me-1" aria-hidden="true"></i>Approve Account
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm trainer-approval-reject-btn" data-id="${item.id}">
                <i class="bi bi-x-lg me-1" aria-hidden="true"></i>Reject
              </button>
            </div>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const rows = filtered();
    updateCount();

    if (rows.length === 0) {
      listEl.innerHTML = "";
      listEl.classList.add("d-none");
      emptyEl?.classList.remove("d-none");
      return;
    }

    listEl.classList.remove("d-none");
    emptyEl?.classList.add("d-none");
    listEl.innerHTML = rows.map(renderCard).join("");
  }

  function findById(id) {
    return pending.find((p) => String(p.id) === String(id));
  }

  function removeById(id) {
    pending = pending.filter((p) => String(p.id) !== String(id));
    render();
  }

  function openView(item) {
    const { trainerDetail } = buildTrainerViewDetail(item);
    const bodyHtml = renderTrainerApprovalDetailBody(item, trainerDetail);
    const docLabel = item.documentsStatus === "complete" ? "Documents complete" : "Documents incomplete";
    viewModal.open(
      {
        name: item.name,
        metaHtml: `${escapeHtml(trainerDetail.trainerId)} · <span class="badge bg-success-subtle text-success">${escapeHtml(docLabel)}</span> · <span class="badge bg-warning-subtle text-warning">Pending account</span>`,
      },
      bodyHtml
    );
  }

  function openConfirm(action, item) {
    pendingAction = { action, item };
    const isApprove = action === "approve";
    if (confirmTitleEl) {
      confirmTitleEl.textContent = isApprove ? "Approve trainer account?" : "Reject trainer account?";
    }
    if (confirmBodyEl) {
      const specs = Array.isArray(item.specializations) ? item.specializations.join(", ") : item.specializations;
      confirmBodyEl.textContent = isApprove
        ? `Activate portal access for ${item.name} (${specs})? This will create a trainer account.`
        : `Reject trainer account for ${item.name}?`;
    }
    if (confirmActionBtn) {
      confirmActionBtn.textContent = isApprove ? "Approve Account" : "Reject";
      confirmActionBtn.className = isApprove ? "btn btn-success px-4" : "btn btn-danger px-4";
    }
    confirmModal?.show();
  }

  listEl.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".trainer-approval-view-btn");
    const approveBtn = e.target.closest(".trainer-approval-approve-btn");
    const rejectBtn = e.target.closest(".trainer-approval-reject-btn");

    if (viewBtn) {
      const item = findById(viewBtn.dataset.id);
      if (item) openView(item);
      return;
    }
    if (approveBtn) {
      const item = findById(approveBtn.dataset.id);
      if (item) openConfirm("approve", item);
      return;
    }
    if (rejectBtn) {
      const item = findById(rejectBtn.dataset.id);
      if (item) openConfirm("reject", item);
    }
  });

  confirmActionBtn?.addEventListener("click", () => {
    if (!pendingAction || actionInFlight) return;

    const actionUrl = pendingAction.action === "approve" ? approveUrl : rejectUrl;
    if (!actionUrl) return;

    actionInFlight = true;
    const originalText = confirmActionBtn.textContent;
    confirmActionBtn.disabled = true;
    confirmActionBtn.textContent = "Processing...";

    const formData = new FormData();
    formData.set("request_id", String(pendingAction.item.id));

    fetch(actionUrl, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        "X-Requested-With": "XMLHttpRequest",
      },
      credentials: "same-origin",
      body: formData,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Could not process trainer account.");
        }
        removeById(pendingAction.item.id);
        if (typeof data.pending_count === "number" && countEl) {
          countEl.textContent = String(data.pending_count);
        }
        confirmModal?.hide();
        pendingAction = null;
      })
      .catch((err) => {
        if (confirmBodyEl) {
          confirmBodyEl.textContent = err.message || "Could not process trainer account.";
        }
      })
      .finally(() => {
        actionInFlight = false;
        confirmActionBtn.disabled = false;
        confirmActionBtn.textContent = originalText;
      });
  });

  searchEl?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });

  render();
});
