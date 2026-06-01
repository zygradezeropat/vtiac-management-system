const PAGE_SIZE = 10;

const searchEl = document.getElementById("student-search");
const programEl = document.getElementById("filter-program");
const batchEl = document.getElementById("filter-batch");
const scheduleEl = document.getElementById("filter-schedule");
const tbody = document.getElementById("students-table-body");
const emptyFilterEl = document.getElementById("students-empty-filter");
const paginationEl = document.getElementById("students-pagination");

let currentPage = 1;

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
