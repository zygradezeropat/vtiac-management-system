/**
 * Training enrollment — change course / qualification with confirmation modal.
 */

export function initEnrollmentProgramChange(form) {
  const changeBtn = document.getElementById("program-change-btn");
  const cancelBtn = document.getElementById("program-cancel-btn");
  const doneBtn = document.getElementById("program-done-btn");
  const confirmChangeBtn = document.getElementById("program-confirm-change-btn");
  const viewEl = document.getElementById("program-display-view");
  const editEl = document.getElementById("program-edit-view");
  const hiddenInput = document.getElementById("field-selected-program");
  const selectEl = document.getElementById("field-selected-program-select");
  const nameEl = document.getElementById("program-display-name");
  const modalEl = document.getElementById("changeProgramConfirmModal");
  const modalCurrentProgram = document.getElementById("modal-current-program");

  if (
    !changeBtn ||
    !viewEl ||
    !editEl ||
    !hiddenInput ||
    !selectEl ||
    !nameEl ||
    !modalEl ||
    !confirmChangeBtn
  ) {
    return;
  }

  const confirmModal =
    window.bootstrap?.Modal?.getOrCreateInstance(modalEl) ?? null;

  let savedProgram = hiddenInput.value;

  function syncDisplay(program) {
    hiddenInput.value = program;
    nameEl.textContent = program;
    selectEl.value = program;
    if (modalCurrentProgram) {
      modalCurrentProgram.textContent = program;
    }
  }

  function showView() {
    viewEl.classList.remove("d-none");
    editEl.classList.add("d-none");
  }

  function showEdit() {
    selectEl.value = hiddenInput.value;
    viewEl.classList.add("d-none");
    editEl.classList.remove("d-none");
    selectEl.focus();
  }

  changeBtn.addEventListener("click", () => {
    if (modalCurrentProgram) {
      modalCurrentProgram.textContent = hiddenInput.value;
    }
    if (confirmModal) {
      confirmModal.show();
    }
  });

  confirmChangeBtn.addEventListener("click", () => {
    savedProgram = hiddenInput.value;
    confirmModal?.hide();
    showEdit();
  });

  cancelBtn.addEventListener("click", () => {
    syncDisplay(savedProgram);
    showView();
  });

  doneBtn.addEventListener("click", () => {
    const chosen = selectEl.value;
    if (chosen) {
      syncDisplay(chosen);
      savedProgram = chosen;
    }
    showView();
  });

  selectEl.addEventListener("change", () => {
    if (selectEl.value) {
      hiddenInput.value = selectEl.value;
    }
  });
}
