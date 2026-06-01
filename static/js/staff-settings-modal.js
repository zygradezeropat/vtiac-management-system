/**
 * Bootstrap modals for staff portal settings feedback.
 */

export function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function showSettingsModal({ title, message, variant = "success" }) {
  const modalEl = document.getElementById("settingsFeedbackModal");
  if (!modalEl || typeof bootstrap === "undefined") {
    window.alert(message);
    return;
  }

  const titleEl = document.getElementById("settingsFeedbackModalTitle");
  const messageEl = document.getElementById("settingsFeedbackModalMessage");
  const iconWrap = document.getElementById("settingsFeedbackModalIcon");
  const iconEl = document.getElementById("settingsFeedbackModalIconInner");

  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  const isError = variant === "error";
  if (iconWrap) {
    iconWrap.classList.toggle("portal-settings-modal__icon--error", isError);
    iconWrap.classList.toggle("portal-settings-modal__icon--success", !isError);
  }
  if (iconEl) {
    iconEl.className = isError
      ? "bi bi-exclamation-circle-fill"
      : "bi bi-check-circle-fill";
  }

  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

export async function postSettingsForm(url, formData) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-CSRFToken": getCsrfToken(),
      "X-Requested-With": "XMLHttpRequest",
    },
    body: formData,
    credentials: "same-origin",
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = { ok: false, message: "Unexpected server response." };
  }

  if (!response.ok && payload.ok !== true) {
    const message =
      payload.message ||
      (Array.isArray(payload.errors) ? payload.errors[0] : null) ||
      "Request failed. Please try again.";
    throw new Error(message);
  }

  return payload;
}
