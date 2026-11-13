/**
 * Admin User Management — list, create, edit, and reset passwords.
 */

import { initMiddleNameField } from "./middle-name-field.js";

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

const PAGE_SIZE = 10;
const PH_MOBILE_PATTERN = /^09\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let users = [];
let totalUsers = 0;
let currentPage = 1;
let totalPages = 1;
let editingUserId = null;
let resetUserId = null;
let searchDebounce = null;
let adminTrainerMiddleName = null;

const userFormModalEl = document.getElementById("userFormModal");
const resetPasswordModalEl = document.getElementById("resetPasswordModal");
const userFormModal = userFormModalEl ? new bootstrap.Modal(userFormModalEl) : null;
const resetPasswordModal = resetPasswordModalEl ? new bootstrap.Modal(resetPasswordModalEl) : null;

function showFormError(message) {
  const el = document.getElementById("userFormError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("d-none");
  } else {
    el.textContent = "";
    el.classList.add("d-none");
  }
}

function showResetError(message) {
  const el = document.getElementById("resetPasswordError");
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("d-none");
  } else {
    el.textContent = "";
    el.classList.add("d-none");
  }
}

function normalizePhilippineMobile(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits.length) return "09";
  if (digits.startsWith("9") && !digits.startsWith("09")) {
    digits = `0${digits}`;
  }
  if (!digits.startsWith("09")) {
    digits = digits.startsWith("0") ? `09${digits.slice(2)}` : `09${digits}`;
  }
  return `09${digits.slice(2, 11)}`;
}

function isTrainerCreateMode() {
  if (editingUserId) return false;
  const accountType = document.getElementById("userFormAccountType")?.value;
  const role = document.getElementById("userFormRole")?.value;
  return accountType === "staff" && role === "trainer";
}

function accountTypeBadge(user) {
  const isGraduate = typeof user === "object" ? (user.account_type === "graduate" || Boolean(user.is_graduated)) : user === "graduate";
  if (isGraduate) {
    const daysLeft = typeof user === "object" && user.days_remaining != null ? user.days_remaining : 365;
    const isExpired = typeof user === "object" && (user.retention_expired || daysLeft <= 0);
    const isWarning = !isExpired && daysLeft <= 60;
    const pillCls = isExpired
      ? "admin-user-retention-pill--expired"
      : isWarning
      ? "admin-user-retention-pill--warning"
      : "admin-user-retention-pill--ok";

    const pillText = isExpired
      ? `<i class="bi bi-exclamation-triangle-fill"></i> Expired (365d)`
      : `<i class="bi bi-hourglass-split"></i> ${daysLeft}d remaining`;

    const gradDateStr = typeof user === "object" && user.graduated_at_display ? `Grad: ${escapeHtml(user.graduated_at_display)}` : "Graduated";

    return `
      <div>
        <span class="admin-user-badge admin-user-badge--graduate">
          <i class="bi bi-mortarboard-fill me-1"></i>Graduate
        </span>
        <div class="admin-user-retention" title="Graduation 365-day active retention countdown">
          <span class="admin-user-retention-pill ${pillCls}">
            ${pillText}
          </span>
          <span class="admin-user-retention-date">${gradDateStr}</span>
        </div>
      </div>
    `;
  }

  const type = typeof user === "object" ? user.account_type : user;
  const label = type === "staff" ? "Staff" : type === "student" ? "Student" : "Other";
  const cls = type === "staff" ? "admin-user-badge--staff" : "admin-user-badge--student";
  return `<span class="admin-user-badge ${cls}">${escapeHtml(label)}</span>`;
}

function statusBadge(user) {
  const active = typeof user === "object" ? user.is_active : user;
  const isGraduate = typeof user === "object" && (user.account_type === "graduate" || Boolean(user.is_graduated));
  const isExpired = isGraduate && (user.retention_expired || (user.days_remaining != null && user.days_remaining <= 0));

  const cls = active ? "admin-user-badge--active" : "admin-user-badge--inactive";
  const label = active ? "Active" : "Inactive";

  if (isGraduate && isExpired && active) {
    return `
      <div class="d-flex flex-column align-items-center gap-1">
        <span class="admin-user-badge admin-user-badge--active">${label}</span>
        <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-1.5 py-0.5 text-2xs" style="font-size:0.65rem;" title="Account active period (365 days) has ended. Due for Inactive status.">
          <i class="bi bi-exclamation-circle-fill me-0.5"></i>Due Inactive
        </span>
      </div>
    `;
  }

  return `<span class="admin-user-badge ${cls}">${label}</span>`;
}

function renderUsersSummary() {
  const el = document.getElementById("usersResultSummary");
  if (!el) return;

  if (!totalUsers) {
    el.textContent = "";
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalUsers);

  if (totalUsers <= PAGE_SIZE) {
    el.textContent = `Showing ${totalUsers} user${totalUsers === 1 ? "" : "s"}.`;
    return;
  }

  el.textContent = `Showing ${start}–${end} of ${totalUsers} · Page ${currentPage} of ${totalPages}`;
}

function renderUsersPagination() {
  const nav = document.getElementById("usersPagination");
  if (!nav) return;

  if (totalUsers <= PAGE_SIZE) {
    nav.classList.add("hidden");
    nav.innerHTML = "";
    return;
  }

  nav.classList.remove("hidden");
  nav.innerHTML = `
    <button type="button" class="btn btn-sm btn-outline-secondary" data-users-page="prev" ${currentPage <= 1 ? "disabled" : ""}>
      Previous
    </button>
    <span class="admin-users-pagination__label">Page ${currentPage} of ${totalPages}</span>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-users-page="next" ${currentPage >= totalPages ? "disabled" : ""}>
      Next
    </button>
  `;
}

function renderUsersTable() {
  const tbody = document.getElementById("usersTableBody");
  const empty = document.getElementById("usersEmptyState");
  const tableCard = document.querySelector(".admin-users .admin-table-card");
  if (!tbody) return;

  renderUsersSummary();
  renderUsersPagination();

  if (!users.length) {
    tbody.innerHTML = "";
    empty?.classList.remove("hidden");
    tableCard?.classList.add("hidden");
    return;
  }

  empty?.classList.add("hidden");
  tableCard?.classList.remove("hidden");

  tbody.innerHTML = users
    .map(
      (user) => `
    <tr data-user-id="${user.id}">
      <td>${escapeHtml(user.full_name)}</td>
      <td>${escapeHtml(user.email)}</td>
      <td>${accountTypeBadge(user)}</td>
      <td>${escapeHtml(user.role_label || (user.is_graduated ? "Graduate" : "—"))}</td>
      <td class="text-center">${statusBadge(user)}</td>
      <td class="text-end">
        <div class="admin-users-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${user.id}">Edit</button>
          <button type="button" class="btn btn-sm btn-outline-primary" data-action="password" data-id="${user.id}">Reset password</button>
        </div>
      </td>
    </tr>
  `,
    )
    .join("");
}

async function fetchUsers(page = currentPage) {
  const q = document.getElementById("userSearchInput")?.value?.trim() || "";
  const accountType = document.getElementById("userAccountTypeFilter")?.value || "";
  const role = document.getElementById("userRoleFilter")?.value || "";
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (accountType) params.set("account_type", accountType);
  if (role) params.set("role", role);
  params.set("page", String(page));

  const res = await fetch(`/admin/api/users/?${params}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load users.");
  const data = await res.json();
  users = data.users || [];
  totalUsers = data.total ?? users.length;
  currentPage = data.page ?? page;
  totalPages = data.total_pages ?? 1;
  renderUsersTable();
}

function resetToFirstPage() {
  currentPage = 1;
  fetchUsers(1).catch(console.error);
}

function resetTrainerFields() {
  document.getElementById("adminTrainerFirstName").value = "";
  document.getElementById("adminTrainerLastName").value = "";
  document.getElementById("adminTrainerEmail").value = "";
  document.getElementById("adminTrainerPassword").value = "";
  document.getElementById("adminTrainerPasswordConfirm").value = "";
  document.getElementById("adminTrainerHighestNc").value = "";
  document.getElementById("adminTrainerOtherQual").value = "";
  document.getElementById("adminTrainerExperience").value = "";
  document.getElementById("adminTrainerRemarks").value = "";

  const phone = document.getElementById("adminTrainerPhone");
  if (phone) phone.value = "09";

  const middle = document.getElementById("adminTrainerMiddleName");
  const noMiddle = document.getElementById("adminTrainerNoMiddleName");
  if (middle) {
    middle.value = "";
    middle.disabled = false;
    middle.classList.remove("text-muted");
  }
  if (noMiddle) noMiddle.checked = false;

  document.querySelectorAll("[data-admin-trainer-qualification]").forEach((el) => {
    el.checked = false;
  });
  const otherCheck = document.getElementById("adminTrainerQualOther");
  const otherText = document.getElementById("adminTrainerOtherQual");
  if (otherCheck) otherCheck.checked = false;
  if (otherText) {
    otherText.value = "";
    otherText.disabled = true;
  }
}

function syncUserFormPanels() {
  const accountType = document.getElementById("userFormAccountType")?.value;
  const roleWrap = document.getElementById("userFormRoleWrap");
  const standard = document.getElementById("userFormStandardFields");
  const trainer = document.getElementById("userFormTrainerFields");
  const trainerMode = isTrainerCreateMode();

  if (roleWrap) {
    roleWrap.classList.toggle("d-none", accountType !== "staff");
  }

  standard?.classList.toggle("d-none", trainerMode);
  trainer?.classList.toggle("d-none", !trainerMode);

  const first = document.getElementById("userFormFirstName");
  const last = document.getElementById("userFormLastName");
  const email = document.getElementById("userFormEmail");
  const password = document.getElementById("userFormPassword");

  if (first) first.required = !trainerMode && !editingUserId;
  if (last) last.required = !trainerMode && !editingUserId;
  if (email) email.required = !trainerMode && !editingUserId;
  if (password) password.required = !trainerMode && !editingUserId;

  if (editingUserId) {
    const role = document.getElementById("userFormRole")?.value;
    const isTrainer = accountType === "staff" && role === "trainer";
    document.getElementById("userFormTrainerEditQuals")?.classList.toggle("d-none", !isTrainer);
  }
}

function getCheckedTrainerQualifications() {
  const qualifications = [];
  document.querySelectorAll("[data-admin-trainer-qualification]:checked").forEach((el) => {
    if (el.value) qualifications.push(el.value);
  });
  const otherCheck = document.getElementById("adminTrainerQualOther");
  const otherText = document.getElementById("adminTrainerOtherQual")?.value?.trim() || "";
  return {
    qualifications,
    qualification_other: Boolean(otherCheck?.checked),
    other_qualification: otherText,
    needsOtherText: Boolean(otherCheck?.checked && !otherText),
  };
}

function collectTrainerPayload() {
  adminTrainerMiddleName?.prepareForSubmit?.();
  const { qualifications, qualification_other, other_qualification } = getCheckedTrainerQualifications();

  return {
    first_name: document.getElementById("adminTrainerFirstName")?.value.trim() || "",
    middle_name: adminTrainerMiddleName?.getValue?.() ?? "",
    last_name: document.getElementById("adminTrainerLastName")?.value.trim() || "",
    email: document.getElementById("adminTrainerEmail")?.value.trim() || "",
    phone_number: document.getElementById("adminTrainerPhone")?.value.trim() || "",
    password: document.getElementById("adminTrainerPassword")?.value || "",
    password_confirm: document.getElementById("adminTrainerPasswordConfirm")?.value || "",
    qualifications,
    qualification_other,
    other_qualification,
    highest_tesda_nc: document.getElementById("adminTrainerHighestNc")?.value.trim() || "",
    years_experience: document.getElementById("adminTrainerExperience")?.value || "",
    remarks: document.getElementById("adminTrainerRemarks")?.value.trim() || "",
  };
}

function validateTrainerFormClient() {
  const data = collectTrainerPayload();
  const issues = [];

  if (!data.first_name) issues.push("first name");
  if (!data.last_name) issues.push("last name");
  if (!data.email || !EMAIL_PATTERN.test(data.email)) issues.push("a valid email");
  if (!PH_MOBILE_PATTERN.test(data.phone_number)) {
    issues.push("a valid phone number (11 digits starting with 09)");
  }
  if (!data.password || data.password.length < 8) issues.push("a password of at least 8 characters");
  if (data.password !== data.password_confirm) issues.push("matching passwords");
  const qualState = getCheckedTrainerQualifications();
  if (qualState.needsOtherText) {
    issues.push("other qualification details when Other is selected");
  } else if (
    !qualState.qualifications.length &&
    !(qualState.qualification_other && qualState.other_qualification)
  ) {
    issues.push("at least one program / qualification");
  }
  if (!data.highest_tesda_nc) issues.push("highest TESDA qualification");
  if (!data.years_experience) issues.push("years of experience");

  if (issues.length) {
    return `Please provide ${issues.join(", ")}.`;
  }
  return "";
}

function initTrainerFormBehaviors() {
  const trainerRoot = document.getElementById("userFormTrainerFields");
  if (!trainerRoot) return;

  adminTrainerMiddleName = initMiddleNameField({
    inputId: "adminTrainerMiddleName",
    checkboxId: "adminTrainerNoMiddleName",
  });

  trainerRoot.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      const isText = input.type === "text";
      input.type = isText ? "password" : "text";
      btn.setAttribute("aria-label", isText ? "Show password" : "Hide password");
    });
  });

  const phoneEl = document.getElementById("adminTrainerPhone");
  if (phoneEl) {
    const applyPhone = (raw) => {
      phoneEl.value = normalizePhilippineMobile(raw);
    };
    applyPhone(phoneEl.value || "09");
    phoneEl.addEventListener("input", (e) => applyPhone(e.target.value));
  }

  const otherCheck = document.getElementById("adminTrainerQualOther");
  const otherSpecify = document.getElementById("adminTrainerOtherQual");
  otherCheck?.addEventListener("change", () => {
    if (otherSpecify) {
      otherSpecify.disabled = !otherCheck.checked;
      if (!otherCheck.checked) otherSpecify.value = "";
    }
  });
}

let dynamicProgramsCache = null;

async function fetchDynamicPrograms() {
  try {
    const res = await fetch("/admin/api/system-settings/", { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.programs)) {
      dynamicProgramsCache = data.programs.filter((p) => p.isActive !== false).map((p) => p.name);
      return dynamicProgramsCache;
    }
  } catch (err) {
    console.warn("Failed to fetch dynamic programs:", err);
  }
  return null;
}

function updateTrainerQualificationGrids(programs, selectedQuals = []) {
  if (!Array.isArray(programs) || !programs.length) return;

  // 1. Update Trainer Edit Grid
  const editGrid = document.getElementById("trainerEditQualGrid");
  if (editGrid) {
    editGrid.innerHTML = programs
      .map(
        (prog, idx) => `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" value="${escapeHtml(prog)}" id="editTrainerQual${idx + 1}" data-edit-trainer-qualification ${selectedQuals.includes(prog) ? "checked" : ""} />
        <label class="form-check-label" for="editTrainerQual${idx + 1}">${escapeHtml(prog)}</label>
      </div>`
      )
      .join("");
  }

  // 2. Update Trainer Create Grid (preserving Other option)
  const createGrid = document.getElementById("adminTrainerQualGrid");
  if (createGrid) {
    const otherChecked = document.getElementById("adminTrainerQualOther")?.checked;
    createGrid.innerHTML = `
      ${programs
        .map(
          (prog, idx) => `
        <div class="form-check">
          <input class="form-check-input" type="checkbox" value="${escapeHtml(prog)}" id="adminTrainerQual${idx + 1}" data-admin-trainer-qualification />
          <label class="form-check-label" for="adminTrainerQual${idx + 1}">${escapeHtml(prog)}</label>
        </div>`
        )
        .join("")}
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="adminTrainerQualOther" data-admin-trainer-qual-other ${otherChecked ? "checked" : ""} />
        <label class="form-check-label" for="adminTrainerQualOther">Other (specify below)</label>
      </div>
    `;
    const newOther = document.getElementById("adminTrainerQualOther");
    const otherText = document.getElementById("adminTrainerOtherQual");
    newOther?.addEventListener("change", () => {
      if (otherText) {
        otherText.disabled = !newOther.checked;
        if (!newOther.checked) otherText.value = "";
      }
    });
  }
}

function openCreateModal() {
  editingUserId = null;
  showFormError("");
  const retCard = document.getElementById("userFormGraduateRetentionCard");
  if (retCard) {
    retCard.className = "d-none mb-3";
    retCard.innerHTML = "";
  }
  document.getElementById("userFormModalLabel").textContent = "Add User";
  document.getElementById("userFormId").value = "";
  document.getElementById("userFormFirstName").value = "";
  document.getElementById("userFormLastName").value = "";
  document.getElementById("userFormEmail").value = "";
  document.getElementById("userFormAccountType").value = "staff";
  document.getElementById("userFormRole").value = "registrar";
  document.getElementById("userFormActive").value = "true";
  document.getElementById("userFormPassword").value = "";
  document.getElementById("userFormPassword").required = true;
  document.getElementById("userFormAccountTypeWrap")?.classList.remove("d-none");
  document.getElementById("userFormActiveWrap")?.classList.add("d-none");
  document.getElementById("userFormPasswordWrap")?.classList.remove("d-none");
  resetTrainerFields();
  syncUserFormPanels();

  if (dynamicProgramsCache) {
    updateTrainerQualificationGrids(dynamicProgramsCache);
  } else {
    fetchDynamicPrograms().then((progs) => {
      if (progs) updateTrainerQualificationGrids(progs);
    });
  }

  userFormModal?.show();
}

function openEditModal(userId) {
  const user = users.find((u) => u.id === userId);
  if (!user) return;

  editingUserId = userId;
  showFormError("");

  const retCard = document.getElementById("userFormGraduateRetentionCard");
  if (retCard) {
    const isGraduate = user.account_type === "graduate" || Boolean(user.is_graduated);
    if (isGraduate) {
      const daysLeft = user.days_remaining != null ? user.days_remaining : 365;
      const isExpired = user.retention_expired || daysLeft <= 0;
      const cardBorder = isExpired ? "alert-danger border-danger" : "alert-success border-success";
      const badgeCls = isExpired ? "bg-danger text-white" : "bg-success text-white";
      const statusText = isExpired ? "365-Day Period Expired" : `${daysLeft} Days Remaining`;

      retCard.className = `alert ${cardBorder} p-3 rounded-3 mb-3`;
      retCard.innerHTML = `
        <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div>
            <div class="fw-bold d-flex align-items-center gap-1.5 ${isExpired ? 'text-danger' : 'text-success'}">
              <i class="bi bi-mortarboard-fill"></i> Graduated Student Account
            </div>
            <div class="small text-muted mt-0.5">
              Graduation Date: <strong>${escapeHtml(user.graduated_at_display || "—")}</strong> · 365-Day Active Retention
            </div>
          </div>
          <div>
            <span class="badge ${badgeCls} px-2.5 py-1.5 rounded-pill fs-7">
              <i class="bi bi-hourglass-split me-1"></i>${statusText}
            </span>
          </div>
        </div>
        <div class="mt-2 small text-secondary">
          ${isExpired
            ? 'This graduate account has exceeded the 365-day active retention period. Admin can specify this account to receive <strong>Inactive</strong> status below.'
            : 'Graduated students retain active portal access for 365 days after graduation. Admin can adjust status to <strong>Inactive</strong> when appropriate.'}
        </div>
        <div class="mt-2 pt-2 border-top d-flex gap-2">
          <button type="button" class="btn btn-sm ${user.is_active ? 'btn-outline-danger' : 'btn-outline-success'}" id="quickToggleActiveBtn">
            <i class="bi ${user.is_active ? 'bi-person-x-fill' : 'bi-person-check-fill'} me-1"></i>${user.is_active ? 'Specify Status as Inactive' : 'Set Status as Active'}
          </button>
        </div>
      `;
      retCard.classList.remove("d-none");

      document.getElementById("quickToggleActiveBtn")?.addEventListener("click", () => {
        const activeSelect = document.getElementById("userFormActive");
        if (activeSelect) {
          activeSelect.value = activeSelect.value === "true" ? "false" : "true";
          const isNowActive = activeSelect.value === "true";
          const btn = document.getElementById("quickToggleActiveBtn");
          if (btn) {
            btn.className = `btn btn-sm ${isNowActive ? 'btn-outline-danger' : 'btn-outline-success'}`;
            btn.innerHTML = `<i class="bi ${isNowActive ? 'bi-person-x-fill' : 'bi-person-check-fill'} me-1"></i>${isNowActive ? 'Specify Status as Inactive' : 'Set Status as Active'}`;
          }
        }
      });
    } else {
      retCard.className = "d-none mb-3";
      retCard.innerHTML = "";
    }
  }

  document.getElementById("userFormModalLabel").textContent = "Edit User";
  document.getElementById("userFormId").value = String(user.id);
  document.getElementById("userFormFirstName").value = user.first_name;
  document.getElementById("userFormLastName").value = user.last_name;
  document.getElementById("userFormEmail").value = user.email;
  document.getElementById("userFormAccountType").value = user.account_type;
  document.getElementById("userFormRole").value = user.role || "registrar";
  document.getElementById("userFormActive").value = user.is_active ? "true" : "false";
  document.getElementById("userFormPassword").value = "";
  document.getElementById("userFormPassword").required = false;
  document.getElementById("userFormAccountTypeWrap")?.classList.add("d-none");
  document.getElementById("userFormActiveWrap")?.classList.remove("d-none");
  document.getElementById("userFormPasswordWrap")?.classList.add("d-none");

  const isTrainer = user.account_type === "staff" && user.role === "trainer";
  const editQualsWrap = document.getElementById("userFormTrainerEditQuals");
  if (editQualsWrap) {
    editQualsWrap.classList.toggle("d-none", !isTrainer);
    const userQuals = Array.isArray(user.qualifications) ? user.qualifications : [];
    if (dynamicProgramsCache) {
      updateTrainerQualificationGrids(dynamicProgramsCache, userQuals);
    } else {
      fetchDynamicPrograms().then((progs) => {
        if (progs) {
          updateTrainerQualificationGrids(progs, userQuals);
        } else {
          document.querySelectorAll("[data-edit-trainer-qualification]").forEach((cb) => {
            cb.checked = userQuals.includes(cb.value);
          });
        }
      });
    }
  }

  syncUserFormPanels();
  userFormModal?.show();
}

function openResetPasswordModal(userId) {
  const user = users.find((u) => u.id === userId);
  if (!user) return;
  resetUserId = userId;
  showResetError("");
  document.getElementById("resetPasswordUserLabel").textContent = `Set a new password for ${user.full_name} (${user.email}).`;
  document.getElementById("resetPasswordInput").value = "";
  resetPasswordModal?.show();
}

async function submitUserForm() {
  showFormError("");
  const headers = {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
  };

  if (editingUserId) {
    const firstName = document.getElementById("userFormFirstName").value.trim();
    const lastName = document.getElementById("userFormLastName").value.trim();
    const email = document.getElementById("userFormEmail").value.trim();

    if (!firstName || !lastName || !email) {
      showFormError("Please fill in all required fields.");
      return;
    }

    const body = {
      first_name: firstName,
      last_name: lastName,
      email,
      is_active: document.getElementById("userFormActive").value === "true",
    };
    if (document.getElementById("userFormAccountType").value === "staff") {
      body.role = document.getElementById("userFormRole").value;
      if (body.role === "trainer") {
        const quals = [];
        document.querySelectorAll("[data-edit-trainer-qualification]:checked").forEach((el) => {
          if (el.value) quals.push(el.value);
        });
        body.qualifications = quals;
      }
    }
    const res = await fetch(`/admin/api/users/${editingUserId}/`, {
      method: "PATCH",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showFormError(data.error || "Could not update user.");
      return;
    }
  } else if (isTrainerCreateMode()) {
    const clientError = validateTrainerFormClient();
    if (clientError) {
      showFormError(clientError);
      return;
    }

    const trainer = collectTrainerPayload();
    const res = await fetch("/admin/api/users/create/", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify({
        account_type: "staff",
        role: "trainer",
        trainer,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showFormError(data.error || "Could not create trainer.");
      return;
    }
  } else {
    const firstName = document.getElementById("userFormFirstName").value.trim();
    const lastName = document.getElementById("userFormLastName").value.trim();
    const email = document.getElementById("userFormEmail").value.trim();
    const password = document.getElementById("userFormPassword").value;

    if (!firstName || !lastName || !email) {
      showFormError("Please fill in all required fields.");
      return;
    }
    if (!password) {
      showFormError("Password is required for new users.");
      return;
    }

    const body = {
      account_type: document.getElementById("userFormAccountType").value,
      first_name: firstName,
      last_name: lastName,
      email,
      password,
      role: document.getElementById("userFormRole").value,
    };
    const res = await fetch("/admin/api/users/create/", {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showFormError(data.error || "Could not create user.");
      return;
    }
  }

  userFormModal?.hide();
  await fetchUsers();
}

async function submitResetPassword() {
  showResetError("");
  const password = document.getElementById("resetPasswordInput").value;
  if (!password) {
    showResetError("Enter a new password.");
    return;
  }

  const res = await fetch(`/admin/api/users/${resetUserId}/reset-password/`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (!res.ok) {
    showResetError(data.error || "Could not reset password.");
    return;
  }

  resetPasswordModal?.hide();
}

function bindEvents() {
  document.getElementById("addUserButton")?.addEventListener("click", openCreateModal);
  document.getElementById("userFormSubmit")?.addEventListener("click", submitUserForm);
  document.getElementById("resetPasswordSubmit")?.addEventListener("click", submitResetPassword);
  document.getElementById("userFormAccountType")?.addEventListener("change", syncUserFormPanels);
  document.getElementById("userFormRole")?.addEventListener("change", syncUserFormPanels);

  document.getElementById("userSearchInput")?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(resetToFirstPage, 300);
  });

  document.getElementById("userAccountTypeFilter")?.addEventListener("change", resetToFirstPage);
  document.getElementById("userRoleFilter")?.addEventListener("change", resetToFirstPage);

  document.getElementById("usersPagination")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-users-page]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.usersPage === "prev" && currentPage > 1) {
      fetchUsers(currentPage - 1).catch(console.error);
    }
    if (btn.dataset.usersPage === "next" && currentPage < totalPages) {
      fetchUsers(currentPage + 1).catch(console.error);
    }
  });

  document.getElementById("usersTableBody")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === "edit") openEditModal(id);
    if (btn.dataset.action === "password") openResetPasswordModal(id);
  });
}

export function initAdminUserManagement() {
  if (!document.getElementById("usersTableBody")) return;
  initTrainerFormBehaviors();
  bindEvents();
  fetchDynamicPrograms().catch(() => {});
  fetchUsers().catch((err) => {
    console.error(err);
    const tbody = document.getElementById("usersTableBody");
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-danger py-4">Could not load users.</td></tr>';
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminUserManagement);
} else {
  initAdminUserManagement();
}
