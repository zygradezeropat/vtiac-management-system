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

// Dynamic Program Competencies State (for Program Form Modal)
let progFormCompetencies = [];

// Dynamic Program Competencies State (for Standalone Competencies Modal)
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

async function ensureCompetencyLibraryLoaded() {
  if (competencyLibrary.basic?.length && competencyLibrary.core?.length) {
    return competencyLibrary;
  }
  try {
    const data = await apiRequest("/admin/api/competencies/library/");
    if (data?.library) {
      competencyLibrary = data.library;
    }
  } catch (err) {
    console.error("Failed to load competency library:", err);
  }
  return competencyLibrary;
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
            <button type="button" class="btn btn-sm btn-outline-success me-1" data-manage-competencies="${program.id}" title="Configure Competencies">
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

// -----------------------------------------------------------------------------
// Program Form Modal Competency Helpers (Integrated Setup)
// -----------------------------------------------------------------------------

function updateProgFormCompCounts() {
  const allCount = progFormCompetencies.length;
  const basicCount = progFormCompetencies.filter((c) => c.category === "basic").length;
  const commonCount = progFormCompetencies.filter((c) => c.category === "common").length;
  const coreCount = progFormCompetencies.filter((c) => c.category === "core").length;

  const elAll = document.getElementById("progFormCountAll");
  const elBasic = document.getElementById("progFormCountBasic");
  const elCommon = document.getElementById("progFormCountCommon");
  const elCore = document.getElementById("progFormCountCore");

  if (elAll) elAll.textContent = allCount;
  if (elBasic) elBasic.textContent = basicCount;
  if (elCommon) elCommon.textContent = commonCount;
  if (elCore) elCore.textContent = coreCount;
}

function populateProgFormLibDropdown() {
  const catSelect = document.getElementById("progFormTargetCategory");
  const libSelect = document.getElementById("progFormLibSelect");
  const datalist = document.getElementById("progFormTitleDatalist");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "core";
  const items = competencyLibrary[cat] || [];

  libSelect.innerHTML = `<option value="">-- Choose ${cat.toUpperCase()} competency from dropdown (auto-fills inputs below) --</option>`;
  if (datalist) datalist.innerHTML = "";

  items.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    const codePrefix = item.code ? `${item.code} — ` : "";
    opt.textContent = `${codePrefix}${item.title} (${item.nominal_hours || 0} hrs)`;
    libSelect.appendChild(opt);

    if (datalist) {
      const dlOpt = document.createElement("option");
      dlOpt.value = item.title;
      datalist.appendChild(dlOpt);
    }
  });
}

function onProgFormLibSelectChange() {
  const catSelect = document.getElementById("progFormTargetCategory");
  const libSelect = document.getElementById("progFormLibSelect");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "core";
  const selectedIdx = parseInt(libSelect.value, 10);
  if (Number.isNaN(selectedIdx)) return;

  const items = competencyLibrary[cat] || [];
  const selected = items[selectedIdx];
  if (!selected) return;

  const codeInput = document.getElementById("progFormManualCode");
  const titleInput = document.getElementById("progFormManualTitleInput");
  const hoursInput = document.getElementById("progFormManualHours");
  const outcomesInput = document.getElementById("progFormManualOutcomes");

  if (codeInput) codeInput.value = selected.code || "";
  if (titleInput) titleInput.value = selected.title || "";
  if (hoursInput) hoursInput.value = selected.nominal_hours || 40;
  if (outcomesInput) {
    const los = Array.isArray(selected.learning_outcomes) ? selected.learning_outcomes : [];
    outcomesInput.value = los.join("\n");
  }
}

function preloadStandardCompetenciesForNewProg() {
  const basicItems = competencyLibrary.basic || [];
  const commonItems = competencyLibrary.common || [];

  const existingTitles = new Set(progFormCompetencies.map((c) => c.title.toLowerCase().trim()));
  let addedCount = 0;

  // Add 4 Basic
  basicItems.slice(0, 4).forEach((item) => {
    if (!existingTitles.has(item.title.toLowerCase().trim())) {
      progFormCompetencies.push({
        id: null,
        category: "basic",
        code: item.code || "",
        title: item.title,
        nominalHours: item.nominal_hours || 10,
        learningOutcomes: Array.isArray(item.learning_outcomes) ? [...item.learning_outcomes] : [],
        sortOrder: progFormCompetencies.length + 1,
      });
      existingTitles.add(item.title.toLowerCase().trim());
      addedCount++;
    }
  });

  // Add 3 Common
  commonItems.slice(0, 3).forEach((item) => {
    if (!existingTitles.has(item.title.toLowerCase().trim())) {
      progFormCompetencies.push({
        id: null,
        category: "common",
        code: item.code || "",
        title: item.title,
        nominalHours: item.nominal_hours || 20,
        learningOutcomes: Array.isArray(item.learning_outcomes) ? [...item.learning_outcomes] : [],
        sortOrder: progFormCompetencies.length + 1,
      });
      existingTitles.add(item.title.toLowerCase().trim());
      addedCount++;
    }
  });

  updateProgFormCompCounts();
  renderProgFormCompsTable();
  return addedCount;
}

function resetProgFormManualInputs() {
  const editIndex = document.getElementById("progFormManualEditIndex");
  if (editIndex) editIndex.value = -1;

  const titleEl = document.getElementById("progFormManualTitle");
  if (titleEl) titleEl.textContent = "Add / Configure Competency Unit";

  const btnText = document.getElementById("progFormApplyBtnText");
  if (btnText) btnText.textContent = "Add Unit";

  const codeInput = document.getElementById("progFormManualCode");
  const titleInput = document.getElementById("progFormManualTitleInput");
  const hoursInput = document.getElementById("progFormManualHours");
  const outcomesInput = document.getElementById("progFormManualOutcomes");
  const libSelect = document.getElementById("progFormLibSelect");

  if (codeInput) codeInput.value = "";
  if (titleInput) titleInput.value = "";
  if (hoursInput) hoursInput.value = 40;
  if (outcomesInput) outcomesInput.value = "";
  if (libSelect) libSelect.value = "";
}

function addProgFormUnitFromLib() {
  const catSelect = document.getElementById("progFormTargetCategory");
  const libSelect = document.getElementById("progFormLibSelect");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "core";
  const selectedIdx = parseInt(libSelect.value, 10);
  if (Number.isNaN(selectedIdx)) {
    const manualTitle = document.getElementById("progFormManualTitleInput")?.value?.trim();
    if (manualTitle) {
      applyProgFormManualUnit();
      return;
    }
    alert("Please select a competency from the dropdown or type a custom title below.");
    return;
  }

  const items = competencyLibrary[cat] || [];
  const selected = items[selectedIdx];
  if (!selected) return;

  progFormCompetencies.push({
    id: null,
    category: cat,
    code: selected.code || "",
    title: selected.title || "",
    nominalHours: selected.nominal_hours || 40,
    learningOutcomes: Array.isArray(selected.learning_outcomes) ? [...selected.learning_outcomes] : [],
    sortOrder: progFormCompetencies.length + 1,
  });

  resetProgFormManualInputs();
  updateProgFormCompCounts();
  renderProgFormCompsTable();
}

function showProgFormManualCard(comp = null, index = -1) {
  const editIndex = document.getElementById("progFormManualEditIndex");
  if (editIndex) editIndex.value = index;

  const titleEl = document.getElementById("progFormManualTitle");
  if (titleEl) titleEl.textContent = comp ? `Edit Unit: ${comp.title}` : "Add / Configure Competency Unit";

  const btnText = document.getElementById("progFormApplyBtnText");
  if (btnText) btnText.textContent = comp ? "Update Unit" : "Add Unit";

  const catSelect = document.getElementById("progFormTargetCategory");
  if (catSelect && comp?.category) {
    catSelect.value = comp.category;
    populateProgFormLibDropdown();
  }

  const codeInput = document.getElementById("progFormManualCode");
  const titleInput = document.getElementById("progFormManualTitleInput");
  const hoursInput = document.getElementById("progFormManualHours");
  const outcomesInput = document.getElementById("progFormManualOutcomes");

  if (codeInput) codeInput.value = comp?.code || "";
  if (titleInput) {
    titleInput.value = comp?.title || "";
    titleInput.focus();
  }
  if (hoursInput) hoursInput.value = comp?.nominalHours ?? 40;

  if (outcomesInput) {
    const los = comp?.learningOutcomes || [];
    outcomesInput.value = Array.isArray(los) ? los.join("\n") : "";
  }

  const card = document.getElementById("progFormManualCard");
  card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function applyProgFormManualUnit() {
  const titleInput = document.getElementById("progFormManualTitleInput");
  const title = (titleInput?.value || "").trim();
  if (!title) {
    alert("Please enter a competency title / descriptor.");
    titleInput?.focus();
    return;
  }
  const category = document.getElementById("progFormTargetCategory")?.value || "core";
  const code = (document.getElementById("progFormManualCode")?.value || "").trim();
  const nominalHours = parseInt(document.getElementById("progFormManualHours")?.value, 10) || 0;
  const rawOutcomes = document.getElementById("progFormManualOutcomes")?.value || "";
  const learningOutcomes = rawOutcomes
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const index = parseInt(document.getElementById("progFormManualEditIndex")?.value, 10);
  if (index >= 0 && index < progFormCompetencies.length) {
    progFormCompetencies[index] = {
      ...progFormCompetencies[index],
      category,
      code,
      title,
      nominalHours,
      learningOutcomes,
    };
  } else {
    progFormCompetencies.push({
      id: null,
      category,
      code,
      title,
      nominalHours,
      learningOutcomes,
      sortOrder: progFormCompetencies.length + 1,
    });
  }

  resetProgFormManualInputs();
  updateProgFormCompCounts();
  renderProgFormCompsTable();
}

function renderProgFormCompsTable() {
  const tbody = document.getElementById("progFormCompsTableBody");
  if (!tbody) return;

  if (!progFormCompetencies.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center text-muted py-4">No competencies added yet. Select from dropdown or enter manually above.</td>
      </tr>`;
    return;
  }

  const categoryBadges = {
    basic: '<span class="badge bg-success-subtle text-success border border-success-subtle">Basic</span>',
    common: '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Common</span>',
    core: '<span class="badge bg-warning-subtle text-dark border border-warning-subtle">Core</span>',
  };

  tbody.innerHTML = progFormCompetencies
    .map((comp, idx) => {
      const catBadge = categoryBadges[comp.category] || categoryBadges.core;
      const loCount = (comp.learningOutcomes || []).length;
      const loTooltip = escapeHtml((comp.learningOutcomes || []).join("\n") || "No LOs defined");

      return `
        <tr>
          <td class="text-center text-muted small fw-bold">${idx + 1}</td>
          <td>${catBadge}</td>
          <td><code class="small text-dark">${escapeHtml(comp.code || "—")}</code></td>
          <td><strong>${escapeHtml(comp.title)}</strong></td>
          <td class="text-center"><span class="badge bg-light text-dark border">${comp.nominalHours || 0} hrs</span></td>
          <td class="text-center">
            <span class="badge bg-secondary-subtle text-secondary" style="cursor: help;" title="${loTooltip}">${loCount} LOs</span>
          </td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-link text-secondary p-1" data-move-prog-up="${idx}" title="Move Up" ${idx === 0 ? "disabled" : ""}>
              <i class="bi bi-arrow-up"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link text-secondary p-1" data-move-prog-down="${idx}" title="Move Down" ${idx === progFormCompetencies.length - 1 ? "disabled" : ""}>
              <i class="bi bi-arrow-down"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link text-primary p-1" data-edit-prog-comp="${idx}" title="Edit Unit">
              <i class="bi bi-pencil"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link text-danger p-1" data-delete-prog-comp="${idx}" title="Remove Unit">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-move-prog-up]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.moveProgUp);
      if (idx > 0) {
        const temp = progFormCompetencies[idx];
        progFormCompetencies[idx] = progFormCompetencies[idx - 1];
        progFormCompetencies[idx - 1] = temp;
        renderProgFormCompsTable();
      }
    });
  });

  tbody.querySelectorAll("[data-move-prog-down]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.moveProgDown);
      if (idx < progFormCompetencies.length - 1) {
        const temp = progFormCompetencies[idx];
        progFormCompetencies[idx] = progFormCompetencies[idx + 1];
        progFormCompetencies[idx + 1] = temp;
        renderProgFormCompsTable();
      }
    });
  });

  tbody.querySelectorAll("[data-edit-prog-comp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.editProgComp);
      showProgFormManualCard(progFormCompetencies[idx], idx);
    });
  });

  tbody.querySelectorAll("[data-delete-prog-comp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.deleteProgComp);
      progFormCompetencies.splice(idx, 1);
      updateProgFormCompCounts();
      renderProgFormCompsTable();
    });
  });
}

async function openProgramModal(programId = null) {
  editingProgramId = programId;
  showProgramError("");
  resetProgFormManualInputs();

  await ensureCompetencyLibraryLoaded();

  const title = document.getElementById("programFormModalLabel");
  const program = programs.find((row) => row.id === programId);

  if (title) {
    title.innerHTML = program
      ? `<i class="bi bi-pencil-square text-primary me-2"></i>Edit Program &amp; Competencies`
      : `<i class="bi bi-plus-circle-fill text-success me-2"></i>Add Program &amp; Configure Competencies`;
  }

  document.getElementById("programName").value = program?.name || "";
  document.getElementById("programTrainingFee").value = program?.trainingFee ?? "";
  document.getElementById("programSortOrder").value = program?.sortOrder ?? programs.length + 1;
  document.getElementById("programIsActive").checked = program ? program.isActive : true;

  // Set target category dropdown default
  const targetCatEl = document.getElementById("progFormTargetCategory");
  if (targetCatEl) targetCatEl.value = "core";
  populateProgFormLibDropdown();

  if (programId) {
    // Editing existing program: load its competencies
    try {
      const compData = await apiRequest(`/admin/api/programs/${programId}/competencies/`);
      progFormCompetencies = (compData.competencies || []).map((c) => ({
        id: c.id,
        category: c.category || "core",
        code: c.code || "",
        title: c.title || "",
        nominalHours: c.nominalHours || c.nominal_hours || 0,
        learningOutcomes: Array.isArray(c.learningOutcomes) ? c.learningOutcomes : (c.learning_outcomes || []),
        sortOrder: c.sortOrder || c.sort_order || 0,
      }));
    } catch {
      progFormCompetencies = [];
    }
  } else {
    // Adding new program: auto-preload standard Basic & Common competencies
    progFormCompetencies = [];
    preloadStandardCompetenciesForNewProg();
  }

  updateProgFormCompCounts();
  renderProgFormCompsTable();
  programModal?.show();
}

async function saveProgram() {
  const name = document.getElementById("programName").value.trim();
  const fee = document.getElementById("programTrainingFee").value;
  if (!name) {
    showProgramError("Please enter a program name.");
    return;
  }
  if (fee === "" || Number(fee) < 0) {
    showProgramError("Please enter a valid training fee.");
    return;
  }

  const payload = {
    name,
    training_fee: fee,
    sort_order: document.getElementById("programSortOrder").value,
    is_active: document.getElementById("programIsActive").checked,
    competencies: progFormCompetencies.map((c, idx) => ({
      category: c.category,
      code: c.code,
      title: c.title,
      nominal_hours: c.nominalHours,
      learning_outcomes: c.learningOutcomes,
      sort_order: idx + 1,
    })),
  };

  const saveBtn = document.getElementById("saveProgramButton");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving Program &amp; Sheets...';
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
    showAlert(editingProgramId ? "Program and competencies updated." : "Program registered and competencies configured successfully.");
  } catch (error) {
    showProgramError(error.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>Save Program &amp; Competencies';
    }
  }
}

// -----------------------------------------------------------------------------
// Standalone Program Competencies Management Modal
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
  const datalist = document.getElementById("customCompTitleDatalist");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "basic";
  const items = competencyLibrary[cat] || [];

  libSelect.innerHTML = `<option value="">-- Choose ${cat.toUpperCase()} unit from library (auto-fills inputs below) --</option>`;
  if (datalist) datalist.innerHTML = "";

  items.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    const codePrefix = item.code ? `${item.code} — ` : "";
    opt.textContent = `${codePrefix}${item.title} (${item.nominal_hours || 0} hrs)`;
    libSelect.appendChild(opt);

    if (datalist) {
      const dlOpt = document.createElement("option");
      dlOpt.value = item.title;
      datalist.appendChild(dlOpt);
    }
  });
}

function onCompLibrarySelectChange() {
  const catSelect = document.getElementById("compQuickCategory");
  const libSelect = document.getElementById("compLibrarySelect");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "basic";
  const selectedIdx = parseInt(libSelect.value, 10);
  if (Number.isNaN(selectedIdx)) return;

  const items = competencyLibrary[cat] || [];
  const selected = items[selectedIdx];
  if (!selected) return;

  const codeInput = document.getElementById("customCompCode");
  const titleInput = document.getElementById("customCompName");
  const hoursInput = document.getElementById("customCompHours");
  const outcomesInput = document.getElementById("customCompOutcomes");

  if (codeInput) codeInput.value = selected.code || "";
  if (titleInput) titleInput.value = selected.title || "";
  if (hoursInput) hoursInput.value = selected.nominal_hours || 40;
  if (outcomesInput) {
    const los = Array.isArray(selected.learning_outcomes) ? selected.learning_outcomes : [];
    outcomesInput.value = los.join("\n");
  }
}

function resetCustomCompInputs() {
  const editIndex = document.getElementById("editCompIndex");
  if (editIndex) editIndex.value = -1;

  const titleEl = document.getElementById("customCompTitle");
  if (titleEl) titleEl.textContent = "Add / Configure Competency Unit";

  const btnText = document.getElementById("customCompBtnText");
  if (btnText) btnText.textContent = "Add Unit";

  const codeInput = document.getElementById("customCompCode");
  const titleInput = document.getElementById("customCompName");
  const hoursInput = document.getElementById("customCompHours");
  const outcomesInput = document.getElementById("customCompOutcomes");
  const libSelect = document.getElementById("compLibrarySelect");

  if (codeInput) codeInput.value = "";
  if (titleInput) titleInput.value = "";
  if (hoursInput) hoursInput.value = 40;
  if (outcomesInput) outcomesInput.value = "";
  if (libSelect) libSelect.value = "";
}

function addFromLibrary() {
  const catSelect = document.getElementById("compQuickCategory");
  const libSelect = document.getElementById("compLibrarySelect");
  if (!catSelect || !libSelect) return;

  const cat = catSelect.value || "basic";
  const selectedIdx = parseInt(libSelect.value, 10);
  if (Number.isNaN(selectedIdx)) {
    const manualTitle = document.getElementById("customCompName")?.value?.trim();
    if (manualTitle) {
      applyCustomComp();
      return;
    }
    alert("Please select a competency from the dropdown or type a custom title below.");
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
    nominalHours: selected.nominal_hours || 40,
    learningOutcomes: Array.isArray(selected.learning_outcomes) ? [...selected.learning_outcomes] : [],
    sortOrder: currentCompetencies.length + 1,
  });

  resetCustomCompInputs();
  updateCompCountBadges();
  renderCompetenciesTable();
}

function showCustomCompForm(comp = null, index = -1) {
  const editIndex = document.getElementById("editCompIndex");
  if (editIndex) editIndex.value = index;

  const titleEl = document.getElementById("customCompTitle");
  if (titleEl) titleEl.textContent = comp ? `Edit Unit: ${comp.title}` : "Add / Configure Competency Unit";

  const btnText = document.getElementById("customCompBtnText");
  if (btnText) btnText.textContent = comp ? "Update Unit" : "Add Unit";

  const catSelect = document.getElementById("compQuickCategory");
  if (catSelect && comp?.category) {
    catSelect.value = comp.category;
    populateLibraryDropdown();
  }

  const codeInput = document.getElementById("customCompCode");
  const titleInput = document.getElementById("customCompName");
  const hoursInput = document.getElementById("customCompHours");
  const outcomesInput = document.getElementById("customCompOutcomes");

  if (codeInput) codeInput.value = comp?.code || "";
  if (titleInput) {
    titleInput.value = comp?.title || "";
    titleInput.focus();
  }
  if (hoursInput) hoursInput.value = comp?.nominalHours ?? 40;

  if (outcomesInput) {
    const los = comp?.learningOutcomes || [];
    outcomesInput.value = Array.isArray(los) ? los.join("\n") : "";
  }

  const card = document.getElementById("customCompCard");
  card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function applyCustomComp() {
  const titleInput = document.getElementById("customCompName");
  const title = (titleInput?.value || "").trim();
  if (!title) {
    alert("Please enter a competency title / descriptor.");
    titleInput?.focus();
    return;
  }
  const category = document.getElementById("compQuickCategory")?.value || "core";
  const code = (document.getElementById("customCompCode")?.value || "").trim();
  const nominalHours = parseInt(document.getElementById("customCompHours")?.value, 10) || 0;
  const rawOutcomes = document.getElementById("customCompOutcomes")?.value || "";
  const learningOutcomes = rawOutcomes
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const index = parseInt(document.getElementById("editCompIndex")?.value, 10);
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

  resetCustomCompInputs();
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

  resetCustomCompInputs();
  showCompAlert("");

  await ensureCompetencyLibraryLoaded();

  try {
    const compData = await apiRequest(`/admin/api/programs/${programId}/competencies/`);
    currentCompetencies = (compData.competencies || []).map((c) => ({
      id: c.id,
      category: c.category || "core",
      code: c.code || "",
      title: c.title || "",
      nominalHours: c.nominalHours || c.nominal_hours || 0,
      learningOutcomes: Array.isArray(c.learningOutcomes) ? c.learningOutcomes : (c.learning_outcomes || []),
      sortOrder: c.sortOrder || c.sort_order || 0,
    }));

    populateLibraryDropdown();
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

  // Program Form Modal Competency events
  document.getElementById("progFormTargetCategory")?.addEventListener("change", populateProgFormLibDropdown);
  document.getElementById("progFormLibSelect")?.addEventListener("change", onProgFormLibSelectChange);
  document.getElementById("btnProgFormAddLib")?.addEventListener("click", addProgFormUnitFromLib);
  document.getElementById("btnProgFormPreloadStandard")?.addEventListener("click", () => {
    const added = preloadStandardCompetenciesForNewProg();
    showAlert(`Pre-filled standard Basic & Common units (${added} added).`);
  });
  document.getElementById("btnProgFormClearInputs")?.addEventListener("click", resetProgFormManualInputs);
  document.getElementById("btnProgFormApplyManual")?.addEventListener("click", applyProgFormManualUnit);

  // Standalone Competencies Modal events
  document.querySelectorAll(".comp-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCompCategoryFilter = btn.dataset.category || "all";
      updateCategoryFilterButtons();
      renderCompetenciesTable();
    });
  });

  document.getElementById("compQuickCategory")?.addEventListener("change", populateLibraryDropdown);
  document.getElementById("compLibrarySelect")?.addEventListener("change", onCompLibrarySelectChange);
  document.getElementById("btnAddFromLibrary")?.addEventListener("click", addFromLibrary);
  document.getElementById("btnClearCustomComp")?.addEventListener("click", resetCustomCompInputs);
  document.getElementById("btnSaveCustomComp")?.addEventListener("click", applyCustomComp);
  document.getElementById("btnSaveProgramCompetencies")?.addEventListener("click", saveAllProgramCompetencies);

  loadSettings().catch((error) => showAlert(error.message, "danger"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSystemSettings);
} else {
  initSystemSettings();
}
