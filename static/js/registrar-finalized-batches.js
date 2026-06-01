/**
 * Registrar — batch repository (draft + finalized) from saved schedule templates.
 */

import { showFinalizeBatchConfirm } from "./registrar-batch-finalize-modal.js";
import { escapeHtml, scheduleLabel } from "./registrar-batch-store.js";

const BATCHING_URL = "/registrar/batching-scheduling/";

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function fetchBatches() {
  const res = await fetch("/registrar/api/batching/batches/", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load batches.");
  return Array.isArray(data.batches) ? data.batches : [];
}

async function finalizeBatch(id) {
  const res = await fetch(`/registrar/api/batching/template/finalize/${encodeURIComponent(id)}/`, {
    method: "POST",
    headers: {
      "X-CSRFToken": getCsrfToken(),
      Accept: "application/json",
    },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not finalize batch.");
  return data.batch;
}

document.addEventListener("DOMContentLoaded", () => {
  const statsEl = document.getElementById("finalized-stats");
  const listEl = document.getElementById("finalized-list");
  const emptyEl = document.getElementById("finalized-empty");
  const searchEl = document.getElementById("finalized-search");
  const courseFilterEl = document.getElementById("finalized-course-filter");
  const statusFilterEl = document.getElementById("finalized-status-filter");
  const countEl = document.getElementById("finalized-count");
  const modalEl = document.getElementById("finalized-detail-modal");
  const modalBodyEl = document.getElementById("finalized-detail-body");
  const modalTitleEl = document.getElementById("finalized-detail-title");
  const modalMetaEl = document.getElementById("finalized-detail-meta");
  const modalFooterEl = document.getElementById("finalized-detail-footer");

  const modal = modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;

  let allBatches = [];
  let searchQuery = "";
  let courseFilter = "";
  let statusFilter = "";

  function filteredBatches() {
    const q = searchQuery.trim().toLowerCase();
    return allBatches.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (courseFilter && b.courseName !== courseFilter) return false;
      if (!q) return true;
      return (
        b.courseName.toLowerCase().includes(q) ||
        b.batchLabel.toLowerCase().includes(q) ||
        (b.trainer || "").toLowerCase().includes(q) ||
        (b.name || "").toLowerCase().includes(q) ||
        b.students.some(
          (s) =>
            s.lastName.toLowerCase().includes(q) ||
            s.firstName.toLowerCase().includes(q)
        )
      );
    });
  }

  function populateCourseFilter() {
    if (!courseFilterEl) return;
    const courses = [...new Set(allBatches.map((b) => b.courseName))].sort();
    courseFilterEl.innerHTML =
      '<option value="">All courses</option>' +
      courses.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    courseFilterEl.value = courseFilter;
  }

  function renderStats(batches) {
    if (!statsEl) return;
    const finalized = batches.filter((b) => b.status === "finalized");
    const drafts = batches.filter((b) => b.status === "draft");
    const students = batches.reduce((n, b) => n + b.studentCount, 0);
    const courses = new Set(batches.map((b) => b.courseName)).size;

    statsEl.innerHTML = `
      <div class="col-sm-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${batches.length}</span>
          <span class="registrar-finalized-stat__label">Total batches</span>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${drafts.length}</span>
          <span class="registrar-finalized-stat__label">Draft (editable)</span>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${finalized.length}</span>
          <span class="registrar-finalized-stat__label">Finalized (locked)</span>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${students}</span>
          <span class="registrar-finalized-stat__label">Students</span>
        </div>
      </div>`;
  }

  function editUrl(batch) {
    const params = new URLSearchParams({
      course: batch.courseId,
      template: batch.id,
    });
    return `${BATCHING_URL}?${params.toString()}`;
  }

  function renderCard(batch) {
    const isFinal = batch.status === "finalized";
    const badge = isFinal
      ? `<div class="registrar-finalized-card__badge"><i class="bi bi-trophy-fill" aria-hidden="true"></i> Finalized</div>`
      : `<div class="registrar-finalized-card__badge registrar-finalized-card__badge--draft"><i class="bi bi-pencil-square" aria-hidden="true"></i> Draft</div>`;

    const when = isFinal
      ? `<p class="registrar-finalized-card__when small text-muted mb-3">Finalized ${escapeHtml(formatDateTime(batch.finalizedAt))}</p>`
      : `<p class="registrar-finalized-card__when small text-muted mb-3">Saved ${escapeHtml(formatDateTime(batch.finalizedAt || batch.updatedAt || ""))} · not locked yet</p>`;

    const actions = isFinal
      ? `<button type="button" class="btn btn-outline-primary btn-sm finalized-view-btn" data-id="${escapeHtml(batch.id)}">
          <i class="bi bi-eye me-1" aria-hidden="true"></i>View details
        </button>`
      : `<div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-primary btn-sm finalized-view-btn" data-id="${escapeHtml(batch.id)}">View</button>
          <a href="${editUrl(batch)}" class="btn btn-outline-secondary btn-sm">Edit</a>
          <button type="button" class="btn btn-success btn-sm finalized-finalize-btn" data-id="${escapeHtml(batch.id)}">Finalize</button>
        </div>`;

    return `
      <article class="registrar-finalized-card${isFinal ? "" : " registrar-finalized-card--draft"}">
        ${badge}
        <h3 class="registrar-finalized-card__course">${escapeHtml(batch.courseName)}</h3>
        <p class="registrar-finalized-card__batch mb-1">${escapeHtml(batch.batchLabel)}</p>
        ${batch.name ? `<p class="small text-muted mb-2">${escapeHtml(batch.name)}</p>` : ""}
        <ul class="registrar-finalized-card__meta list-unstyled mb-3">
          <li><i class="bi bi-calendar-range me-2" aria-hidden="true"></i>${formatDate(batch.startDate)} – ${formatDate(batch.endDate)}</li>
          <li><i class="bi bi-clock me-2" aria-hidden="true"></i>${escapeHtml(scheduleLabel(batch.schedule))}</li>
          <li><i class="bi bi-person-badge me-2" aria-hidden="true"></i>${escapeHtml(batch.trainer || "—")}</li>
          <li><i class="bi bi-people me-2" aria-hidden="true"></i>${batch.studentCount} student${batch.studentCount === 1 ? "" : "s"} · ${batch.durationDays} training days</li>
        </ul>
        ${when}
        ${actions}
      </article>`;
  }

  function openDetail(id) {
    const batch = allBatches.find((b) => b.id === id);
    if (!batch || !modal) return;

    const isFinal = batch.status === "finalized";
    if (modalTitleEl) modalTitleEl.textContent = `${batch.courseName} — ${batch.batchLabel}`;
    if (modalMetaEl) {
      modalMetaEl.textContent = isFinal
        ? `Finalized ${formatDateTime(batch.finalizedAt)} · read-only`
        : "Draft · you can edit or finalize from this page";
    }

    const studentRows = batch.students
      .map(
        (s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(s.lastName)}</td>
          <td>${escapeHtml(s.firstName)}</td>
          <td>${escapeHtml(s.program)}</td>
        </tr>`
      )
      .join("");

    if (modalBodyEl) {
      modalBodyEl.innerHTML = `
        <section class="registrar-student-detail__section">
          <h4 class="registrar-student-detail__heading"><i class="bi bi-journal-check" aria-hidden="true"></i> Batch summary</h4>
          <div class="registrar-student-detail__grid">
            <div class="registrar-student-detail__field"><label>Status</label><p>${isFinal ? "Finalized (locked)" : "Draft (editable)"}</p></div>
            <div class="registrar-student-detail__field"><label>Program</label><p>${escapeHtml(batch.courseName)}</p></div>
            <div class="registrar-student-detail__field"><label>Batch</label><p>${escapeHtml(batch.batchLabel)}</p></div>
            <div class="registrar-student-detail__field"><label>Class duration</label><p>${batch.durationDays} training day${batch.durationDays === 1 ? "" : "s"}</p></div>
            <div class="registrar-student-detail__field"><label>Trainer</label><p>${escapeHtml(batch.trainer || "—")}</p></div>
            <div class="registrar-student-detail__field"><label>Start date</label><p>${formatDate(batch.startDate)}</p></div>
            <div class="registrar-student-detail__field"><label>End date</label><p>${formatDate(batch.endDate)}</p></div>
            <div class="registrar-student-detail__field"><label>Schedule</label><p>${escapeHtml(scheduleLabel(batch.schedule))}</p></div>
            ${isFinal ? `<div class="registrar-student-detail__field"><label>Finalized on</label><p>${formatDateTime(batch.finalizedAt)}</p></div>` : ""}
          </div>
        </section>
        <section class="registrar-student-detail__section mb-0">
          <h4 class="registrar-student-detail__heading"><i class="bi bi-people-fill" aria-hidden="true"></i> Students (${batch.studentCount})</h4>
          <div class="table-responsive">
            <table class="table registrar-table registrar-batching-table mb-0">
              <thead><tr><th>#</th><th>Last Name</th><th>First Name</th><th>Program</th></tr></thead>
              <tbody>${studentRows || '<tr><td colspan="4" class="text-muted">No students</td></tr>'}</tbody>
            </table>
          </div>
        </section>`;
    }

    if (modalFooterEl) {
      modalFooterEl.innerHTML = isFinal
        ? `<button type="button" class="btn btn-outline-secondary px-4" data-bs-dismiss="modal">Close</button>`
        : `<button type="button" class="btn btn-outline-secondary px-4" data-bs-dismiss="modal">Close</button>
           <a href="${editUrl(batch)}" class="btn btn-outline-dark px-4">Edit schedule</a>
           <button type="button" class="btn btn-success px-4 finalized-finalize-btn" data-id="${escapeHtml(batch.id)}">Accept &amp; finalize</button>`;
    }

    modal.show();
  }

  function handleFinalize(id) {
    const batch = allBatches.find((b) => b.id === id);
    if (!batch || batch.status === "finalized") return;

    showFinalizeBatchConfirm(batch, async () => {
      const saved = await finalizeBatch(id);
      const idx = allBatches.findIndex((b) => b.id === id);
      if (idx >= 0) allBatches[idx] = saved;
      else allBatches.unshift(saved);
      modal?.hide();
      render();
    });
  }

  function render() {
    const batches = filteredBatches();
    const finalizedCount = allBatches.filter((b) => b.status === "finalized").length;
    if (countEl) countEl.textContent = String(finalizedCount);

    renderStats(filteredBatches());
    populateCourseFilter();

    if (batches.length === 0) {
      listEl.innerHTML = "";
      listEl.classList.add("d-none");
      emptyEl?.classList.remove("d-none");
      return;
    }

    listEl.classList.remove("d-none");
    emptyEl?.classList.add("d-none");
    listEl.innerHTML = `<div class="row g-3">${batches.map((b) => `<div class="col-md-6 col-xl-4">${renderCard(b)}</div>`).join("")}</div>`;
  }

  async function load() {
    try {
      allBatches = await fetchBatches();
      render();
    } catch (err) {
      if (emptyEl) {
        emptyEl.classList.remove("d-none");
        emptyEl.querySelector("p.text-muted") &&
          (emptyEl.querySelector("p.text-muted").textContent = err.message);
      }
      listEl?.classList.add("d-none");
    }
  }

  listEl?.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".finalized-view-btn");
    if (viewBtn) {
      openDetail(viewBtn.dataset.id);
      return;
    }
    const finBtn = e.target.closest(".finalized-finalize-btn");
    if (finBtn) handleFinalize(finBtn.dataset.id);
  });

  modalFooterEl?.addEventListener("click", (e) => {
    const finBtn = e.target.closest(".finalized-finalize-btn");
    if (finBtn) handleFinalize(finBtn.dataset.id);
  });

  searchEl?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });

  courseFilterEl?.addEventListener("change", (e) => {
    courseFilter = e.target.value;
    render();
  });

  statusFilterEl?.addEventListener("change", (e) => {
    statusFilter = e.target.value;
    render();
  });

  load();
});
