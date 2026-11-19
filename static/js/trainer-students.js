let pageSize = 5;
let currentPage = 1;
let currentSort = "name_asc";

const searchEl = document.getElementById("student-search");
const programEl = document.getElementById("filter-program");
const batchEl = document.getElementById("filter-batch");
const scheduleEl = document.getElementById("filter-schedule");
const tbody = document.getElementById("students-table-body");
const emptyFilterEl = document.getElementById("students-empty-filter");
const paginationEl = document.getElementById("students-pagination");

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
  const rows = [...tbody.querySelectorAll("tr[data-search]")].filter(rowMatchesFilters);
  return rows.sort((a, b) => {
    if (currentSort === "date_desc" || currentSort === "date_asc") {
      const dateA = a.getAttribute("data-date") || "";
      const dateB = b.getAttribute("data-date") || "";
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      return currentSort === "date_asc" ? timeA - timeB : timeB - timeA;
    }
    const nameA = (a.getAttribute("data-name") || a.querySelector(".trainer-student-cell__name")?.textContent || "").toLowerCase().trim();
    const nameB = (b.getAttribute("data-name") || b.querySelector(".trainer-student-cell__name")?.textContent || "").toLowerCase().trim();
    return currentSort === "name_desc" ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
  });
}

function renderPagination(totalRows, page, totalPages) {
  if (!paginationEl) return;

  if (totalRows === 0) {
    paginationEl.classList.add("d-none");
    paginationEl.innerHTML = "";
    return;
  }

  paginationEl.classList.remove("d-none");
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalRows);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= totalPages ? "disabled" : "";

  // Render individual page number buttons
  let pageButtonsHtml = "";
  for (let p = 1; p <= totalPages; p++) {
    const isCurrent = p === page;
    const btnClass = isCurrent
      ? "btn-success active fw-bold shadow-sm"
      : "btn-outline-secondary";
    pageButtonsHtml += `
      <button type="button" class="btn btn-sm ${btnClass} students-page-num" data-page="${p}" style="min-width: 32px;">
        ${p}
      </button>
    `;
  }

  paginationEl.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 w-100 py-2">
      <div class="d-flex align-items-center gap-3 flex-wrap">
        <div class="d-flex align-items-center gap-1">
          <label for="students-page-size" class="small text-muted mb-0 me-1 fw-semibold">Show:</label>
          <select id="students-page-size" class="form-select form-select-sm w-auto py-1 px-2 fw-semibold border-secondary-subtle rounded-3" style="font-size: 0.825rem;">
            <option value="5" ${pageSize === 5 ? "selected" : ""}>5</option>
            <option value="10" ${pageSize === 10 ? "selected" : ""}>10</option>
            <option value="25" ${pageSize === 25 ? "selected" : ""}>25</option>
          </select>
        </div>
        <span class="trainer-pagination__label text-muted small" style="font-size: 0.85rem;">
          Showing <strong class="text-dark">${start}–${end}</strong> of <strong class="text-dark">${totalRows}</strong> student${totalRows === 1 ? "" : "s"}
        </span>
      </div>

      <div class="trainer-pagination__controls d-flex align-items-center gap-2 flex-wrap">
        <button type="button" class="btn btn-sm btn-outline-secondary rounded-3 px-2.5 students-page-prev" ${prevDisabled} title="Previous Page">
          <i class="bi bi-chevron-left" aria-hidden="true"></i> Prev
        </button>
        <div class="btn-group btn-group-sm" role="group" aria-label="Page selection">
          ${pageButtonsHtml}
        </div>
        <button type="button" class="btn btn-sm btn-outline-secondary rounded-3 px-2.5 students-page-next" ${nextDisabled} title="Next Page">
          Next <i class="bi bi-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

function applyStudentFilters(resetPage = false) {
  if (!tbody) return;

  if (resetPage) currentPage = 1;

  const matchingRows = getMatchingRows();
  const totalPages = Math.max(1, Math.ceil(matchingRows.length / pageSize) || 1);
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  tbody.querySelectorAll("tr[data-search]").forEach((row) => {
    row.classList.add("hidden");
  });

  const start = (currentPage - 1) * pageSize;
  matchingRows.slice(start, start + pageSize).forEach((row) => {
    tbody.appendChild(row);
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

  paginationEl?.addEventListener("change", (event) => {
    if (event.target.id === "students-page-size") {
      pageSize = parseInt(event.target.value, 10) || 5;
      currentPage = 1;
      applyStudentFilters(false);
    }
  });

  const sortEl = document.getElementById("trainer-student-sort");
  const sortDirBtn = document.getElementById("trainerStudentSortDirBtn");
  const sortDirIcon = document.getElementById("trainerStudentSortDirIcon");
  const thSort = document.getElementById("th-trainer-student-sort");
  const thSortIcon = document.getElementById("th-trainer-student-icon");

  function syncSortUi(val) {
    currentSort = val;
    if (sortEl) sortEl.value = val;
    if (sortDirIcon) {
      if (val === "name_desc") sortDirIcon.className = "bi bi-sort-alpha-down-alt";
      else if (val === "name_asc") sortDirIcon.className = "bi bi-sort-alpha-down";
      else if (val === "date_asc") sortDirIcon.className = "bi bi-sort-up";
      else sortDirIcon.className = "bi bi-sort-down";
    }
    if (thSortIcon) {
      if (val === "name_desc") {
        thSortIcon.className = "bi bi-arrow-down text-primary ms-1";
      } else if (val === "name_asc") {
        thSortIcon.className = "bi bi-arrow-up text-primary ms-1";
      } else {
        thSortIcon.className = "bi bi-arrow-down-up text-muted ms-1";
      }
    }
    applyStudentFilters(false);
  }

  sortEl?.addEventListener("change", (e) => {
    syncSortUi(e.target.value);
  });

  sortDirBtn?.addEventListener("click", () => {
    let nextSort = "name_asc";
    if (currentSort === "name_asc") nextSort = "name_desc";
    else if (currentSort === "name_desc") nextSort = "name_asc";
    else if (currentSort === "date_desc") nextSort = "date_asc";
    else if (currentSort === "date_asc") nextSort = "date_desc";
    syncSortUi(nextSort);
  });

  thSort?.addEventListener("click", () => {
    const nextSort = currentSort === "name_asc" ? "name_desc" : "name_asc";
    syncSortUi(nextSort);
  });

  paginationEl?.addEventListener("click", (event) => {
    const prev = event.target.closest(".students-page-prev");
    const next = event.target.closest(".students-page-next");
    const pageNumBtn = event.target.closest(".students-page-num");

    if (prev && currentPage > 1) {
      currentPage -= 1;
      applyStudentFilters(false);
    } else if (next) {
      const totalPages = Math.max(1, Math.ceil(getMatchingRows().length / pageSize));
      if (currentPage < totalPages) {
        currentPage += 1;
        applyStudentFilters(false);
      }
    } else if (pageNumBtn) {
      const p = parseInt(pageNumBtn.getAttribute("data-page"), 10);
      if (p && p !== currentPage) {
        currentPage = p;
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

function programInfo(meta, course, batch = "") {
  const byBatch = meta?.batches || meta?.programs?.by_batch || {};
  if (batch) {
    const key = `${course}|${batch}`.toLowerCase();
    for (const [k, v] of Object.entries(byBatch)) {
      if (k.toLowerCase() === key) return v;
    }
  }
  const byCourse = meta?.programs?.by_course || meta?.programs || {};
  return byCourse[course] || byCourse[course.toLowerCase()] || {};
}

function buildDailyAttendanceHeader(course, batch, meta) {
  const info = programInfo(meta, course, batch);
  const trainer = meta?.trainer || "Trainer";
  const courseDisplay = batch ? `${course} — ${batch}` : course;
  const valientLogo = `${window.location.origin}/static/img/valient-logo.svg`;
  const tesdaLogo = `${window.location.origin}/static/img/TESDA%20Logo%20official.png`;

  return `
    <div class="daily-sheet__institution-header">
      <div class="daily-sheet__logo-wrap daily-sheet__logo-wrap--left">
        <img src="${valientLogo}" alt="VTIAC Logo" class="daily-sheet__logo-img" />
      </div>
      <div class="daily-sheet__institution-info">
        <h2 class="daily-sheet__inst-name">VALIANT TECHNICAL INSTITUTE AND ASSESSMENT CENTER, INC.</h2>
        <p class="daily-sheet__inst-sub">Bangoy St., Salvacion, Panabo City, Philippines</p>
        <p class="daily-sheet__inst-sub">Mobile No: 09106341543, 09176820073 &nbsp;&bull;&nbsp; E-mail: valianttiaci@gmail.com</p>
      </div>
      <div class="daily-sheet__logo-wrap daily-sheet__logo-wrap--right">
        <img src="${tesdaLogo}" alt="TESDA Logo" class="daily-sheet__logo-img" />
      </div>
    </div>
    <h1 class="daily-sheet__title">TRAINEES DAILY ATTENDANCE SHEET</h1>
    <div class="daily-sheet__meta">
      <p class="daily-sheet__row">
        <span class="daily-sheet__label">Name of TVET Provider:</span>
        ${fieldLine(meta?.tvet_provider, "14rem")}
        <span class="daily-sheet__label daily-sheet__label--spaced">Qualification/Program:</span>
        ${fieldLine(courseDisplay, "14rem")}
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

function buildDailyAttendancePages(course, batch, students, meta) {
  const sorted = [...students].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );

  return `
    <section class="daily-attendance-page">
      ${buildDailyAttendanceHeader(course, batch, meta)}
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
  @page { size: landscape; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  html, body {
    font-family: Arial, "Poppins", system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    font-size: 11px;
    width: 100%;
  }
  .daily-attendance-page {
    width: 100%;
    max-width: 100%;
    background: #fff;
    page-break-after: always;
  }
  .daily-attendance-page:last-child {
    page-break-after: auto;
  }
  .daily-sheet__institution-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #000;
  }
  .daily-sheet__logo-wrap {
    width: 75px;
    flex-shrink: 0;
  }
  .daily-sheet__logo-wrap--left {
    text-align: left;
  }
  .daily-sheet__logo-wrap--right {
    text-align: right;
  }
  .daily-sheet__logo-img {
    height: 65px;
    width: 65px;
    object-fit: contain;
    display: inline-block;
  }
  .daily-sheet__institution-info {
    text-align: center;
    flex: 1;
    padding: 0 10px;
  }
  .daily-sheet__inst-name {
    font-family: 'Times New Roman', serif, sans-serif;
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 2px;
    letter-spacing: 0.5px;
    color: #000;
  }
  .daily-sheet__inst-sub {
    margin: 0 0 2px;
    font-size: 9.5px;
    color: #000;
    line-height: 1.3;
  }
  .daily-sheet__title {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    margin: 0 0 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: transparent;
    color: #000;
    padding: 4px 0;
    border: none;
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
    border: 1.5px solid #000;
    margin-bottom: 15px;
  }
  .daily-attendance-table th,
  .daily-attendance-table td {
    border: 1px solid #000;
    padding: 5px 6px;
    vertical-align: middle;
    background: #fff;
    color: #000;
  }
  .daily-attendance-table thead tr:first-child th {
    background: #fff;
    font-weight: 700;
    text-align: center;
    font-size: 10px;
    color: #000;
  }
  .daily-attendance-table thead tr:last-child th {
    background: #fff;
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
    height: 28px;
    font-size: 10px;
    background: #fff;
  }
  .daily-attendance-table tbody .col-no {
    text-align: center;
    font-weight: 600;
    background: #fff;
  }
  .daily-attendance-table tbody .col-sign {
    background: #fff;
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

function updatePrintBatchDropdown() {
  const courseEl = document.getElementById("attendance-print-course");
  const batchEl = document.getElementById("attendance-print-batch");
  const hintEl = document.getElementById("attendance-print-batch-hint");
  if (!courseEl || !batchEl) return;

  const selectedCourse = (courseEl.value || "").trim();
  const roster = loadAttendanceRoster();

  if (!selectedCourse) {
    batchEl.innerHTML = `<option value="">Select a course first</option>`;
    batchEl.disabled = true;
    if (hintEl) hintEl.textContent = "Choose a course to check available batches.";
    return;
  }

  // Filter roster for this course
  const courseStudents = roster.filter(
    (s) => (s.program || "").trim().toLowerCase() === selectedCourse.toLowerCase()
  );

  // Collect distinct batches for this course
  const batchCounts = {};
  courseStudents.forEach((s) => {
    const b = (s.batch || "").trim();
    if (b) {
      batchCounts[b] = (batchCounts[b] || 0) + 1;
    }
  });

  const batches = Object.keys(batchCounts).sort();

  if (!batches.length) {
    batchEl.innerHTML = `<option value="">All Students in ${escapeHtml(selectedCourse)} (${courseStudents.length} student${courseStudents.length === 1 ? "" : "s"})</option>`;
    batchEl.disabled = false;
    if (hintEl) hintEl.textContent = `${courseStudents.length} enrolled student(s) found.`;
    return;
  }

  let optionsHtml = `<option value="">All Batches (${courseStudents.length} total students)</option>`;
  batches.forEach((b) => {
    optionsHtml += `<option value="${escapeHtml(b)}">${escapeHtml(b)} (${batchCounts[b]} student${batchCounts[b] === 1 ? "" : "s"})</option>`;
  });

  batchEl.innerHTML = optionsHtml;
  batchEl.disabled = false;
  if (hintEl) {
    hintEl.textContent = `${batches.length} batch(es) available for this course. Select a specific batch or print all.`;
  }
}

function printAttendanceSheet(course, batch = "") {
  const roster = loadAttendanceRoster();
  const meta = loadAttendanceMeta();

  let students = roster.filter(
    (row) => (row.program || "").trim().toLowerCase() === (course || "").trim().toLowerCase()
  );

  if (batch) {
    students = students.filter(
      (row) => (row.batch || "").trim().toLowerCase() === batch.trim().toLowerCase()
    );
  }

  if (!students.length) {
    const msg = batch
      ? `No students found for "${course}" in batch "${batch}".`
      : `No students found for "${course}".`;
    window.alert(msg);
    return;
  }

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    window.alert("Popup blocked. Please allow popups to print the attendance sheet.");
    return;
  }

  const pagesHtml = buildDailyAttendancePages(course, batch, students, meta);
  const titleBatch = batch ? ` — ${batch}` : "";

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(course)}${escapeHtml(titleBatch)} — Daily Attendance Sheet</title>
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
  const batchEl = document.getElementById("attendance-print-batch");
  const modalEl = document.getElementById("attendancePrintModal");
  if (!confirmBtn || !courseEl) return;

  courseEl.addEventListener("change", () => {
    updatePrintBatchDropdown();
  });

  // When modal is shown, auto-sync from page filter if set
  if (modalEl) {
    modalEl.addEventListener("show.bs.modal", () => {
      const pageProgram = programEl?.value || "";
      const pageBatch = batchEl?.value || "";
      if (pageProgram && !courseEl.value) {
        courseEl.value = pageProgram;
      }
      updatePrintBatchDropdown();
      if (pageBatch && batchEl) {
        batchEl.value = pageBatch;
      }
    });
  }

  confirmBtn.addEventListener("click", () => {
    const course = (courseEl.value || "").trim();
    const batch = (batchEl?.value || "").trim();
    if (!course) {
      window.alert("Please select a course before printing.");
      courseEl.focus();
      return;
    }
    printAttendanceSheet(course, batch);
  });
}

initAttendancePrint();
