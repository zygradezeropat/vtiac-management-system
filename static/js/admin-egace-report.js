/**
 * Shared E.G.A.C.E batch report (qualification filter + Actual / % table).
 * Used on admin dashboard and Institutional Reports Center.
 */

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

const EGACE_COLUMNS = ["enrolled", "graduated", "assessed", "certified", "employed"];

function renderEgaceMetricCells(row) {
  return EGACE_COLUMNS.map((key) => {
    const metric = row[key] || { actual: 0, percent: 0 };
    return `
      <td class="admin-egace-metric-cell">${metric.actual}</td>
      <td class="admin-egace-metric-cell">${metric.percent}%</td>
    `;
  }).join("");
}

function renderEgaceBatchRow(row, index) {
  const rowClass = row.isTotal
    ? "admin-egace-row--total"
    : index % 2 === 0
      ? "admin-egace-row--alt"
      : "";
  return `
    <tr class="${rowClass}">
      <th scope="row">${escapeHtml(row.label)}</th>
      ${renderEgaceMetricCells(row)}
    </tr>`;
}

function renderEgaceBatchReport(report, course, elements) {
  const { tbody, titleWrap, titleName } = elements;
  if (!tbody) return;

  const qualification = course || "";
  const courseReport = qualification ? report?.reports?.[qualification] : null;

  if (titleWrap && titleName) {
    if (qualification && courseReport) {
      titleWrap.hidden = false;
      titleName.textContent = qualification.toUpperCase();
    } else {
      titleWrap.hidden = true;
      titleName.textContent = "";
    }
  }

  if (!courseReport?.batches?.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center text-muted py-4">
          ${
            qualification
              ? "No batch data for this qualification yet."
              : "Select a qualification to view the E.G.A.C.E report."
          }
        </td>
      </tr>`;
    return;
  }

  const rows = [...courseReport.batches];
  if (courseReport.total) {
    rows.push(courseReport.total);
  }

  tbody.innerHTML = rows
    .map((row, index) => renderEgaceBatchRow(row, row.isTotal ? -1 : index))
    .join("");
}

function populateEgaceCourseFilter(report, select) {
  if (!select) return;

  const courses = report?.courses || [];
  if (!courses.length) {
    select.innerHTML = `<option value="">No qualifications with data</option>`;
    return;
  }

  select.innerHTML = courses
    .map(
      (course) =>
        `<option value="${escapeHtml(course)}">${escapeHtml(course)}</option>`
    )
    .join("");

  const defaultCourse = report?.defaultCourse || courses[0] || "";
  if (defaultCourse && courses.includes(defaultCourse)) {
    select.value = defaultCourse;
  }
}

/**
 * @param {object} report - egaceBatchReport payload from server
 * @param {{ filterId: string, tbodyId: string, titleWrapId?: string, titleNameId?: string }} ids
 */
export function initAdminEgaceReport(report, ids) {
  const select = document.getElementById(ids.filterId);
  const tbody = document.getElementById(ids.tbodyId);
  const titleWrap = ids.titleWrapId
    ? document.getElementById(ids.titleWrapId)
    : null;
  const titleName = ids.titleNameId
    ? document.getElementById(ids.titleNameId)
    : null;

  if (!tbody) return;

  const safeReport = report?.reports
    ? report
    : { courses: [], defaultCourse: "", reports: {} };

  populateEgaceCourseFilter(safeReport, select);

  const initialCourse = select?.value || safeReport.defaultCourse || "";
  renderEgaceBatchReport(safeReport, initialCourse, { tbody, titleWrap, titleName });

  if (select && !select.dataset.egaceBound) {
    select.dataset.egaceBound = "1";
    select.addEventListener("change", () => {
      renderEgaceBatchReport(safeReport, select.value, { tbody, titleWrap, titleName });
    });
  }
}
