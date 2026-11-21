/**
 * Registrar — E.G.A.C.E table (enrollment + trainer grading milestones).
 */

import { escapeHtml } from "./registrar-student-detail.js";
import {
  getEgaceTableRows,
  patchEgaceRow,
  syncFromTrainerModule,
  subscribeTrainerEgaceSync,
} from "./trainer-egace-store.js";

const PAGE_SIZE = 10;

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function readEgaceConfig() {
  const el = document.getElementById("egace-config");
  if (!el?.textContent?.trim()) return {};
  try {
    return JSON.parse(el.textContent);
  } catch {
    return {};
  }
}

function initialsFromName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function milestoneCell(value) {
  const yes = Boolean(value);
  if (yes) {
    return `
      <td class="text-center">
        <span class="registrar-egace-milestone registrar-egace-milestone--yes">
          <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
          <span>Yes</span>
        </span>
      </td>`;
  }
  return `
    <td class="text-center">
      <span class="registrar-egace-milestone registrar-egace-milestone--no">
        <span class="registrar-egace-milestone__icon" aria-hidden="true"><i class="bi bi-x-lg"></i></span>
        <span>No</span>
      </span>
    </td>`;
}

function manualMilestoneCell(row, field, labelText) {
  const yes = Boolean(row[field]);
  const label = yes ? "Yes" : "No";
  const stateClass = yes
    ? "registrar-egace-milestone--yes"
    : "registrar-egace-milestone--no";
  const icon = yes
    ? '<i class="bi bi-check-circle-fill" aria-hidden="true"></i>'
    : '<span class="registrar-egace-milestone__icon" aria-hidden="true"><i class="bi bi-x-lg"></i></span>';

  return `
    <td class="text-center">
      <button
        type="button"
        class="registrar-egace-milestone registrar-egace-milestone--clickable ${stateClass}"
        data-manual-milestone="${escapeHtml(field)}"
        data-row-id="${escapeHtml(String(row.id))}"
        data-value="${yes ? "1" : "0"}"
        aria-label="${escapeHtml(labelText)}: ${label}. Click to change."
        title="Click to set ${escapeHtml(labelText.toLowerCase())} manually"
      >
        ${icon}
        <span>${label}</span>
      </button>
    </td>`;
}

function studentSubtitle(row, activeTab = "training") {
  if (activeTab === "assessment" && row.assessmentCourse) {
    const course = row.assessmentCourse;
    const batch = (row.assessmentBatchLabel || "").trim();
    if (batch && batch !== "Unassigned") {
      return `${course} · ${batch}`;
    }
    return course;
  }
  const course = row.course || "—";
  const batch = (row.batchLabel || "").trim();
  if (batch && batch !== "Unassigned") {
    return `${course} · ${batch}`;
  }
  return course;
}

function isAssessmentRow(row) {
  if (!row) return false;
  if (row.isAssessment === true) return true;
  const pType = String(row.programType || "").toLowerCase().trim();
  if (pType === "assessment_only" || pType === "assessment") {
    return true;
  }
  const course = String(row.course || "").toLowerCase();
  const batch = String(row.batchLabel || "").toLowerCase();
  if (batch.includes("national") || batch.includes("assessment") || course.includes("assessment")) {
    return true;
  }
  return false;
}

function isTrainingRow(row) {
  if (!row) return false;
  if (row.hasTraining !== undefined) return Boolean(row.hasTraining);
  const pType = String(row.programType || "").toLowerCase().trim();
  return pType !== "assessment_only";
}

function renderRow(row, activeTab = "training") {
  const initials = row.initials || initialsFromName(row.studentName);
  if (activeTab === "assessment") {
    return `
      <tr data-id="${row.id}">
        <td>
          <div class="registrar-egace-student">
            <span class="registrar-egace-student__avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <div class="registrar-egace-student__text">
              <span class="registrar-egace-student__name">${escapeHtml(row.studentName)}</span>
              <span class="registrar-egace-student__course">${escapeHtml(studentSubtitle(row, activeTab))}</span>
            </div>
          </div>
        </td>
        ${manualMilestoneCell(row, "graduate", "Graduate")}
        ${manualMilestoneCell(row, "certificate", "Certificate")}
      </tr>`;
  }

  return `
    <tr data-id="${row.id}">
      <td>
        <div class="registrar-egace-student">
          <span class="registrar-egace-student__avatar" aria-hidden="true">${escapeHtml(initials)}</span>
          <div class="registrar-egace-student__text">
            <span class="registrar-egace-student__name">${escapeHtml(row.studentName)}</span>
            <span class="registrar-egace-student__course">${escapeHtml(studentSubtitle(row, activeTab))}</span>
          </div>
        </div>
      </td>
      ${milestoneCell(row.enrolled)}
      ${milestoneCell(row.graduate)}
      ${milestoneCell(row.assessment)}
      ${milestoneCell(row.certificate)}
      ${manualMilestoneCell(row, "employment", "Employment")}
    </tr>`;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function batchOptionsForCourse(rows, course, activeTab = "training") {
  const isAss = activeTab === "assessment";
  const getCourse = (r) => (isAss ? (r.assessmentCourse || r.course) : r.course);
  const getBatchId = (r) =>
    isAss
      ? (r.assessmentBatchId || r.batchId || r.batchLabel || "")
      : (r.batchId || r.batchLabel || "");
  const getBatchLabel = (r) =>
    isAss
      ? (r.assessmentBatchLabel || r.batchLabel || "Unassigned")
      : (r.batchLabel || "Unassigned");

  const scoped = course ? rows.filter((row) => getCourse(row) === course) : rows;
  const byId = new Map();
  scoped.forEach((row) => {
    const id = getBatchId(row);
    const label = getBatchLabel(row);
    if (id && !byId.has(id)) {
      byId.set(id, label);
    }
  });
  return [...byId.entries()].sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { sensitivity: "base" })
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const seedEl = document.getElementById("trainer-egace-seed");
  const tbody = document.getElementById("egace-table-body");
  const countEl = document.getElementById("egace-row-count");
  const searchEl = document.getElementById("egace-search");
  const courseEl = document.getElementById("egace-course-filter");
  const batchEl = document.getElementById("egace-batch-filter");
  const emptyEl = document.getElementById("egace-empty");
  const paginationEl = document.getElementById("egace-pagination");
  const egaceConfig = readEgaceConfig();
  const employmentUrl = egaceConfig.employment_url || "";

  if (!tbody) return;

  let currentPage = 1;

  if (seedEl?.textContent?.trim()) {
    try {
      const seed = JSON.parse(seedEl.textContent);
      syncFromTrainerModule(seed);
    } catch {
      /* ignore bad seed */
    }
  }

  let searchQuery = "";
  let courseFilter = "";
  let batchFilter = "";
  let savingEmployment = false;

  const theadEl = document.getElementById("egace-table-head") || document.querySelector(".registrar-egace-table thead");
  const categoryTabsEl = document.getElementById("egace-category-tabs");
  let activeCategoryTab = "training";

  const urlParams = new URLSearchParams(window.location.search);
  const catParam = (urlParams.get("category") || "").toLowerCase();
  if (catParam === "assessment" || catParam === "national") {
    activeCategoryTab = "assessment";
  } else {
    activeCategoryTab = "training";
  }

  function renderCategoryTabs() {
    if (!categoryTabsEl) return;

    const allRows = getEgaceTableRows();
    const trainingCount = allRows.filter((r) => isTrainingRow(r)).length;
    const assessmentCount = allRows.filter((r) => isAssessmentRow(r)).length;

    const trainingCountEl = document.getElementById("egace-training-count");
    if (trainingCountEl) trainingCountEl.textContent = String(trainingCount);

    const assessmentCountEl = document.getElementById("egace-assessment-count");
    if (assessmentCountEl) assessmentCountEl.textContent = String(assessmentCount);

    categoryTabsEl.querySelectorAll("[data-category-tab]").forEach((btn) => {
      const cat = btn.getAttribute("data-category-tab");
      const isActive = activeCategoryTab === cat;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });
  }

  categoryTabsEl?.querySelectorAll("[data-category-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-category-tab");
      if (cat && cat !== activeCategoryTab) {
        activeCategoryTab = cat;
        courseFilter = "";
        batchFilter = "";
        if (courseEl) courseEl.value = "";
        if (batchEl) batchEl.value = "";
        renderCategoryTabs();
        render(true);
      }
    });
  });

  function renderTableHead() {
    if (!theadEl) return;
    if (activeCategoryTab === "assessment") {
      theadEl.innerHTML = `
        <tr>
          <th scope="col">Student Name</th>
          <th scope="col" class="text-center">Graduate</th>
          <th scope="col" class="text-center">Certificate</th>
        </tr>
      `;
    } else {
      theadEl.innerHTML = `
        <tr>
          <th scope="col">Student Name</th>
          <th scope="col" class="text-center">Enrolled</th>
          <th scope="col" class="text-center">Graduate</th>
          <th scope="col" class="text-center">Assessment</th>
          <th scope="col" class="text-center">Certificate</th>
          <th scope="col" class="text-center">Employment</th>
        </tr>
      `;
    }
  }

  function populateFilterOptions() {
    const allRows = getEgaceTableRows();
    const rows = allRows.filter((r) =>
      activeCategoryTab === "assessment" ? isAssessmentRow(r) : isTrainingRow(r)
    );
    const courses = uniqueSorted(
      rows
        .map((row) =>
          activeCategoryTab === "assessment"
            ? (row.assessmentCourse || row.course)
            : row.course
        )
        .filter((c) => c && c !== "—")
    );

    if (courseEl) {
      const prevCourse = courseEl.value;
      courseEl.innerHTML = [
        `<option value="">All courses</option>`,
        ...courses.map(
          (course) =>
            `<option value="${escapeHtml(course)}"${course === prevCourse ? " selected" : ""}>${escapeHtml(course)}</option>`
        ),
      ].join("");
      if (prevCourse && courses.includes(prevCourse)) {
        courseEl.value = prevCourse;
      } else if (prevCourse && prevCourse !== "") {
        courseEl.value = "";
        courseFilter = "";
      }
    }

    const activeCourse = courseEl?.value || "";
    const batches = batchOptionsForCourse(rows, activeCourse, activeCategoryTab);

    if (batchEl) {
      const prevBatch = batchEl.value;
      batchEl.innerHTML = [
        `<option value="">All batches</option>`,
        ...batches.map(
          ([id, label]) =>
            `<option value="${escapeHtml(id)}"${id === prevBatch ? " selected" : ""}>${escapeHtml(label)}</option>`
        ),
      ].join("");
      const validIds = new Set(batches.map(([id]) => id));
      if (prevBatch && validIds.has(prevBatch)) {
        batchEl.value = prevBatch;
      } else {
        batchEl.value = "";
        batchFilter = "";
      }
      batchEl.disabled = batches.length === 0;
    }
  }

  function filteredRows() {
    const rows = getEgaceTableRows();
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeCategoryTab === "training" && !isTrainingRow(row)) return false;
      if (activeCategoryTab === "assessment" && !isAssessmentRow(row)) return false;

      const rowCourse =
        activeCategoryTab === "assessment"
          ? (row.assessmentCourse || row.course)
          : row.course;
      const rowBatchId =
        activeCategoryTab === "assessment"
          ? (row.assessmentBatchId || row.batchId || row.batchLabel || "")
          : (row.batchId || row.batchLabel || "");

      if (courseFilter && rowCourse !== courseFilter) return false;
      if (batchFilter && rowBatchId !== batchFilter) return false;

      if (!q) return true;
      const haystack = [
        row.studentName,
        row.course,
        row.assessmentCourse,
        row.batchLabel,
        row.assessmentBatchLabel,
        row.referenceId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  async function saveManualMilestone(field, rowId, nextValue) {
    let url = "";
    if (field === "employment") {
      url = employmentUrl;
    } else if (field === "certificate") {
      url = egaceConfig.certificate_url || "/registrar/api/egace/certificate/";
    } else if (field === "graduate") {
      url = egaceConfig.graduate_url || "/registrar/api/egace/graduate/";
    } else {
      throw new Error(`${field} is computed from trainer grades and cannot be edited.`);
    }
    if (!url) {
      throw new Error(`${field} save is not configured.`);
    }
    const body = new URLSearchParams();
    body.set("registration_id", rowId);
    body.set(field, nextValue ? "true" : "false");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": getCsrfToken(),
      },
      body: body.toString(),
      credentials: "same-origin",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error(data.message || `Could not save ${field} status.`);
    }
    return Boolean(data[field]);
  }

  function bindManualMilestoneToggles() {
    tbody.querySelectorAll("[data-manual-milestone]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (savingEmployment || btn.disabled) return;
        const rowId = btn.dataset.rowId;
        const field = btn.dataset.manualMilestone;
        if (!rowId || !field) return;

        const current = btn.dataset.value === "1";
        const next = !current;
        savingEmployment = true;
        btn.disabled = true;

        try {
          const saved = await saveManualMilestone(field, rowId, next);
          patchEgaceRow(rowId, { [field]: saved });
          render();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save status.";
          window.alert(message);
          btn.disabled = false;
        } finally {
          savingEmployment = false;
        }
      });
    });
  }

  function renderPagination(totalRows, page, totalPages) {
    if (!paginationEl) return;

    if (totalRows <= PAGE_SIZE) {
      paginationEl.classList.add("d-none");
      paginationEl.innerHTML = "";
      return;
    }

    paginationEl.classList.remove("d-none");
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, totalRows);
    const prevDisabled = page <= 1 ? "disabled" : "";
    const nextDisabled = page >= totalPages ? "disabled" : "";

    paginationEl.innerHTML = `
      <span class="text-muted small">Showing ${start}–${end} of ${totalRows}</span>
      <div class="d-flex align-items-center gap-2">
        <button type="button" class="btn btn-sm btn-outline-secondary egace-page-prev" ${prevDisabled}>Previous</button>
        <span class="text-muted small">Page ${page} of ${totalPages}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary egace-page-next" ${nextDisabled}>Next</button>
      </div>
    `;
  }

  function render(resetPage = false) {
    if (resetPage) currentPage = 1;

    renderCategoryTabs();
    renderTableHead();
    populateFilterOptions();
    const allRows = getEgaceTableRows();
    const rows = filteredRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE) || 1);
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    if (countEl) {
      countEl.textContent =
        rows.length === allRows.length
          ? String(allRows.length)
          : `${rows.length} of ${allRows.length}`;
    }
    if (rows.length === 0) {
      tbody.innerHTML = "";
      paginationEl?.classList.add("d-none");
      paginationEl && (paginationEl.innerHTML = "");
      emptyEl?.classList.remove("d-none");
      const emptyText = emptyEl?.querySelector("p.fw-semibold");
      if (emptyText) {
        emptyText.textContent = allRows.length
          ? "No students match your filters"
          : "No records to display";
      }
      return;
    }

    emptyEl?.classList.add("d-none");
    const emptyText = emptyEl?.querySelector("p.fw-semibold");
    if (emptyText) {
      emptyText.textContent = "No records to display";
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);
    tbody.innerHTML = pageRows.map((row) => renderRow(row, activeCategoryTab)).join("");
    bindManualMilestoneToggles();
    renderPagination(rows.length, currentPage, totalPages);
  }

  searchEl?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render(true);
  });

  courseEl?.addEventListener("change", () => {
    courseFilter = courseEl.value;
    batchFilter = "";
    if (batchEl) batchEl.value = "";
    render(true);
  });

  batchEl?.addEventListener("change", () => {
    batchFilter = batchEl.value;
    render(true);
  });

  paginationEl?.addEventListener("click", (event) => {
    const prev = event.target.closest(".egace-page-prev");
    const next = event.target.closest(".egace-page-next");
    if (prev && currentPage > 1) {
      currentPage -= 1;
      render(false);
    } else if (next) {
      const totalPages = Math.max(1, Math.ceil(filteredRows().length / PAGE_SIZE));
      if (currentPage < totalPages) {
        currentPage += 1;
        render(false);
      }
    }
  });

  subscribeTrainerEgaceSync(render);
  render();
});
