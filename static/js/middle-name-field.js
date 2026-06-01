/**
 * Optional middle name — checkbox disables the input, clears its value, and saves empty.
 */

export function initMiddleNameField(options = {}) {
  const inputId = options.inputId || "field-middle-name";
  const checkboxId = options.checkboxId || "field-no-middle-name";
  const input = document.getElementById(inputId);
  const checkbox = document.getElementById(checkboxId);
  if (!input || !checkbox) {
    return {
      isNoMiddleName: () => false,
      getValue: () => "",
      prepareForSubmit: () => {},
    };
  }

  let savedValue = "";

  function applyState(noMiddle) {
    if (noMiddle) {
      if (input.value.trim()) savedValue = input.value;
      input.value = "";
      input.disabled = true;
      input.classList.add("text-muted");
      input.setAttribute("aria-disabled", "true");
    } else {
      input.disabled = false;
      input.classList.remove("text-muted");
      input.removeAttribute("aria-disabled");
      if (savedValue && !input.value.trim()) {
        input.value = savedValue;
      }
      savedValue = "";
    }
    options.onChange?.(noMiddle, (input.value || "").trim());
  }

  if (!input.value.trim()) {
    checkbox.checked = true;
    applyState(true);
  }

  checkbox.addEventListener("change", () => {
    applyState(checkbox.checked);
  });

  return {
    isNoMiddleName: () => checkbox.checked,
    getValue: () => (checkbox.checked ? "" : (input.value || "").trim()),
    prepareForSubmit: () => {
      if (checkbox.checked) {
        input.disabled = false;
        input.value = "";
      }
    },
  };
}
