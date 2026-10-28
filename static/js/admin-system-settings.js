/**
 * Admin System Settings — NC programs, dynamic competencies, fees, schedules, fiscal year, enrollment toggle.
 */

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function formatPeso(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "₱0.00";
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const NC_LEVEL_LABELS = {
  nc1: "NC I",
  nc2: "NC II",
  nc3: "NC III",
  other: "Other",
};

let programs = [];
let editingProgramId = null;
let schedules = [];
let editingScheduleId = null;

// Dynamic Program Competencies State
let currentCompProgram = null;
let currentCompetencies = [];
let competencyLibrary = { basic: [], common: [], core: [] };
let activeCompCategoryFilter = "all";

const alertEl = document.getElementById("systemSettingsAlert");
const programModalEl = document.getElementById("programFormModal");
const programModal = programModalEl ? new bootstrap.Modal(programModalEl) : null;
const scheduleModalEl = document.getElementById("scheduleFormModal");
const scheduleModal = scheduleModalEl ? new bootstrap.Modal(scheduleModalEl) : null;
const compModalEl = document.getElementById("competenciesModal");
const compModal = compModalEl ? new bootstrap.Modal(compModalEl) : null;
const compAlertEl = document.getElementById("compModalAlert");

function showAlert(message, type = "success") {
  if (!alertEl) return;
  alertEl.textContent = message;
  alertEl.className = `alert alert-${type} mb-3`;
  alertEl.classList.remove("d-none");
  window.setTimeout(() => alertEl.classList.add("d-none"), 4000);
}

function showProgramError(message) {
  const el = document.getElementById("programFormError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("d-none");
  } else {
    el.textContent = "";
    el.classList.add("d-none");
  }
}

function showScheduleError(message) {
  const el = document.getElementById("scheduleFormError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("d-none");
  } else {
    el.textContent = "";
    el.classList.add("d-none");
  }
}

function showCompAlert(message) {
  if (!compAlertEl) return;
  if (message) {
    compAlertEl.textContent = message;
    compAlertEl.classList.remove("d-none");
  } else {
    compAlertEl.textContent = "";
    compAlertEl.classList.add("d-none");
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function renderProgramsTable() {
  const tbody = document.getElementById("programsTableBody");
  if (!tbody) return;

  if (!programs.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">No programs configured yet.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = programs
    .map((program) => {
      const status = program.isActive
        ? '<span class="admin-user-badge admin-user-badge--active">Active</span>'
        : '<span class="admin-user-badge admin-user-badge--inactive">Inactive</span>';

      const basicCount = program.basicCount ?? 0;
      const commonCount = program.commonCount ?? 0;
      const coreCount = program.coreCount ?? 0;
      const totalCount = program.competenciesCount ?? (basicCount + commonCount + coreCount);

      return `
        <tr>
          <td>
            <strong>${escapeHtml(program.name)}</strong>
          </td>
          <td>${escapeHtml(NC_LEVEL_LABELS[program.ncLevel] || "Other")}</td>
          <td class="text-end">${formatPeso(program.trainingFee)}</td>
          <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-success px-2.5 py-1 rounded-pill" data-manage-competencies="${program.id}" title="Configure Basic, Common, & Core Competencies">
              <i class="bi bi-journal-check me-1"></i>
              <strong>${totalCount} Units</strong>
              <span class="small text-muted ms-1">(${basicCount}B · ${commonCount}C · ${coreCount}Core)</span>
            </button>
          </td>
          <td class="text-center">${Number(program.sortOrder) || 0}</td>
          <td class="text-center">${status}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-success me-1" data-manage-competencies="${program.id}" title="Manage Competencies">
              <i class="bi bi-journal-bookmark me-1"></i>Competencies
            </button>
            <button type="button" class="btn btn-sm btn-light" data-edit-program="${program.id}">Edit</button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-edit-program]").forEach((button) => {
    button.addEventListener("click", () => openProgramModal(Number(button.dataset.editProgram)));
  });

  tbody.querySelectorAll("[data-manage-competencies]").forEach((button) => {
    button.addEventListener("click", () => openCompetenciesModal(Number(button.dataset.manageCompetencies)));
  });
}

function fillGeneralSettings(settings) {
  document.getElementById("fiscalYearLabel").value = settings.fiscalYearLabel || "";
  document.getElementById("registrationFee").value = settings.registrationFee ?? "";
  document.getElementById("enrollmentOpen").checked = settings.enrollmentOpen !== false;
}

function openProgramModal(programId = null) {
  editingProgramId = programId;
  showProgramError("");

  const title = document.getElementById("programFormModalLabel");
  const program = programs.find((row) => row.id === programId);

  if (title) title.textContent = program ? "Edit Program" : "Add Program";

  document.getElementById("programName").value = program?.name || "";
  document.getElementById("programTrainingFee").value = program?.trainingFee ?? "";
  document.getElementById("programSortOrder").value = program?.sortOrder ?? programs.length + 1;
  document.getElementById("programIsActive").checked = program ? program.isActive : true;

  const autoSeedWrap = document.getElementById("programAutoSeedWrap");
  if (autoSeedWrap) {
    autoSeedWrap.classList.toggle("d-none", Boolean(program));
  }
  const autoSeedBox = document.getElementById("programAutoSeedComps");
  if (autoSeedBox && !program) {
    autoSeedBox.checked = true;
  }

  programModal?.show();
}

async function saveProgram() {
  const payload = {
    name: document.getElementById("programName").value.trim(),
    training_fee: document.getElementById("programTrainingFee").value,
    sort_order: document.getElementById("programSortOrder").value,
    is_active: document.getElementById("programIsActive").checked,
  };

  if (!editingProgramId) {
    const autoSeedEl = document.getElementById("programAutoSeedComps");
    payload.auto_seed_competencies = autoSeedEl ? autoSeedEl.checked : true;
  }

  try {
    if (editingProgramId) {
      const data = await apiRequest(`/admin/api/programs/${editingProgramId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      programs = programs.map((row) => (row.id === editingProgramId ? data.program : row));
    } else {
      const data = await apiRequest("/admin/api/programs/create/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      programs.push(data.program);
      programs.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    }

    programModal?.hide();
    renderProgramsTable();
    showAlert(editingProgramId ? "Program updated." : "Program added.");
  } catch (error) {
    showProgramError(error.message);
  }
}

// -----------------------------------------------------------------------------
// Dynamic Program Competencies Management
// -----------------------------------------------------------------------------

function updateCompCountBadges() {
  const allCount = currentCompetencies.length;
  const basicCount = currentCompetencies.filter((c) => c.category === "basic").length;
  const commonCount = currentCompetencies.filter((c) => c.category === "common").length;
  const coreCount = currentCompetencies.filter((c) => c.category === "core").length;

  const elAll = document.getElementById("compCountAll");
  const elBasic = document.getElementById("compCountBasic");
  const elCommon = document.getElementById("compCountCommon");
  const elCore = document.getElementById("compCountCore");

  if (elAll) elAll.textContent = allCount;
  if (elBasic) elBasic.textContent = basicCount;
  if (elCommon) elCommon.textContent = commonCount;
  if (elCore) elCore.textContent = coreCount;
}

function updateCategoryFilterButtons() {
  document.querySelectorAll(".comp-filter-btn").forEach((btn) => {
    const cat = btn.dataset.category;
    if (cat === activeCompCategoryFilter) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function populateLibraryDropdown() {
  const catSelect = document.getElementById("compQuickCategory");
  const libSelect = document.getElementById("compLibrarySelect");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "basic";
  const items = competencyLibrary[cat] || [];

  libSelect.innerHTML = '<option value="">-- Choose standard unit from library --</option>';
  items.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    const codePrefix = item.code ? `${item.code} — ` : "";
    opt.textContent = `${codePrefix}${item.title} (${item.nominal_hours || 0} hrs)`;
    libSelect.appendChild(opt);
  });
}

function addFromLibrary() {
  const catSelect = document.getElementById("compQuickCategory");
  const libSelect = document.getElementById("compLibrarySelect");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "basic";
  const selectedIdx = parseInt(libSelect.value, 10);
  if (Number.isNaN(selectedIdx)) {
    alert("Please select a competency from the dropdown.");
    return;
  }

  const items = competencyLibrary[cat] || [];
  const selected = items[selectedIdx];
  if (!selected) return;

  currentCompetencies.push({
    id: null,
    category: cat,
    code: selected.code || "",
    title: selected.title || "",
    nominalHours: selected.nominal_hours || 0,
    learningOutcomes: Array.isArray(selected.learning_outcomes) ? [...selected.learning_outcomes] : [],
    sortOrder: currentCompetencies.length + 1,
  });

  updateCompCountBadges();
  renderCompetenciesTable();
  libSelect.value = "";
}

function showCustomCompForm(comp = null, index = -1) {
  const formCard = document.getElementById("customCompCard");
  if (!formCard) return;

  document.getElementById("editCompIndex").value = index;
  document.getElementById("customCompTitle").textContent = comp ? "Edit Unit of Competency" : "Add Unit of Competency";
  document.getElementById("customCompCategory").value = comp?.category || (activeCompCategoryFilter !== "all" ? activeCompCategoryFilter : "core");
  document.getElementById("customCompCode").value = comp?.code || "";
  document.getElementById("customCompName").value = comp?.title || "";
  document.getElementById("customCompHours").value = comp?.nominalHours ?? 20;

  const los = comp?.learningOutcomes || [];
  document.getElementById("customCompOutcomes").value = Array.isArray(los) ? los.join("\n") : "";

  formCard.classList.remove("d-none");
  formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideCustomCompForm() {
  const formCard = document.getElementById("customCompCard");
  if (formCard) formCard.classList.add("d-none");
  document.getElementById("editCompIndex").value = -1;
  document.getElementById("customCompCode").value = "";
  document.getElementById("customCompName").value = "";
  document.getElementById("customCompHours").value = 20;
  document.getElementById("customCompOutcomes").value = "";
}

function applyCustomComp() {
  const title = document.getElementById("customCompName").value.trim();
  if (!title) {
    alert("Please enter a competency title / descriptor.");
    return;
  }
  const category = document.getElementById("customCompCategory").value || "core";
  const code = document.getElementById("customCompCode").value.trim();
  const nominalHours = parseInt(document.getElementById("customCompHours").value, 10) || 0;
  const rawOutcomes = document.getElementById("customCompOutcomes").value;
  const learningOutcomes = rawOutcomes
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const index = parseInt(document.getElementById("editCompIndex").value, 10);
  if (index >= 0 && index < currentCompetencies.length) {
    currentCompetencies[index] = {
      ...currentCompetencies[index],
      category,
      code,
      title,
      nominalHours,
      learningOutcomes,
    };
  } else {
    currentCompetencies.push({
      id: null,
      category,
      code,
      title,
      nominalHours,
      learningOutcomes,
      sortOrder: currentCompetencies.length + 1,
    });
  }

  hideCustomCompForm();
  updateCompCountBadges();
  renderCompetenciesTable();
}

function renderCompetenciesTable() {
  const tbody = document.getElementById("compUnitsTableBody");
  if (!tbody) return;

  const filtered = currentCompetencies
    .map((comp, originalIndex) => ({ comp, originalIndex }))
    .filter(({ comp }) => activeCompCategoryFilter === "all" || comp.category === activeCompCategoryFilter);

  if (!filtered.length) {
    const filterLabel = activeCompCategoryFilter === "all" ? "competencies" : `${activeCompCategoryFilter} competencies`;
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">No ${filterLabel} configured yet. Click "+ Add Custom Unit" or select from the standard library above.</td>
      </tr>`;
    return;
  }

  const categoryBadges = {
    basic: '<span class="badge bg-success-subtle text-success border border-success-subtle">Basic</span>',
    common: '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Common</span>',
    core: '<span class="badge bg-warning-subtle text-dark border border-warning-subtle">Core</span>',
  };

  tbody.innerHTML = filtered
    .map(({ comp, originalIndex }, displayIdx) => {
      const catBadge = categoryBadges[comp.category] || categoryBadges.core;
      const loCount = (comp.learningOutcomes || []).length;
      const loTooltip = escapeHtml((comp.learningOutcomes || []).join("\n") || "No LOs defined");

      return `
        <tr>
          <td class="text-center text-muted small fw-bold">${displayIdx + 1}</td>
          <td>${catBadge}</td>
          <td><code class="small text-dark">${escapeHtml(comp.code || "—")}</code></td>
          <td>
            <strong>${escapeHtml(comp.title)}</strong>
          </td>
          <td class="text-center">
            <span class="badge bg-light text-dark border">${comp.nominalHours || 0} hrs</span>
          </td>
          <td class="text-center">
            <span class="badge bg-secondary-subtle text-secondary" style="cursor: help;" title="${loTooltip}">
              ${loCount} LOs
            </span>
          </td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-link text-secondary p-1" data-move-comp-up="${originalIndex}" title="Move Up" ${originalIndex === 0 ? "disabled" : ""}>
              <i class="bi bi-arrow-up"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link text-secondary p-1" data-move-comp-down="${originalIndex}" title="Move Down" ${originalIndex === currentCompetencies.length - 1 ? "disabled" : ""}>
              <i class="bi bi-arrow-down"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link text-primary p-1" data-edit-comp="${originalIndex}" title="Edit Unit">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link text-danger p-1" data-delete-comp="${originalIndex}" title="Remove Unit">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-move-comp-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.moveCompUp);
      if (idx > 0) {
        const temp = currentCompetencies[idx];
        currentCompetencies[idx] = currentCompetencies[idx - 1];
        currentCompetencies[idx - 1] = temp;
        renderCompetenciesTable();
      }
    });
  });

  tbody.querySelectorAll("[data-move-comp-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.moveCompDown);
      if (idx < currentCompetencies.length - 1) {
        const temp = currentCompetencies[idx];
        currentCompetencies[idx] = currentCompetencies[idx + 1];
        currentCompetencies[idx + 1] = temp;
        renderCompetenciesTable();
      }
    });
  });

  tbody.querySelectorAll("[data-edit-comp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.editComp);
      showCustomCompForm(currentCompetencies[idx], idx);
    });
  });

  tbody.querySelectorAll("[data-delete-comp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.deleteComp);
      const unit = currentCompetencies[idx];
      if (confirm(`Remove competency "${unit.title}" from this program?`)) {
        currentCompetencies.splice(idx, 1);
        updateCompCountBadges();
        renderCompetenciesTable();
      }
    });
  });
}

async function openCompetenciesModal(programId) {
  currentCompProgram = programs.find((p) => p.id === programId);
  const badgeEl = document.getElementById("compModalProgramBadge");
  if (badgeEl) badgeEl.textContent = currentCompProgram ? currentCompProgram.name : `Program #${programId}`;

  hideCustomCompForm();
  showCompAlert("");

  try {
    const fetchLib = Object.keys(competencyLibrary).length === 0 || !competencyLibrary.basic?.length;
    const [compData, libData] = await Promise.all([
      apiRequest(`/admin/api/programs/${programId}/competencies/`),
      fetchLib ? apiRequest("/admin/api/competencies/library/") : Promise.resolve({ library: competencyLibrary }),
    ]);

    currentCompetencies = (compData.competencies || []).map((c) => ({
      id: c.id,
      category: c.category || "core",
      code: c.code || "",
      title: c.title || "",
      nominalHours: c.nominalHours || c.nominal_hours || 0,
      learningOutcomes: Array.isArray(c.learningOutcomes) ? c.learningOutcomes : (c.learning_outcomes || []),
      sortOrder: c.sortOrder || c.sort_order || 0,
    }));

    if (libData && libData.library) {
      competencyLibrary = libData.library;
      populateLibraryDropdown();
    }

    activeCompCategoryFilter = "all";
    updateCategoryFilterButtons();
    updateCompCountBadges();
    renderCompetenciesTable();
    compModal?.show();
  } catch (error) {
    showAlert(`Could not load competencies: ${error.message}`, "danger");
  }
}

async function saveAllProgramCompetencies() {
  if (!currentCompProgram) return;

  const payload = {
    competencies: currentCompetencies.map((c, idx) => ({
      category: c.category,
      code: c.code,
      title: c.title,
      nominal_hours: c.nominalHours,
      learning_outcomes: c.learningOutcomes,
      sort_order: idx + 1,
    })),
  };

  const saveBtn = document.getElementById("btnSaveProgramCompetencies");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
  }

  try {
    await apiRequest(`/admin/api/programs/${currentCompProgram.id}/competencies/`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    compModal?.hide();
    showAlert(`Competencies for "${currentCompProgram.name}" updated successfully.`);
    await loadSettings();
  } catch (error) {
    showCompAlert(error.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-save me-1"></i>Save All Competency Changes';
    }
  }
}

// -----------------------------------------------------------------------------
// Training Schedules Management
// -----------------------------------------------------------------------------

function renderSchedulesTable() {
  const tbody = document.getElementById("schedulesTableBody");
  if (!tbody) return;

  if (!schedules.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">No schedules configured yet.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = schedules
    .map((sched) => {
      const status = sched.isActive
        ? '<span class="admin-user-badge admin-user-badge--active">Active</span>'
        : '<span class="admin-user-badge admin-user-badge--inactive">Inactive</span>';
      return `
        <tr>
          <td>
            <strong>${escapeHtml(sched.name)}</strong>
            ${sched.code ? `<span class="d-block text-xs text-muted">Code: ${escapeHtml(sched.code)}</span>` : ""}
          </td>
          <td>${escapeHtml(sched.days || "—")}</td>
          <td>${escapeHtml(sched.timeSlot || "—")}</td>
          <td class="text-center">${Number(sched.sortOrder) || 0}</td>
          <td class="text-center">${status}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-light me-1" data-edit-schedule="${sched.id}">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-delete-schedule="${sched.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-edit-schedule]").forEach((button) => {
    button.addEventListener("click", () => openScheduleModal(Number(button.dataset.editSchedule)));
  });

  tbody.querySelectorAll("[data-delete-schedule]").forEach((button) => {
    button.addEventListener("click", () => deleteSchedule(Number(button.dataset.deleteSchedule)));
  });
}

function openScheduleModal(scheduleId = null) {
  editingScheduleId = scheduleId;
  showScheduleError("");

  const title = document.getElementById("scheduleFormModalLabel");
  const sched = schedules.find((row) => row.id === scheduleId);

  if (title) title.textContent = sched ? "Edit Training Schedule" : "Add Training Schedule";

  document.getElementById("scheduleName").value = sched?.name || "";
  document.getElementById("scheduleDays").value = sched?.days || "";
  document.getElementById("scheduleTimeSlot").value = sched?.timeSlot || "";
  document.getElementById("scheduleCode").value = sched?.code || "";
  document.getElementById("scheduleSortOrder").value = sched?.sortOrder ?? schedules.length + 1;
  document.getElementById("scheduleIsActive").checked = sched ? sched.isActive : true;

  scheduleModal?.show();
}

async function saveSchedule() {
  const payload = {
    name: document.getElementById("scheduleName").value.trim(),
    days: document.getElementById("scheduleDays").value.trim(),
    time_slot: document.getElementById("scheduleTimeSlot").value.trim(),
    code: document.getElementById("scheduleCode").value.trim(),
    sort_order: document.getElementById("scheduleSortOrder").value,
    is_active: document.getElementById("scheduleIsActive").checked,
  };

  try {
    if (editingScheduleId) {
      const data = await apiRequest(`/admin/api/schedules/${editingScheduleId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      schedules = schedules.map((row) => (row.id === editingScheduleId ? data.schedule : row));
    } else {
      const data = await apiRequest("/admin/api/schedules/create/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      schedules.push(data.schedule);
      schedules.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    }

    scheduleModal?.hide();
    renderSchedulesTable();
    showAlert(editingScheduleId ? "Schedule updated." : "Schedule added.");
  } catch (error) {
    showScheduleError(error.message);
  }
}

async function deleteSchedule(scheduleId) {
  const sched = schedules.find((s) => s.id === scheduleId);
  const name = sched ? sched.name : "this schedule";
  if (!confirm(`Are you sure you want to remove ${name}?`)) {
    return;
  }
  try {
    await apiRequest(`/admin/api/schedules/${scheduleId}/delete/`, {
      method: "POST",
    });
    schedules = schedules.filter((s) => s.id !== scheduleId);
    renderSchedulesTable();
    showAlert("Schedule removed.");
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function loadSettings() {
  const data = await apiRequest("/admin/api/system-settings/");
  programs = data.programs || [];
  schedules = data.schedules || [];
  fillGeneralSettings(data.settings || {});
  renderProgramsTable();
  renderSchedulesTable();
}

async function saveGeneralSettings() {
  const payload = {
    fiscal_year_label: document.getElementById("fiscalYearLabel").value.trim(),
    registration_fee: document.getElementById("registrationFee").value,
    enrollment_open: document.getElementById("enrollmentOpen").checked,
  };

  try {
    await apiRequest("/admin/api/system-settings/update/", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    showAlert("General settings saved.");
    await loadSettings();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

function initSystemSettings() {
  document.getElementById("saveGeneralSettingsBtn")?.addEventListener("click", saveGeneralSettings);
  document.getElementById("addProgramButton")?.addEventListener("click", () => openProgramModal());
  document.getElementById("saveProgramButton")?.addEventListener("click", saveProgram);
  document.getElementById("addScheduleButton")?.addEventListener("click", () => openScheduleModal());
  document.getElementById("saveScheduleButton")?.addEventListener("click", saveSchedule);

  // Competency Category tabs
  document.querySelectorAll(".comp-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCompCategoryFilter = btn.dataset.category || "all";
      updateCategoryFilterButtons();
      renderCompetenciesTable();
    });
  });

  // Library Category Selection & Add
  document.getElementById("compQuickCategory")?.addEventListener("change", populateLibraryDropdown);
  document.getElementById("btnAddFromLibrary")?.addEventListener("click", addFromLibrary);

  // Custom Unit Form Toggle & Actions
  document.getElementById("btnOpenAddCustomComp")?.addEventListener("click", () => showCustomCompForm());
  document.getElementById("btnCloseCustomComp")?.addEventListener("click", hideCustomCompForm);
  document.getElementById("btnCancelCustomComp")?.addEventListener("click", hideCustomCompForm);
  document.getElementById("btnSaveCustomComp")?.addEventListener("click", applyCustomComp);

  // Save All Competencies
  document.getElementById("btnSaveProgramCompetencies")?.addEventListener("click", saveAllProgramCompetencies);

  loadSettings().catch((error) => showAlert(error.message, "danger"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSystemSettings);
} else {
  initSystemSettings();
}
