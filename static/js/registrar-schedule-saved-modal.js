/**
 * Success modal after saving a class schedule in Batching & Scheduling.
 */

function getModal() {
  const el = document.getElementById("schedule-saved-confirm-modal");
  if (!el || !window.bootstrap?.Modal) return null;
  return window.bootstrap.Modal.getOrCreateInstance(el);
}

/**
 * @param {{ courseName: string }} payload
 */
export function showScheduleSavedConfirm(payload) {
  const courseEl = document.getElementById("schedule-saved-confirm-course");
  if (courseEl) {
    courseEl.textContent = payload.courseName || "";
  }
  getModal()?.show();
}
