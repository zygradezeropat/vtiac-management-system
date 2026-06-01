/**
 * Admin System Settings — NC programs, fees, fiscal year, enrollment toggle.
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

const alertEl = document.getElementById("systemSettingsAlert");
const programModalEl = document.getElementById("programFormModal");
const programModal = programModalEl ? new bootstrap.Modal(programModalEl) : null;

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
        <td colspan="6" class="text-center text-muted py-4">No programs configured yet.</td>
      </tr>`;
    return;
  }

  tbody.innerHTML = programs
    .map((program) => {
      const status = program.isActive
        ? '<span class="admin-user-badge admin-user-badge--active">Active</span>'
        : '<span class="admin-user-badge admin-user-badge--inactive">Inactive</span>';
      return `
        <tr>
          <td>${escapeHtml(program.name)}</td>
          <td>${escapeHtml(NC_LEVEL_LABELS[program.ncLevel] || "Other")}</td>
          <td class="text-end">${formatPeso(program.trainingFee)}</td>
          <td class="text-center">${Number(program.sortOrder) || 0}</td>
          <td class="text-center">${status}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-light" data-edit-program="${program.id}">Edit</button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-edit-program]").forEach((button) => {
    button.addEventListener("click", () => openProgramModal(Number(button.dataset.editProgram)));
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

  programModal?.show();
}

async function loadSettings() {
  const data = await apiRequest("/admin/api/system-settings/");
  programs = data.programs || [];
  fillGeneralSettings(data.settings || {});
  renderProgramsTable();
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

async function saveProgram() {
  const payload = {
    name: document.getElementById("programName").value.trim(),
    training_fee: document.getElementById("programTrainingFee").value,
    sort_order: document.getElementById("programSortOrder").value,
    is_active: document.getElementById("programIsActive").checked,
  };

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

function initSystemSettings() {
  document.getElementById("saveGeneralSettingsBtn")?.addEventListener("click", saveGeneralSettings);
  document.getElementById("addProgramButton")?.addEventListener("click", () => openProgramModal());
  document.getElementById("saveProgramButton")?.addEventListener("click", saveProgram);

  loadSettings().catch((error) => showAlert(error.message, "danger"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSystemSettings);
} else {
  initSystemSettings();
}
