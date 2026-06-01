/**
 * Portal notification bell — all roles (student, registrar, cashier, trainer, admin).
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

function categoryIcon(category) {
  switch (category) {
    case "document_approved":
    case "documents_released":
      return "bi-check-circle-fill text-success";
    case "document_rejected":
      return "bi-x-circle-fill text-danger";
    case "enrollment_requirements":
      return "bi-folder2-open text-primary";
    default:
      return "bi-bell text-secondary";
  }
}

export function initPortalNotifications() {
  const btn = document.getElementById("portalNotifyBtn");
  const panel = document.getElementById("portalNotificationPanel");
  const listEl = document.getElementById("portalNotificationList");
  const badgeEl = document.getElementById("portalNotificationBadge");
  const markAllBtn = document.getElementById("portalMarkAllReadBtn");

  if (!btn || !panel || !listEl) return;

  let open = false;

  function setOpen(next) {
    open = next;
    btn.setAttribute("aria-expanded", String(open));
    panel.classList.toggle("is-open", open);
    panel.classList.toggle("hidden", !open);
  }

  function updateBadge(count) {
    if (!badgeEl) return;
    const n = Number(count) || 0;
    if (n > 0) {
      badgeEl.textContent = n > 99 ? "99+" : String(n);
      badgeEl.classList.remove("d-none");
    } else {
      badgeEl.classList.add("d-none");
    }
  }

  function renderList(notifications) {
    if (!notifications?.length) {
      listEl.innerHTML =
        '<p class="portal-notify-empty text-muted small mb-0 px-3 py-4 text-center">No notifications yet.</p>';
      return;
    }

    listEl.innerHTML = notifications
      .map((n) => {
        const unread = !n.isRead;
        const link = n.linkUrl
          ? `<a href="${escapeHtml(n.linkUrl)}" class="portal-notify-item__link stretched-link"></a>`
          : "";
        return `<article class="portal-notify-item${unread ? " portal-notify-item--unread" : ""}" data-id="${n.id}">
          <div class="portal-notify-item__icon" aria-hidden="true">
            <i class="bi ${categoryIcon(n.category)}"></i>
          </div>
          <div class="portal-notify-item__body">
            <p class="portal-notify-item__title mb-0">${escapeHtml(n.title)}</p>
            <p class="portal-notify-item__message mb-0">${escapeHtml(n.message)}</p>
            <p class="portal-notify-item__time mb-0">${escapeHtml(n.createdAt)}</p>
          </div>
          ${link}
        </article>`;
      })
      .join("");
  }

  async function loadNotifications() {
    const res = await fetch("/api/notifications/", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = await res.json();
    updateBadge(data.unreadCount);
    renderList(data.notifications);
  }

  async function markRead(id) {
    await fetch(`/api/notifications/${id}/read/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    await loadNotifications();
  }

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    await loadNotifications();
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(!open);
    if (open) loadNotifications();
  });

  markAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    markAllRead();
  });

  listEl.addEventListener("click", (e) => {
    const item = e.target.closest(".portal-notify-item");
    if (!item) return;
    const id = item.dataset.id;
    if (id && item.classList.contains("portal-notify-item--unread")) {
      markRead(id);
    }
  });

  document.addEventListener("click", (e) => {
    if (!open) return;
    if (e.target.closest(".portal-notify-wrap")) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) setOpen(false);
  });

  loadNotifications();
  window.setInterval(loadNotifications, 60000);
}

document.addEventListener("DOMContentLoaded", () => {
  initPortalNotifications();
});
