/**
 * Month/year-only fields (HTML5 month picker ↔ mm/yyyy storage).
 */

export const MONTH_YEAR_FIELDS = new Set([
  "inclusive_dates",
  "expiry_date",
  "date_issued",
  "expiration_date",
]);

/** mm/yyyy or YYYY-MM → YYYY-MM (for input[type=month]) */
export function toMonthInputValue(stored) {
  const raw = String(stored ?? "").trim();
  if (!raw) return "";

  const slash = raw.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (slash) {
    const month = slash[1].padStart(2, "0");
    const year = slash[2];
    if (Number(month) >= 1 && Number(month) <= 12) {
      return `${year}-${month}`;
    }
    return "";
  }

  const iso = raw.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) {
      return raw;
    }
    return "";
  }

  return "";
}

/** YYYY-MM → mm/yyyy (for server storage / TESDA display) */
export function fromMonthInputValue(monthValue) {
  const raw = String(monthValue ?? "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})$/);
  if (iso) {
    return `${iso[2]}/${iso[1]}`;
  }

  const slash = raw.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (slash) {
    return `${slash[1].padStart(2, "0")}/${slash[2]}`;
  }

  return raw;
}

export function isMonthYearField(fieldName) {
  return MONTH_YEAR_FIELDS.has(fieldName);
}

function syncMonthInputDisplay(input) {
  if (!input || input.type !== "month") return;
  const converted = toMonthInputValue(input.getAttribute("value") || input.value);
  if (converted) {
    input.value = converted;
  } else if (input.value && !/^\d{4}-\d{2}$/.test(input.value)) {
    input.value = "";
  }
}

/** Before submit: write mm/yyyy into values the server expects. */
export function applyMonthYearValuesForSubmit(form) {
  form.querySelectorAll("input[data-month-year][type='month']").forEach((input) => {
    if (input.value) {
      input.value = fromMonthInputValue(input.value);
    }
  });
}

export function initMonthYearInputs(form) {
  form.querySelectorAll("input[data-month-year][type='month']").forEach(syncMonthInputDisplay);

  form.addEventListener(
    "submit",
    () => {
      applyMonthYearValuesForSubmit(form);
    },
    true
  );
}
