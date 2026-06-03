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

function formatStudentLine(student) {
  const first = (student.firstName || student.first_name || "").trim();
  const last = (student.lastName || student.last_name || "").trim();
  return [first, last].filter(Boolean).join(" ") || "—";
}

/**
 * @param {{ courseName: string, batchLabel: string, studentCount: number, students?: Array<{firstName?: string, lastName?: string}> }} batch
 * @param {() => void | Promise<void>} onConfirm
 */
export function showFinalizeBatchConfirm(batch, onConfirm) {
  initFinalizeBatchConfirmModal();

  const courseEl = document.getElementById("batch-finalize-confirm-course");
  const bodyEl = document.getElementById("batch-finalize-confirm-body");
  const listEl = document.getElementById("batch-finalize-confirm-students");
  const students = Array.isArray(batch.students) ? batch.students : [];
  const count = batch.studentCount ?? students.length ?? 0;

  if (courseEl) {
    courseEl.textContent = `${batch.courseName} — ${batch.batchLabel || "Batch 1"}`;
  }
  if (bodyEl) {
    bodyEl.textContent =
      `This will lock the schedule and assign class times to every unassigned approved student listed below (${count}). You will not be able to edit the batch afterward.`;
  }
  if (listEl) {
    if (students.length) {
      listEl.innerHTML = students
        .map((s) => `<li><i class="bi bi-person-fill me-1" aria-hidden="true"></i>${formatStudentLine(s)}</li>`)
        .join("");
      listEl.classList.remove("d-none");
    } else {
      listEl.innerHTML = "";
      listEl.classList.add("d-none");
    }
  }

  confirmHandler = onConfirm;
  getModal()?.show();
}
