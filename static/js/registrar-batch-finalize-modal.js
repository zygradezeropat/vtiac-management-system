/**
 * Shared Bootstrap modal for confirming batch finalization.
 */

let confirmHandler = null;

function getModal() {
  const el = document.getElementById("batch-finalize-confirm-modal");
  if (!el || !window.bootstrap?.Modal) return null;
  return window.bootstrap.Modal.getOrCreateInstance(el);
}

export function initFinalizeBatchConfirmModal() {
  const modalEl = document.getElementById("batch-finalize-confirm-modal");
  const actionBtn = document.getElementById("batch-finalize-confirm-action");
  if (!modalEl || !actionBtn || modalEl.dataset.bound === "1") return;

  modalEl.dataset.bound = "1";
  const modal = getModal();

  actionBtn.addEventListener("click", async () => {
    if (!confirmHandler) return;
    const run = confirmHandler;
    confirmHandler = null;
    actionBtn.disabled = true;
    try {
      await run();
      modal?.hide();
    } catch (err) {
      window.alert(err?.message || "Could not finalize batch.");
    } finally {
      actionBtn.disabled = false;
    }
  });

  modalEl.addEventListener("hidden.bs.modal", () => {
    confirmHandler = null;
  });
}

/**
 * @param {{ courseName: string, batchLabel: string, studentCount: number }} batch
 * @param {() => void | Promise<void>} onConfirm
 */
export function showFinalizeBatchConfirm(batch, onConfirm) {
  initFinalizeBatchConfirmModal();

  const courseEl = document.getElementById("batch-finalize-confirm-course");
  const bodyEl = document.getElementById("batch-finalize-confirm-body");
  const count = batch.studentCount ?? 0;

  if (courseEl) {
    courseEl.textContent = `${batch.courseName} — ${batch.batchLabel || "Batch 1"}`;
  }
  if (bodyEl) {
    bodyEl.textContent = `This will lock the schedule and snapshot ${count} student${count === 1 ? "" : "s"}. You will not be able to edit it afterward.`;
  }

  confirmHandler = onConfirm;
  getModal()?.show();
}
