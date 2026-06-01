/**
 * Dynamic rows for TESDA assessment application tables (sections 3–6).
 */

import { isMonthYearField, toMonthInputValue } from "./month-year-input.js";

const MAX_ROWS = 20;

const TABLE_CONFIGS = {
  work: {
    prefix: "work",
    fields: [
      "company",
      "position",
      "inclusive_dates",
      "monthly_salary",
      "appointment_status",
      "years_experience",
    ],
  },
  training: {
    prefix: "training",
    fields: ["title", "venue", "inclusive_dates", "hours", "conducted_by"],
  },
  license: {
    prefix: "license",
    fields: ["title", "year_taken", "venue", "rating", "remarks", "expiry_date"],
  },
  competency: {
    prefix: "competency",
    fields: [
      "title",
      "qualification_level",
      "industry_sector",
      "certificate_number",
      "date_issued",
      "expiration_date",
    ],
  },
};

function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function buildFieldCell(config, field, index, values) {
  const name = `${config.prefix}_${field}_${index}`;
  const stored = values[field] || "";

  if (isMonthYearField(field)) {
    const monthVal = toMonthInputValue(stored);
    return `<td><input type="month" name="${name}" data-field="${field}" data-month-year="1" class="tesda-app-table__input tesda-app-table__input--month" value="${escapeAttr(monthVal)}" title="Select month and year only" /></td>`;
  }

  return `<td><input type="text" name="${name}" data-field="${field}" class="tesda-app-table__input" value="${escapeAttr(stored)}" /></td>`;
}

function buildRowHtml(config, index, values = {}) {
  const cells = config.fields
    .map((field) => buildFieldCell(config, field, index, values))
    .join("");
  return `<tr class="tesda-app-table__row">${cells}<td class="tesda-app-table__actions-cell text-center"><button type="button" class="btn btn-sm btn-link text-danger tesda-remove-row-btn p-0" title="Remove row" aria-label="Remove row"><i class="bi bi-trash" aria-hidden="true"></i></button></td></tr>`;
}

function reindexTable(tbody, config) {
  const rows = tbody.querySelectorAll("tr.tesda-app-table__row");
  rows.forEach((tr, index) => {
    config.fields.forEach((field) => {
      const input = tr.querySelector(`[data-field="${field}"]`);
      if (input) {
        input.name = `${config.prefix}_${field}_${index}`;
      }
    });
  });
  const canRemove = rows.length > 1;
  rows.forEach((tr) => {
    const btn = tr.querySelector(".tesda-remove-row-btn");
    if (btn) {
      btn.disabled = !canRemove;
      btn.classList.toggle("invisible", !canRemove);
    }
  });
  const addBtn = tbody
    .closest(".tesda-app-table-wrap")
    ?.querySelector(".tesda-add-row-btn");
  if (addBtn) {
    addBtn.disabled = rows.length >= MAX_ROWS;
  }
}

function addRow(tbody, config) {
  const rows = tbody.querySelectorAll("tr.tesda-app-table__row");
  if (rows.length >= MAX_ROWS) return;
  const index = rows.length;
  tbody.insertAdjacentHTML("beforeend", buildRowHtml(config, index));
  reindexTable(tbody, config);
  tbody.querySelector(`tr:last-child [data-field="${config.fields[0]}"]`)?.focus();
}

function removeRow(tbody, config, tr) {
  const rows = tbody.querySelectorAll("tr.tesda-app-table__row");
  if (rows.length <= 1) return;
  tr.remove();
  reindexTable(tbody, config);
}

export function reindexAllAssessmentTables(form) {
  form.querySelectorAll("[data-tesda-table]").forEach((tbody) => {
    const key = tbody.dataset.tesdaTable;
    const config = TABLE_CONFIGS[key];
    if (config) reindexTable(tbody, config);
  });
}

export function initAssessmentTables(form) {
  Object.entries(TABLE_CONFIGS).forEach(([key, config]) => {
    const tbody = form.querySelector(`[data-tesda-table="${key}"]`);
    if (!tbody) return;

    reindexTable(tbody, config);

    const wrap = tbody.closest(".tesda-app-table-wrap");
    wrap?.querySelector(".tesda-add-row-btn")?.addEventListener("click", () => {
      addRow(tbody, config);
    });

    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".tesda-remove-row-btn");
      if (!btn) return;
      const tr = btn.closest("tr");
      if (tr) removeRow(tbody, config, tr);
    });
  });

  form.addEventListener("submit", () => {
    reindexAllAssessmentTables(form);
  });
}
