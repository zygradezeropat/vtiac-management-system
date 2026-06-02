const PAGE_SIZE = 10;

const searchEl = document.getElementById("student-search");
const programEl = document.getElementById("filter-program");
const batchEl = document.getElementById("filter-batch");
const scheduleEl = document.getElementById("filter-schedule");
const tbody = document.getElementById("students-table-body");
const emptyFilterEl = document.getElementById("students-empty-filter");
const paginationEl = document.getElementById("students-pagination");

let currentPage = 1;

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowMatchesFilters(row) {
  const query = (searchEl?.value || "").trim().toLowerCase();
  const program = programEl?.value || "";
  const batch = batchEl?.value || "";
  const schedule = scheduleEl?.value || "";

  const haystack = row.getAttribute("data-search") || "";
  const rowProgram = row.getAttribute("data-program") || "";
  const rowBatch = row.getAttribute("data-batch") || "";
  const rowSchedule = row.getAttribute("data-schedule") || "";

  const matchesSearch = !query || haystack.includes(query);
  const matchesProgram = !program || rowProgram === program;
  const matchesBatch = !batch || rowBatch === batch;
  const matchesSchedule = !schedule || rowSchedule === schedule;

  return matchesSearch && matchesProgram && matchesBatch && matchesSchedule;
}

function getMatchingRows() {
  if (!tbody) return [];
  return [...tbody.querySelectorAll("tr[data-search]")].filter(rowMatchesFilters);
}

function renderPagination(totalRows, page, totalPages) {
  if (!paginationEl) return;

  if (totalRows <= PAGE_SIZE) {
    paginationEl.classList.add("d-none");
    paginationEl.innerHTML = "";
    return;
  }

  paginationEl.classList.remove("d-none");
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalRows);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";

  paginationEl.innerHTML = `
    <span class="trainer-pagination__label">Showing ${start}–${end} of ${totalRows}</span>
    <div class="trainer-pagination__controls">
      <button type="button" class="btn btn-sm btn-outline-secondary students-page-prev" ${prevDisabled}>Previous</button>
      <span class="trainer-pagination__page">Page ${page} of ${totalPages}</span>
      <button type="button" class="btn btn-sm btn-outline-secondary students-page-next" ${nextDisabled}>Next</button>
    </div>
  `;
}

function applyStudentFilters(resetPage = false) {
  if (!tbody) return;

  if (resetPage) currentPage = 1;

  const matchingRows = getMatchingRows();
  const totalPages = Math.max(1, Math.ceil(matchingRows.length / PAGE_SIZE) || 1);
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  tbody.querySelectorAll("tr[data-search]").forEach((row) => {
    row.classList.add("hidden");
  });

  const start = (currentPage - 1) * PAGE_SIZE;
  matchingRows.slice(start, start + PAGE_SIZE).forEach((row) => {
    row.classList.remove("hidden");
  });

  renderPagination(matchingRows.length, currentPage, totalPages);

  if (emptyFilterEl) {
    const hasActiveFilter = Boolean(
      (searchEl?.value || "").trim() ||
        programEl?.value ||
        batchEl?.value ||
        scheduleEl?.value
    );
    emptyFilterEl.classList.toggle("hidden", matchingRows.length > 0 || !hasActiveFilter);
  }
}

if (tbody) {
  [searchEl, programEl, batchEl, scheduleEl].forEach((el) => {
    if (el) el.addEventListener("input", () => applyStudentFilters(true));
    if (el && el.tagName === "SELECT") el.addEventListener("change", () => applyStudentFilters(true));
  });

  paginationEl?.addEventListener("click", (event) => {
    const prev = event.target.closest(".students-page-prev");
    const next = event.target.closest(".students-page-next");
    if (prev && currentPage > 1) {
      currentPage -= 1;
      applyStudentFilters(false);
    } else if (next) {
      const totalPages = Math.max(1, Math.ceil(getMatchingRows().length / PAGE_SIZE));
      if (currentPage < totalPages) {
        currentPage += 1;
        applyStudentFilters(false);
      }
    }
  });

  applyStudentFilters(true);
}

function loadAttendanceRoster() {
  const rosterEl = document.getElementById("attendance-roster-data");
  if (!rosterEl) return [];
  try {
    return JSON.parse(rosterEl.textContent);
  } catch {
    return [];
  }
}

function loadAttendanceMeta() {
  const metaEl = document.getElementById("attendance-print-meta");
  if (!metaEl) return { trainer: "Trainer" };
  try {
    return JSON.parse(metaEl.textContent);
  } catch {
    return { trainer: "Trainer" };
  }
}

function todayDisplay() {
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

function fieldLine(value, minWidth = "10rem") {
  const text = (value || "").trim();
  if (text) {
    return `<span class="field-filled">${escapeHtml(text)}</span>`;
  }
  return `<span class="field-blank" style="min-width:${minWidth}"></span>`;
}

function programInfo(meta, course) {
  const programs = meta?.programs || {};
  return programs[course] || {};
}

function buildDailyAttendanceHeader(course, meta) {
  const info = programInfo(meta, course);
  const trainer = meta?.trainer || "Trainer";

  return `
    <h1 class="daily-sheet__title">TRAINEES DAILY ATTENDANCE SHEET</h1>
    <div class="daily-sheet__meta">
      <p class="daily-sheet__row">
        <span class="daily-sheet__label">Name of TVET Provider:</span>
        ${fieldLine(meta?.tvet_provider, "14rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Qualification/Program:</span>
        ${fieldLine(course, "14rem")}
      </p>
      <p class="daily-sheet__row">
        <span class="daily-sheet__label">Date Start:</span>
        ${fieldLine(info.date_start, "7rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Date End:</span>
        ${fieldLine(info.date_end, "7rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Duration (No. of Training Hours based on the Schedule of Cost):</span>
        ${fieldLine(info.duration, "10rem")}
      </p>
      <p class="daily-sheet__row">
        <span class="daily-sheet__label">Name of Trainer:</span>
        ${fieldLine(trainer, "12rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">NTTC No.</span>
        ${fieldLine(meta?.nttc_no, "6rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Validity Date:</span>
        ${fieldLine(meta?.nttc_validity, "6rem")}
      </p>
      <p class="daily-sheet__row">
        <span class="daily-sheet__label">Date:</span>
        ${fieldLine(todayDisplay(), "8rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Delivery Mode:</span>
        ${fieldLine(info.delivery_mode, "7rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Location of Training:</span>
        ${fieldLine(info.location || meta?.school_address, "12rem")}
      </p>
    </div>`;
}

function buildDailyAttendanceTableRows(students) {
  return students
    .map(
      (student, index) => `
      <tr>
        <td class="col-no">${index + 1}</td>
        <td class="col-name">${escapeHtml(student.name)}</td>
        <td class="col-contact">${escapeHtml(student.contact)}</td>
        <td class="col-email">${escapeHtml(student.email)}</td>
        <td class="col-time"></td>
        <td class="col-sign"></td>
        <td class="col-time"></td>
        <td class="col-sign"></td>
      </tr>`
    )
    .join("");
}

function buildDailyAttendanceFooter(trainerName) {
  const name = (trainerName || "").trim() || "—";
  return `
    <div class="daily-sheet__signatures">
      <div class="daily-sheet__sig-block">
        <p class="daily-sheet__sig-label">Certified by:</p>
        <div class="daily-sheet__sig-line">
          <span class="daily-sheet__sig-printed-name">${escapeHtml(name)}</span>
        </div>
        <p class="daily-sheet__sig-caption">Signature of the Trainer Over Printed Name</p>
      </div>
      <div class="daily-sheet__sig-block">
        <p class="daily-sheet__sig-label">Approved by:</p>
        <div class="daily-sheet__sig-line"></div>
        <p class="daily-sheet__sig-caption">Signature Over printed Name of School Administrator/Registrar)</p>
      </div>
    </div>`;
}

function buildDailyAttendancePages(course, students, meta) {
  const sorted = [...students].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );

  return `
    <section class="daily-attendance-page">
      ${buildDailyAttendanceHeader(course, meta)}
      <table class="daily-attendance-table" cellspacing="0" cellpadding="0">
        <thead>
          <tr>
            <th rowspan="2" class="col-no">NO</th>
            <th rowspan="2" class="col-name">NAME</th>
            <th rowspan="2" class="col-contact">CONTACT NUMBER</th>
            <th rowspan="2" class="col-email">EMAIL ADDRESS</th>
            <th colspan="4" class="col-daily-log">Daily Log</th>
          </tr>
          <tr>
            <th class="col-time">Time In</th>
            <th class="col-sign">Signature</th>
            <th class="col-time">Time Out</th>
            <th class="col-sign">Signature</th>
          </tr>
        </thead>
        <tbody>
          ${buildDailyAttendanceTableRows(sorted)}
        </tbody>
      </table>
      ${buildDailyAttendanceFooter(meta?.trainer)}
    </section>`;
}

const DAILY_ATTENDANCE_PRINT_STYLES = `
  @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap");
  @page { size: landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Poppins", system-ui, -apple-system, sans-serif;
    margin: 0;
    color: #000;
    font-size: 11px;
  }
  .daily-attendance-page {
    page-break-after: always;
  }
  .daily-attendance-page:last-child {
    page-break-after: auto;
  }
  .daily-sheet__title {
    text-align: center;
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 12px;
    letter-spacing: 0.02em;
    background: #548235;
    color: #000;
    padding: 10px 8px;
    border: 1px solid #375623;
  }
  .daily-sheet__meta {
    margin-bottom: 10px;
  }
  .daily-sheet__row {
    margin: 0 0 8px;
    line-height: 1.5;
  }
  .daily-sheet__label {
    font-weight: 600;
  }
  .daily-sheet__label--spaced {
    margin-left: 1rem;
  }
  .field-filled {
    display: inline;
    font-weight: 400;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .field-blank {
    display: inline-block;
    border-bottom: 1px solid #000;
    vertical-align: bottom;
    height: 1.1em;
  }
  .daily-sheet__page-note {
    text-align: right;
    font-size: 10px;
    margin: 0 0 6px;
    color: #334155;
  }
  .daily-attendance-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .daily-attendance-table th,
  .daily-attendance-table td {
    border: 1px solid #000;
    padding: 4px 6px;
    vertical-align: middle;
  }
  .daily-attendance-table thead tr:first-child th {
    background: #70ad47;
    font-weight: 700;
    text-align: center;
    font-size: 10px;
    color: #000;
  }
  .daily-attendance-table thead tr:last-child th {
    background: #a9d08e;
    font-weight: 700;
    text-align: center;
    font-size: 10px;
    color: #000;
  }
  .col-no { width: 4%; text-align: center; }
  .col-name { width: 22%; text-align: left; }
  .col-contact { width: 12%; text-align: center; }
  .col-email { width: 18%; text-align: left; font-size: 10px; }
  .col-daily-log { text-align: center; }
  .col-time { width: 8%; }
  .col-sign { width: 14%; }
  .daily-attendance-table tbody td {
    height: 26px;
    font-size: 10px;
    background: #fff;
  }
  .daily-attendance-table tbody .col-no {
    text-align: center;
    font-weight: 600;
    background: #e2efda;
  }
  .daily-attendance-table tbody .col-sign {
    background: #e2efda;
  }
  .daily-sheet__signatures {
    display: flex;
    justify-content: space-between;
    gap: 2rem;
    margin-top: 18px;
  }
  .daily-sheet__sig-block {
    flex: 1;
    max-width: 48%;
  }
  .daily-sheet__sig-label {
    margin: 0 0 28px;
    font-weight: 600;
  }
  .daily-sheet__sig-line {
    border-bottom: 1px solid #000;
    min-height: 2.25rem;
    margin-bottom: 4px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 3px;
  }
  .daily-sheet__sig-printed-name {
    font-weight: 600;
    font-size: 11px;
    text-align: center;
  }
  .daily-sheet__sig-caption {
    margin: 0;
    font-size: 10px;
    text-align: center;
  }
`;

function studentsForCourse(roster, course) {
  const target = (course || "").trim().toLowerCase();
  return roster.filter((row) => (row.program || "").trim().toLowerCase() === target);
}

function printAttendanceSheet(course) {
  const roster = loadAttendanceRoster();
  const meta = loadAttendanceMeta();
  const students = studentsForCourse(roster, course);

  if (!students.length) {
    window.alert("No students found for the selected course.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to print the attendance sheet.");
    return;
  }

  const pagesHtml = buildDailyAttendancePages(course, students, meta);

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(course)} — Daily Attendance Sheet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>${DAILY_ATTENDANCE_PRINT_STYLES}</style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();

  const modalEl = document.getElementById("attendancePrintModal");
  if (modalEl && window.bootstrap?.Modal) {
    const instance = window.bootstrap.Modal.getInstance(modalEl);
    instance?.hide();
  }

  window.setTimeout(() => {
    printWindow.print();
    printWindow.addEventListener(
      "afterprint",
      () => {
        printWindow.close();
      },
      { once: true }
    );
  }, 450);
}

function initAttendancePrint() {
  const confirmBtn = document.getElementById("attendance-print-confirm");
  const courseEl = document.getElementById("attendance-print-course");
  if (!confirmBtn || !courseEl) return;

  confirmBtn.addEventListener("click", () => {
    const course = (courseEl.value || "").trim();
    if (!course) {
      window.alert("Please select a course before printing.");
      courseEl.focus();
      return;
    }
    printAttendanceSheet(course);
  });
}

initAttendancePrint();
