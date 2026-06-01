/**
 * Registrar — pending enrollment approval (database-backed, tabbed).
 */

import { escapeHtml, initStudentViewModal } from "./registrar-student-detail.js";
import { initEnrollmentDocReview } from "./registrar-enrollment-doc-review.js";
import {
  renderLearnerProfileModalBody,
  updateEnrollmentDocReviewFooter,
} from "./registrar-enrollment-profile-view.js";
import { initFilePreviewTriggers } from "./file-upload-preview.js";

const ENROLLMENT_TABS = [
  { key: "training", label: "Training with Assessment" },
  { key: "assessment", label: "Assessment Only Clients" },
];
const PAGE_SIZE = 5;

function loadPendingEnrollmentsData() {
  const el = document.getElementById("pending-enrollments-data");
  if (!el?.textContent) {
    return {
      totalCount: 0,
      modules: ENROLLMENT_TABS.map((t) => ({
        key: t.key,
        title: t.label,
        badgeLabel: "0 pending",
        items: [],
      })),
    };
  }
  try {
    const data = JSON.parse(el.textContent);
    if (Array.isArray(data)) {
      return {
        totalCount: data.length,
        modules: [
          { key: "training", title: "Training with Assessment", badgeLabel: `${data.length} pending`, items: data },
          { key: "assessment", title: "Assessment Only Clients", badgeLabel: "0 pending", items: [] },
        ],
      };
    }
    return data;
  } catch {
    return { totalCount: 0, modules: [] };
  }
}

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function neededBadge(item) {
  const cls = item.neededBadgeClass || "registrar-enrollment-status--profile";
  const label = item.neededLabel || "In progress";
  return `<span class="badge registrar-enrollment-status ${cls}">${escapeHtml(label)}</span>`;
}

function scholarshipBadge(item) {
  if (!item.scholarship || item.scholarship === "Regular") return "";
  const cls = item.scholarshipBadgeClass || "registrar-enrollment-scholarship";
  return `<span class="badge ${cls}">${escapeHtml(item.scholarship)}</span>`;
}

function paymentExtraLines(item) {
  if (item.paymentStatus === "unpaid" || item.neededKey === "payment_unpaid") return "";
  if (item.paymentStatus !== "partial") return "";
  return `
    <p class="registrar-enrollment-card__payment-detail mb-0">
      Paid: ₱${Number(item.paidAmount).toLocaleString("en-PH")} / ₱${Number(item.totalAmount).toLocaleString("en-PH")}
    </p>
    ${item.paymentDeadline ? `<p class="registrar-enrollment-card__deadline mb-0"><strong>Deadline:</strong> ${escapeHtml(item.paymentDeadline)}</p>` : ""}`;
}

function itemKey(item) {
  return item.id != null ? `p-${item.id}` : `r-${item.registrationId}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const serverData = loadPendingEnrollmentsData();
  const MODULE_DATA = serverData.modules || [];
  let totalPending = serverData.totalCount ?? 0;

  const tabsEl = document.getElementById("enrollment-tabs");
  const tabTitleEl = document.getElementById("enrollment-tab-title");
  const tabBadgeEl = document.getElementById("enrollment-tab-badge");
  const listEl = document.getElementById("enrollment-list");
  const paginationEl = document.createElement("div");
  paginationEl.id = "enrollment-pagination";
  paginationEl.className = "d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3";
  listEl?.insertAdjacentElement("afterend", paginationEl);
  const countEl = document.getElementById("enrollment-count");
  const searchEl = document.getElementById("enrollment-search");
  const emptyEl = document.getElementById("enrollment-empty");
  const confirmModalEl = document.getElementById("enrollment-confirm-modal");
  const confirmTitleEl = document.getElementById("enrollment-confirm-title");
  const confirmBodyEl = document.getElementById("enrollment-confirm-body");
  const confirmActionBtn = document.getElementById("enrollment-confirm-action");

  if (!listEl) return;

  let activeTab = "training";
  const searchQueries = { training: "", assessment: "" };
  const pageByTab = { training: 1, assessment: 1 };
  let pendingAction = null;
  let actionInFlight = false;

  const viewModal = initStudentViewModal(document.getElementById("view-enrollment-modal"), {
    nameSelector: "#view-enrollment-name",
    metaSelector: "#view-enrollment-meta",
    bodySelector: "#view-enrollment-body",
  });

  const viewBodyEl = document.getElementById("view-enrollment-body");
  const confirmModal = confirmModalEl ? bootstrap.Modal.getOrCreateInstance(confirmModalEl) : null;
  let viewContextItem = null;

  const docReview = initEnrollmentDocReview({
    viewBodyEl,
    getItem: () => viewContextItem,
    onReleased(detail) {
      if (viewContextItem) {
        viewContextItem.neededLabel = "Payment: Unpaid";
        viewContextItem.neededKey = "payment_unpaid";
        viewContextItem.neededBadgeClass = "registrar-enrollment-status--unpaid";
      }
      updateEnrollmentDocReviewFooter(detail);
      render();
    },
  });

  function getModule(key) {
    return (
      MODULE_DATA.find((m) => m.key === key) || {
        key,
        title: key,
        badgeLabel: "0 pending",
        items: [],
      }
    );
  }

  function getActiveItems() {
    return getModule(activeTab).items || [];
  }

  function findByKey(key) {
    for (const mod of MODULE_DATA) {
      const item = (mod.items || []).find((p) => itemKey(p) === key);
      if (item) return item;
    }
    return null;
  }

  function removeByKey(key) {
    for (const mod of MODULE_DATA) {
      const before = mod.items?.length ?? 0;
      mod.items = (mod.items || []).filter((p) => itemKey(p) !== key);
      if ((mod.items?.length ?? 0) < before) break;
    }
    totalPending = MODULE_DATA.reduce((n, m) => n + (m.items?.length ?? 0), 0);
    updateHeaderCount();
    render();
  }

  function updateHeaderCount() {
    if (countEl) countEl.textContent = String(totalPending);
  }

  function filteredItems() {
    const q = (searchQueries[activeTab] || "").trim().toLowerCase();
    const items = getActiveItems();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }

  function totalPages(rows) {
    return Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  }

  function pagedItems(rows) {
    const pages = totalPages(rows);
    const current = Math.min(pageByTab[activeTab] || 1, pages);
    pageByTab[activeTab] = current;
    const start = (current - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }

  async function openLearnerProfileView(item) {
    viewContextItem = item;
    const params = new URLSearchParams();
    if (item.id != null) params.set("profile_id", String(item.id));
    else if (item.registrationId) params.set("registration_id", item.registrationId);

    updateEnrollmentDocReviewFooter(null);
    const nextBtn = document.getElementById("view-enrollment-doc-next");
    if (nextBtn) nextBtn.classList.add("d-none");

    viewModal.open(
      { name: item.name, status: item.neededLabel || "Pending", metaHtml: "Loading learner profile…" },
      `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Loading learner profile…</div>`
    );

    try {
      const res = await fetch(`/registrar/api/enrollment/detail/?${params}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const detail = await res.json();
      if (!res.ok) throw new Error(detail.error || "Could not load profile.");
      const metaHtml = `${escapeHtml(detail.referenceId || item.referenceId || "—")} · ${escapeHtml(detail.program || item.program)} · <span class="badge bg-light text-dark border">${escapeHtml(item.neededLabel || "")}</span>`;
      viewModal.open(
        { name: detail.name || item.name, status: item.neededLabel, metaHtml },
        renderLearnerProfileModalBody(detail)
      );
      initFilePreviewTriggers(viewBodyEl);
      docReview.onDetailLoaded(detail);
    } catch (err) {
      if (viewBodyEl) {
        viewBodyEl.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(err.message || "Failed to load profile.")}</div>`;
      }
    }
  }

  function renderCard(item) {
    const key = itemKey(item);
    const approveDisabled = !item.canApprove;
    const approveTitle = approveDisabled
      ? "Available when learner profile, requirements, and payment proof are complete."
      : "";
    const badges = `${scholarshipBadge(item)}${neededBadge(item)}`;

    return `
      <article class="registrar-enrollment-card" data-key="${escapeHtml(key)}">
        <div class="registrar-enrollment-card__main">
          <div class="registrar-enrollment-card__info">
            <h3 class="registrar-enrollment-card__name">${escapeHtml(item.name)}</h3>
            <p class="registrar-enrollment-card__email mb-2">${escapeHtml(item.email)}</p>
            <p class="registrar-enrollment-card__course mb-2"><strong>Course:</strong> ${escapeHtml(item.program)}</p>
            <div class="registrar-enrollment-card__badges d-flex flex-wrap gap-2 align-items-center">
              ${badges}
            </div>
            ${paymentExtraLines(item)}
          </div>
          <div class="registrar-enrollment-card__aside">
            <div class="registrar-enrollment-card__actions">
              <button type="button" class="btn btn-outline-secondary btn-sm enrollment-view-btn" data-key="${escapeHtml(key)}">
                <i class="bi bi-eye me-1" aria-hidden="true"></i>View
              </button>
              <button type="button" class="btn btn-success btn-sm enrollment-approve-btn" data-key="${escapeHtml(key)}"${approveDisabled ? " disabled" : ""} title="${escapeHtml(approveTitle)}">
                <i class="bi bi-check-lg me-1" aria-hidden="true"></i>Approve Enrollment
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm enrollment-reject-btn" data-key="${escapeHtml(key)}">
                <i class="bi bi-x-lg me-1" aria-hidden="true"></i>Reject
              </button>
            </div>
          </div>
        </div>
      </article>`;
  }

  function renderTabs() {
    if (!tabsEl) return;
    tabsEl.innerHTML = "";
    ENROLLMENT_TABS.forEach((tab) => {
      const mod = getModule(tab.key);
      const count = mod.items?.length ?? 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "module-tab-btn btn btn-sm border-0" + (tab.key === activeTab ? " active" : "");
      btn.textContent = tab.label;
      if (count > 0) {
        const badge = document.createElement("span");
        badge.className = "badge rounded-pill bg-danger ms-2";
        badge.style.fontSize = "0.65rem";
        badge.textContent = String(count);
        btn.appendChild(badge);
      }
      btn.addEventListener("click", () => {
        activeTab = tab.key;
        if (searchEl) searchEl.value = searchQueries[activeTab] || "";
        renderTabs();
        render();
      });
      tabsEl.appendChild(btn);
    });
  }

  function refreshModuleBadges() {
    MODULE_DATA.forEach((mod) => {
      const count = mod.items?.length ?? 0;
      mod.badgeLabel = `${count} pending`;
    });
  }

  function render() {
    refreshModuleBadges();
    const mod = getModule(activeTab);
    const rows = filteredItems();
    const pages = totalPages(rows);
    const current = Math.min(pageByTab[activeTab] || 1, pages);
    pageByTab[activeTab] = current;
    const pageRows = pagedItems(rows);

    if (tabTitleEl) tabTitleEl.textContent = mod.title;
    if (tabBadgeEl) tabBadgeEl.textContent = mod.badgeLabel;

    if (rows.length === 0) {
      listEl.innerHTML = "";
      listEl.classList.add("d-none");
      emptyEl?.classList.remove("d-none");
      paginationEl.innerHTML = "";
      paginationEl.classList.add("d-none");
      return;
    }

    listEl.classList.remove("d-none");
    emptyEl?.classList.add("d-none");
    listEl.innerHTML = pageRows.map(renderCard).join("");

    if (pages <= 1) {
      paginationEl.innerHTML = "";
      paginationEl.classList.add("d-none");
      return;
    }

    paginationEl.classList.remove("d-none");
    const prevDisabled = current <= 1 ? "disabled" : "";
    const nextDisabled = current >= pages ? "disabled" : "";
    const pageButtons = Array.from({ length: pages }, (_, i) => i + 1)
      .map(
        (n) =>
          `<button type="button" class="btn btn-sm ${n === current ? "btn-vtiac btn-primary" : "btn-outline-secondary"} enrollment-page-btn" data-page="${n}">${n}</button>`
      )
      .join("");
    paginationEl.innerHTML = `
      <small class="text-muted">Showing ${(current - 1) * PAGE_SIZE + 1}-${Math.min(current * PAGE_SIZE, rows.length)} of ${rows.length}</small>
      <div class="d-flex flex-wrap gap-1">
        <button type="button" class="btn btn-sm btn-outline-secondary enrollment-page-prev" ${prevDisabled}>Prev</button>
        ${pageButtons}
        <button type="button" class="btn btn-sm btn-outline-secondary enrollment-page-next" ${nextDisabled}>Next</button>
      </div>
    `;
  }

  function openConfirm(action, item) {
    pendingAction = { action, item };
    const isApprove = action === "approve";
    if (confirmTitleEl) {
      confirmTitleEl.textContent = isApprove ? "Approve enrollment?" : "Reject enrollment?";
    }
    if (confirmBodyEl) {
      if (isApprove && !item.canApprove) {
        confirmBodyEl.textContent = `${item.name} still needs: ${item.neededLabel}. Approval is only available when payment proof is on file.`;
      } else {
        confirmBodyEl.textContent = isApprove
          ? `Enroll ${item.name} in ${item.program}?`
          : `Reject enrollment for ${item.name}? Their application status will be marked as not approved.`;
      }
    }
    if (confirmActionBtn) {
      confirmActionBtn.textContent = isApprove ? "Approve Enrollment" : "Reject";
      confirmActionBtn.className = isApprove ? "btn btn-success px-4" : "btn btn-danger px-4";
      confirmActionBtn.disabled = isApprove && !item.canApprove;
    }
    confirmModal?.show();
  }

  async function submitAction(action, item) {
    const url = `/registrar/api/enrollment/${action}/`;
    const body = new URLSearchParams();
    if (item.id != null) body.set("profile_id", String(item.id));
    if (item.registrationId) body.set("registration_id", item.registrationId);

    const res = await fetch(url, {
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
    if (!res.ok) throw new Error(data.error || "Request failed. Please try again.");
    if (typeof data.pending_count === "number") {
      totalPending = data.pending_count;
      updateHeaderCount();
    }
    return data;
  }

  listEl.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".enrollment-view-btn");
    const approveBtn = e.target.closest(".enrollment-approve-btn");
    const rejectBtn = e.target.closest(".enrollment-reject-btn");

    if (viewBtn) {
      const item = findByKey(viewBtn.dataset.key);
      if (item) openLearnerProfileView(item);
      return;
    }
    if (approveBtn && !approveBtn.disabled) {
      const item = findByKey(approveBtn.dataset.key);
      if (item) openConfirm("approve", item);
      return;
    }
    if (rejectBtn) {
      const item = findByKey(rejectBtn.dataset.key);
      if (item) openConfirm("reject", item);
    }
  });

  confirmActionBtn?.addEventListener("click", async () => {
    if (!pendingAction || actionInFlight) return;
    const { action, item } = pendingAction;
    if (action === "approve" && !item.canApprove) return;

    actionInFlight = true;
    confirmActionBtn.disabled = true;

    try {
      await submitAction(action, item);
      removeByKey(itemKey(item));
      confirmModal?.hide();
      pendingAction = null;
      renderTabs();
    } catch (err) {
      if (confirmBodyEl) {
        confirmBodyEl.textContent = err.message || "Something went wrong.";
      }
    } finally {
      actionInFlight = false;
      if (confirmActionBtn) confirmActionBtn.disabled = false;
    }
  });

  searchEl?.addEventListener("input", (e) => {
    searchQueries[activeTab] = e.target.value;
    pageByTab[activeTab] = 1;
    render();
  });

  paginationEl.addEventListener("click", (e) => {
    const prevBtn = e.target.closest(".enrollment-page-prev");
    const nextBtn = e.target.closest(".enrollment-page-next");
    const pageBtn = e.target.closest(".enrollment-page-btn");
    const pages = totalPages(filteredItems());
    const current = pageByTab[activeTab] || 1;

    if (prevBtn && current > 1) {
      pageByTab[activeTab] = current - 1;
      render();
      return;
    }
    if (nextBtn && current < pages) {
      pageByTab[activeTab] = current + 1;
      render();
      return;
    }
    if (pageBtn) {
      const page = Number(pageBtn.dataset.page || "1");
      if (page >= 1 && page <= pages) {
        pageByTab[activeTab] = page;
        render();
      }
    }
  });

  updateHeaderCount();
  renderTabs();
  render();
});
