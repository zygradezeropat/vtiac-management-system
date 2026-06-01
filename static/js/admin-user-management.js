/**
 * Admin User Management — list, create, edit, and reset passwords.
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

const PAGE_SIZE = 10;

let users = [];
let totalUsers = 0;
let currentPage = 1;
let totalPages = 1;
let editingUserId = null;
let resetUserId = null;
let searchDebounce = null;

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

function accountTypeBadge(type) {
  const label = type === "staff" ? "Staff" : type === "student" ? "Student" : "Other";
  const cls = type === "staff" ? "admin-user-badge--staff" : "admin-user-badge--student";
  return `<span class="admin-user-badge ${cls}">${escapeHtml(label)}</span>`;
}

function statusBadge(active) {
  const cls = active ? "admin-user-badge--active" : "admin-user-badge--inactive";
  const label = active ? "Active" : "Inactive";
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
      <td>${accountTypeBadge(user.account_type)}</td>
      <td>${escapeHtml(user.role_label)}</td>
      <td class="text-center">${statusBadge(user.is_active)}</td>
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

function toggleRoleField() {
  const accountType = document.getElementById("userFormAccountType")?.value;
  const roleWrap = document.getElementById("userFormRoleWrap");
  if (roleWrap) {
    roleWrap.classList.toggle("d-none", accountType !== "staff");
  }
}

function openCreateModal() {
  editingUserId = null;
  showFormError("");
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
  toggleRoleField();
  userFormModal?.show();
}

function openEditModal(userId) {
  const user = users.find((u) => u.id === userId);
  if (!user) return;

  editingUserId = userId;
  showFormError("");
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
  toggleRoleField();
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
  const firstName = document.getElementById("userFormFirstName").value.trim();
  const lastName = document.getElementById("userFormLastName").value.trim();
  const email = document.getElementById("userFormEmail").value.trim();
  const password = document.getElementById("userFormPassword").value;

  if (!firstName || !lastName || !email) {
    showFormError("Please fill in all required fields.");
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    "X-CSRFToken": getCsrfToken(),
  };

  if (editingUserId) {
    const body = {
      first_name: firstName,
      last_name: lastName,
      email,
      is_active: document.getElementById("userFormActive").value === "true",
    };
    if (document.getElementById("userFormAccountType").value === "staff") {
      body.role = document.getElementById("userFormRole").value;
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
  } else {
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
  document.getElementById("userFormAccountType")?.addEventListener("change", toggleRoleField);

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
  bindEvents();
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
