/**
 * Registrar — student list (approved / enrolled trainees from database).
 */

import { escapeHtml, initStudentViewModal } from "./registrar-student-detail.js";
import { renderLearnerProfileModalBody } from "./registrar-enrollment-profile-view.js";

const FALLBACK_PROGRAMS = [
  "Automotive Servicing (Engine Repair) NC II",
  "Automotive Servicing NC I",
  "Driving NC II",
  "Driving NC III (Passenger Bus / Straight Truck)",
  "Rice Machinery Operations NC II",
];

const TABS = [
  { key: "training", label: "Training with Assessment" },
  { key: "assessment", label: "Assessment Only Clients" },
];

function loadRegistrarStudentsData() {
  const el = document.getElementById("registrar-students-data");
  if (!el?.textContent) {
    return {
      programs: FALLBACK_PROGRAMS,
      modules: [
        { key: "training", title: "Training with Assessment", badgeLabel: "0 students", students: [] },
        { key: "assessment", title: "Assessment Only Clients", badgeLabel: "0 clients", students: [] },
      ],
    };
  }
  try {
    return JSON.parse(el.textContent);
  } catch {
    return { programs: FALLBACK_PROGRAMS, modules: [] };
  }
}

const serverData = loadRegistrarStudentsData();
const MODULE_DATA = serverData.modules || [];
const PROGRAMS = serverData.programs?.length ? serverData.programs : FALLBACK_PROGRAMS;

const ROWS_PER_PAGE = 10;

function findStudent(moduleKey, studentId, registrationId) {
  const mod = MODULE_DATA.find((m) => m.key === moduleKey);
  if (!mod) return null;
  if (studentId) {
    const row = mod.students.find((s) => s.id === Number(studentId));
    if (row) return row;
  }
  if (registrationId) {
    return mod.students.find((s) => s.registrationId === registrationId) ?? null;
  }
  return null;
}

function statusBadgeClass(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("enrolled") || s.includes("verified") || s.includes("assessed")) {
    return "bg-success-subtle text-success";
  }
  if (s.includes("pending")) return "bg-warning-subtle text-warning";
  return "bg-primary-subtle text-primary";
}

document.addEventListener("DOMContentLoaded", () => {
  let activeTab = "training";
  const filters = { training: "All Programs", assessment: "All Programs" };
  const searchQueries = { training: "", assessment: "" };
  const pages = { training: 1, assessment: 1 };

  const tabsEl = document.getElementById("module-tabs");
  const titleEl = document.getElementById("module-title");
  const badgeEl = document.getElementById("module-badge");
  const searchEl = document.getElementById("student-search");
  const filterEl = document.getElementById("program-filter");
  const tableContainer = document.getElementById("student-table-container");
  const paginationContainer = document.getElementById("pagination-container");
  const modalEl = document.getElementById("add-student-modal");
  const addModal = modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
  const viewModal = initStudentViewModal(document.getElementById("view-student-modal"));
  const viewBodyEl = document.getElementById("view-student-body");
  const enrollmentSelect = document.querySelector('#add-student-form [name="enrollmentType"]');

  async function openViewStudentModal(moduleKey, studentId, registrationId) {
    const student = findStudent(moduleKey, studentId, registrationId);
    if (!student) return;

    const params = new URLSearchParams();
    if (student.id != null) params.set("profile_id", String(student.id));
    else if (student.registrationId) params.set("registration_id", student.registrationId);

    viewModal.open(
      { name: student.name, status: student.status, metaHtml: "Loading learner profile…" },
      `<div class="text-center py-5 text-muted"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Loading…</div>`
    );

    try {
      const res = await fetch(`/registrar/api/enrollment/detail/?${params}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const detail = await res.json();
      if (!res.ok) throw new Error(detail.error || "Could not load profile.");
      const metaHtml = `${escapeHtml(detail.referenceId || student.referenceId || "—")} · ${escapeHtml(detail.program || student.program)} · <span class="badge bg-success-subtle text-success">${escapeHtml(student.status)}</span>`;
      viewModal.open(
        { name: detail.name || student.name, status: student.status, metaHtml },
        renderLearnerProfileModalBody(detail)
      );
    } catch (err) {
      if (viewBodyEl) {
        viewBodyEl.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(err.message || "Failed to load profile.")}</div>`;
      }
    }
  }

  function getFilteredModule(key) {
    const mod = MODULE_DATA.find((m) => m.key === key) || {
      key,
      title: key,
      badgeLabel: "0 students",
      students: [],
    };
    const selectedProgram = filters[key] || "All Programs";
    const query = (searchQueries[key] || "").trim().toLowerCase();
    const students = (mod.students || []).filter(
      (s) =>
        (selectedProgram === "All Programs" || s.program === selectedProgram) &&
        (query === "" ||
          s.name.toLowerCase().includes(query) ||
          s.program.toLowerCase().includes(query) ||
          s.status.toLowerCase().includes(query) ||
          (s.email && s.email.toLowerCase().includes(query)))
    );
    return { ...mod, students };
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    TABS.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = tab.label;
      btn.className = "module-tab-btn btn btn-sm border-0" + (tab.key === activeTab ? " active" : "");
      btn.addEventListener("click", () => {
        activeTab = tab.key;
        searchEl.value = searchQueries[activeTab] || "";
        renderTabs();
        renderFilterOptions();
        renderTable();
        if (enrollmentSelect) {
          enrollmentSelect.value = activeTab === "assessment" ? "Assessment Only" : "Training with Assessment";
        }
      });
      tabsEl.appendChild(btn);
    });
  }

  function renderFilterOptions() {
    filterEl.innerHTML = '<option>All Programs</option>';
    PROGRAMS.forEach((p) => {
      const o = document.createElement("option");
      o.value = p;
      o.textContent = p;
      filterEl.appendChild(o);
    });
    filterEl.value = filters[activeTab];
  }

  function renderTable() {
    const mod = getFilteredModule(activeTab);
    titleEl.textContent = mod.title;
    const count = mod.students.length;
    badgeEl.textContent =
      count === 0
        ? activeTab === "assessment"
          ? "0 clients"
          : "0 students"
        : activeTab === "assessment"
          ? `${count} client${count === 1 ? "" : "s"}`
          : `${count} student${count === 1 ? "" : "s"}`;
    badgeEl.className = "registrar-pill registrar-pill--primary";

    if (mod.students.length === 0) {
      tableContainer.innerHTML =
        '<div class="alert alert-light border text-center text-secondary mb-0">No enrolled students yet. Students appear here after you approve their enrollment.</div>';
      paginationContainer.classList.add("d-none");
      return;
    }

    const totalPages = Math.ceil(mod.students.length / ROWS_PER_PAGE);
    const currentPage = Math.min(pages[activeTab] || 1, totalPages);
    pages[activeTab] = currentPage;
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageRows = mod.students.slice(start, start + ROWS_PER_PAGE);

    const rows = pageRows
      .map(
        (s, i) => `
      <tr>
        <td>${start + i + 1}</td>
        <td>
          <div class="fw-medium">${escapeHtml(s.name)}</div>
          <span class="badge text-bg-light text-primary" style="font-size:0.65rem">${escapeHtml(s.scholarship)}</span>
        </td>
        <td class="text-secondary">${escapeHtml(s.program)}</td>
        <td><span class="badge ${statusBadgeClass(s.status)}">${escapeHtml(s.status)}</span></td>
        <td class="text-secondary">${escapeHtml(s.date)}</td>
        <td class="text-center text-nowrap">
          <button type="button" class="btn registrar-table-action registrar-table-action--view btn-sm view-student-btn" data-module-key="${activeTab}" data-student-id="${s.id != null ? s.id : ""}" data-registration-id="${escapeHtml(s.registrationId || "")}" aria-label="View ${escapeHtml(s.name)}"><i class="bi bi-eye" aria-hidden="true"></i></button>
        </td>
      </tr>`
      )
      .join("");

    tableContainer.innerHTML = `
      <div class="table-responsive">
        <table class="table registrar-table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style="width:3rem">#</th>
              <th>Name</th>
              <th>Program</th>
              <th>Status</th>
              <th>Date</th>
              <th class="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    if (totalPages > 1) {
      paginationContainer.classList.remove("d-none");
      paginationContainer.innerHTML = `
        <button type="button" id="page-prev" class="btn btn-outline-secondary btn-sm" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
        <span class="align-self-center text-muted small px-2">Page ${currentPage} of ${totalPages}</span>
        <button type="button" id="page-next" class="btn btn-outline-secondary btn-sm" ${currentPage === totalPages ? "disabled" : ""}>Next</button>`;
      document.getElementById("page-prev")?.addEventListener("click", () => {
        pages[activeTab] = Math.max(1, currentPage - 1);
        renderTable();
      });
      document.getElementById("page-next")?.addEventListener("click", () => {
        pages[activeTab] = Math.min(totalPages, currentPage + 1);
        renderTable();
      });
    } else {
      paginationContainer.classList.add("d-none");
    }
  }

  tableContainer?.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-student-btn");
    if (!btn) return;
    openViewStudentModal(btn.dataset.moduleKey, btn.dataset.studentId, btn.dataset.registrationId);
  });

  searchEl?.addEventListener("input", (e) => {
    searchQueries[activeTab] = e.target.value;
    pages[activeTab] = 1;
    renderTable();
  });

  filterEl?.addEventListener("change", (e) => {
    filters[activeTab] = e.target.value;
    pages[activeTab] = 1;
    renderTable();
  });

  document.getElementById("open-add-student")?.addEventListener("click", () => {
    document.getElementById("add-student-form")?.reset();
    if (enrollmentSelect) {
      enrollmentSelect.value = activeTab === "assessment" ? "Assessment Only" : "Training with Assessment";
    }
    addModal?.show();
  });

  document.getElementById("add-student-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    addModal?.hide();
  });

  renderTabs();
  renderFilterOptions();
  renderTable();
});
