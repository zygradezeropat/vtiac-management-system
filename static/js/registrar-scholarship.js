/**
 * Registrar — scholarship management: upload, parse Excel/PDF, extract columns, import and manage masterlist.
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const STORAGE_KEY = "vtiac_scholarship_integrations";

function loadStudentRegistry() {
  const el = document.getElementById("scholarship-registry-seed");
  if (!el?.textContent?.trim()) return [];
  try {
    const parsed = JSON.parse(el.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let STUDENT_REGISTRY = loadStudentRegistry();

function loadMasterlistRecords() {
  const el = document.getElementById("scholarship-masterlist-seed");
  if (!el?.textContent?.trim()) return [];
  try {
    const parsed = JSON.parse(el.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let MASTERLIST_RECORDS = loadMasterlistRecords();
let masterlistFilter = "";
let masterlistPage = 1;
const MASTERLIST_PAGE_SIZE = 10;

const COLUMN_ALIASES = {
  no: ["no", "no.", "id", "num", "number", "seq", "#", "sl no", "item", "count"],
  scholarName: ["scholar name", "name", "student name", "full name", "scholar", "beneficiary"],
  firstName: ["first name", "firstname", "given name", "first_name"],
  lastName: ["last name", "lastname", "surname", "family name", "last_name"],
  middleName: ["middle name", "middlename", "middle nar", "middle_name"],
  birthDate: ["birth date", "birthdate", "bday", "b-day", "date of birth", "dob", "birth_date", "birthday"],
  address: ["address", "home address", "residence", "addr", "street", "location"],
  email: ["email", "email address", "email_address", "e-mail"],
  program: ["program", "course", "qualification", "program/course"],
  sponsor: ["sponsor", "grant", "funder", "organization"],
  slotId: ["slot id", "slot", "slot no", "allocation", "slot #"],
  amount: ["amount", "grant amount", "subsidy", "value", "php"],
  status: ["status", "remarks", "note"],
};

const HEADER_CATEGORIES = [
  { name: "lastName", keywords: ["last name", "lastname", "surname", "family name", "last_name"] },
  { name: "firstName", keywords: ["first name", "firstname", "given name", "first_name"] },
  { name: "middleName", keywords: ["middle name", "middlename", "middle nar", "middle_name"] },
  { name: "fullName", keywords: ["scholar name", "full name", "student name", "scholar", "beneficiary"] },
  { name: "birthDate", keywords: ["birthdate", "birth date", "bday", "b-day", "date of birth", "dob", "birthday"] },
  { name: "address", keywords: ["address", "home address", "residence", "addr", "street"] },
  { name: "email", keywords: ["email", "email address", "email_address", "e-mail"] },
  { name: "program", keywords: ["program", "course", "qualification", "program/course"] },
  { name: "sponsor", keywords: ["sponsor", "grant", "funder", "organization"] },
  { name: "idNo", keywords: ["no", "no.", "id", "slot", "num", "number"] },
];

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDateStr(raw) {
  if (!raw) return "";
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return "";
    return raw.toISOString().split("T")[0];
  }
  let s = String(raw).trim();
  if (!s) return "";

  if (s.endsWith("-01-01")) {
    const num = s.split("-")[0];
    if (/^\d{5}$/.test(num)) s = num;
  }

  if (/^\d{5}$/.test(s)) {
    const n = parseInt(s, 10);
    if (n >= 10000 && n <= 60000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return s;
}

function isExactOrWordMatch(cellText, keyword) {
  const normCell = normalizeKey(cellText);
  const normKw = normalizeKey(keyword);
  if (!normCell || !normKw) return false;
  if (normCell === normKw) return true;
  if (normKw.length >= 4 && normCell.includes(normKw)) return true;
  const regex = new RegExp(`\\b${normKw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
  return regex.test(normCell);
}

function countMatchedCategories(rowArray) {
  const matchedCats = new Set();
  (rowArray || []).forEach((cell) => {
    const text = String(cell || "").trim();
    if (!text) return;
    HEADER_CATEGORIES.forEach((cat) => {
      if (cat.keywords.some((kw) => isExactOrWordMatch(text, kw))) {
        matchedCats.add(cat.name);
      }
    });
  });
  return matchedCats.size;
}

function pickField(row, aliases) {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const found = keys.find((k) => normalizeKey(k) === alias);
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }
  for (const alias of aliases) {
    const found = keys.find((k) => normalizeKey(k).includes(alias));
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }
  return "";
}

function normalizeParsedRow(raw, index) {
  const no = pickField(raw, COLUMN_ALIASES.no) || String(index + 1);
  const firstName = pickField(raw, COLUMN_ALIASES.firstName);
  const lastName = pickField(raw, COLUMN_ALIASES.lastName);
  const middleName = pickField(raw, COLUMN_ALIASES.middleName);
  const address = pickField(raw, COLUMN_ALIASES.address);
  const email = pickField(raw, COLUMN_ALIASES.email);

  let scholarName = "";
  if (firstName || lastName) {
    scholarName = [firstName, middleName, lastName].filter(Boolean).join(" ");
  } else {
    scholarName =
      pickField(raw, COLUMN_ALIASES.scholarName) ||
      Object.values(raw).find((v) => typeof v === "string" && v.length > 2) ||
      `Row ${index + 1}`;
  }

  const rawBday = pickField(raw, COLUMN_ALIASES.birthDate);
  const birthDate = normalizeDateStr(rawBday) || rawBday;

  return {
    id: `row-${index}`,
    no,
    scholarName,
    firstName,
    lastName,
    middleName,
    birthDate,
    rawBirthDate: rawBday,
    address,
    email,
    rawObject: raw,
    program: pickField(raw, COLUMN_ALIASES.program) || "—",
    sponsor: pickField(raw, COLUMN_ALIASES.sponsor) || "",
    slotId: pickField(raw, COLUMN_ALIASES.slotId) || "",
    amount: pickField(raw, COLUMN_ALIASES.amount) || "",
    status: pickField(raw, COLUMN_ALIASES.status) || "Pending",
    matchStatus: "pending",
    matchDetails: "",
    slotStatus: "valid",
    studentId: null,
    registrationId: null,
    profileId: null,
    integrated: false,
  };
}

function isHeaderOrInvalidRow(scholarName) {
  const s = normalizeKey(scholarName);
  if (!s || s === "row" || s.startsWith("row ")) return true;
  if (s === "last name" || s === "first name" || s === "middle name" || s === "birthdate" || s === "no" || s === "student data") return true;
  if (s.includes("valiant technological") || s.includes("system generated") || s.includes("new visayas")) return true;
  return false;
}

function matchStudentStrict(scholarName, birthDate, rowObj) {
  if (isHeaderOrInvalidRow(scholarName)) return null;

  const rowFirst = normalizeKey(rowObj?.firstName || pickField(rowObj || {}, COLUMN_ALIASES.firstName));
  const rowLast = normalizeKey(rowObj?.lastName || pickField(rowObj || {}, COLUMN_ALIASES.lastName));
  const rowEmail = normalizeKey(rowObj?.email || pickField(rowObj || {}, COLUMN_ALIASES.email));
  const targetBday = birthDate ? normalizeDateStr(birthDate) : "";

  const key = normalizeKey(scholarName).replace(/[,.]/g, " ");

  for (const s of STUDENT_REGISTRY) {
    const sFirst = normalizeKey(s.firstName || s.name.split(" ")[0]);
    const sLast = normalizeKey(s.lastName || s.name.split(" ").slice(-1)[0]);
    const sEmail = normalizeKey(s.email || "");
    const sFullNameNorm = normalizeKey(s.name).replace(/[,.]/g, " ");
    const sBday = s.birthDate ? normalizeDateStr(s.birthDate) : "";

    let isMatch = false;

    // 1. Direct email match
    if (rowEmail && sEmail && rowEmail === sEmail) {
      isMatch = true;
    }

    // 2. Direct first_name + last_name match
    if (!isMatch && rowFirst && rowLast && sFirst && sLast) {
      const firstMatches = rowFirst.includes(sFirst) || sFirst.includes(rowFirst);
      const lastMatches = rowLast === sLast || rowLast.includes(sLast) || sLast.includes(rowLast);
      if (firstMatches && lastMatches) {
        isMatch = true;
      }
    }

    // 3. Full name token match
    if (!isMatch && sFullNameNorm && key) {
      if (sFullNameNorm === key || key.includes(sFullNameNorm) || sFullNameNorm.includes(key)) {
        isMatch = true;
      } else {
        const keyWords = key.split(/\s+/).filter((w) => w.length > 2);
        const sWords = sFullNameNorm.split(/\s+/).filter((w) => w.length > 2);
        const commonWords = keyWords.filter((w) => sWords.includes(w));
        if (commonWords.length >= 2 && (rowLast ? sWords.includes(rowLast) : true)) {
          isMatch = true;
        }
      }
    }

    if (!isMatch) continue;

    if (targetBday && sBday && targetBday === sBday) {
      return { hit: s, confidence: "exact_name_and_bday" };
    }

    return { hit: s, confidence: "exact_name" };
  }

  return null;
}

function validateRows(rows) {
  return rows.map((row) => {
    const matchRes = matchStudentStrict(row.scholarName, row.birthDate || row.rawBirthDate, row.rawObject);
    const match = matchRes?.hit || null;

    if (match) {
      row.matchStatus = "matched";
      row.matchDetails = matchRes.confidence === "exact_name_and_bday"
        ? "Student Match"
        : "Student Match (Name)";
      row.studentId = match.studentId ?? null;
      row.registrationId = match.registrationId ?? null;
      row.profileId = match.profileId ?? null;
      if (!row.program || row.program === "—") row.program = match.program;
      if (!row.birthDate && match.birthDateStr) row.birthDate = match.birthDateStr;
    } else {
      row.matchStatus = "unmatched";
      row.matchDetails = "Scholar Record";
      row.studentId = null;
      row.registrationId = null;
      row.profileId = null;
    }

    row.slotStatus = "valid";
    return row;
  });
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === "undefined") {
      reject(new Error("Excel parser not loaded."));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rawMatrix || !rawMatrix.length) {
          resolve({ rows: [], sheetName, format: "excel" });
          return;
        }

        let headerRowIdx = -1;
        let maxCats = 0;

        for (let r = 0; r < rawMatrix.length; r++) {
          const catCount = countMatchedCategories(rawMatrix[r]);
          if (catCount >= 2 && catCount > maxCats) {
            maxCats = catCount;
            headerRowIdx = r;
          }
        }

        let jsonObjects = [];
        if (headerRowIdx !== -1) {
          const headerRow = rawMatrix[headerRowIdx].map((c) => String(c).trim());
          const dataRows = rawMatrix.slice(headerRowIdx + 1);

          jsonObjects = dataRows
            .filter((row) => Array.isArray(row) && row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""))
            .map((row) => {
              const obj = {};
              headerRow.forEach((colName, colIdx) => {
                if (colName) {
                  obj[colName] = row[colIdx] !== undefined ? row[colIdx] : "";
                }
              });
              return obj;
            });
        } else {
          jsonObjects = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        }

        const rows = jsonObjects
          .map((r, i) => normalizeParsedRow(r, i))
          .filter((r) => !isHeaderOrInvalidRow(r.scholarName));

        resolve({ rows, sheetName, format: "excel" });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsArrayBuffer(file);
  });
}

async function parsePdfFile(file) {
  if (typeof pdfjsLib === "undefined") {
    throw new Error("PDF parser not loaded.");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";

  for (let p = 1; p <= pdf.numPages; p += 1) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    fullText += `${strings.join(" ")}\n`;
  }

  const lines = fullText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  const rows = [];
  const rowPattern = /^([A-Za-z][A-Za-z\s.'-]{2,40})\s+([A-Za-z0-9\s()./-]{4,})\s+([\d,]+)/;

  lines.forEach((line, i) => {
    const m = line.match(rowPattern);
    if (m) {
      rows.push(
        normalizeParsedRow(
          {
            "Scholar Name": m[1].trim(),
            Program: m[2].trim(),
            Amount: m[3].replace(/,/g, ""),
          },
          i
        )
      );
    }
  });

  if (rows.length === 0) {
    lines.slice(0, 12).forEach((line, i) => {
      if (/^(name|scholar|program|slot)/i.test(line)) return;
      const parts = line.split(/\s{2,}|\t|,/);
      if (parts.length >= 2) {
        rows.push(
          normalizeParsedRow(
            {
              "Scholar Name": parts[0],
              Program: parts[1] || "—",
              Amount: parts[2] || "",
            },
            i
          )
        );
      }
    });
  }

  if (rows.length === 0) {
    throw new Error(
      "Could not extract table rows from PDF. Try Excel format or a text-based PDF export."
    );
  }

  return { rows, sheetName: `${pdf.numPages} page(s)`, format: "pdf" };
}

function getIntegrations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveIntegrations(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function filteredMasterlist() {
  const q = masterlistFilter.trim().toLowerCase();
  if (!q) return MASTERLIST_RECORDS;
  return MASTERLIST_RECORDS.filter(
    (r) =>
      (r.scholarName && r.scholarName.toLowerCase().includes(q)) ||
      (r.lastName && r.lastName.toLowerCase().includes(q)) ||
      (r.firstName && r.firstName.toLowerCase().includes(q)) ||
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.program && r.program.toLowerCase().includes(q)) ||
      (r.sponsor && r.sponsor.toLowerCase().includes(q)) ||
      (r.slotId && r.slotId.toLowerCase().includes(q))
  );
}

function renderMasterlist() {
  const container = document.getElementById("masterlist-table-container");
  const infoEl = document.getElementById("masterlist-page-info");
  const paginationEl = document.getElementById("masterlist-pagination");
  if (!container) return;

  const records = filteredMasterlist();
  const total = records.length;
  const totalPages = Math.ceil(total / MASTERLIST_PAGE_SIZE) || 1;
  if (masterlistPage > totalPages) masterlistPage = totalPages;
  if (masterlistPage < 1) masterlistPage = 1;

  const startIdx = (masterlistPage - 1) * MASTERLIST_PAGE_SIZE;
  const pageRecords = records.slice(startIdx, startIdx + MASTERLIST_PAGE_SIZE);

  if (records.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-4 border rounded-3 bg-light">
        <i class="bi bi-inbox opacity-50 fs-2" aria-hidden="true"></i>
        <p class="small mb-0 mt-2">No scholar records saved yet. Import a sponsor file to see masterlist records.</p>
      </div>`;
    if (infoEl) infoEl.textContent = "Showing 0 to 0 of 0 records";
    if (paginationEl) paginationEl.innerHTML = "";
    return;
  }

  const rowsHtml = pageRecords
    .map(
      (r) => `
    <tr>
      <td class="fw-semibold text-muted">${escapeHtml(r.no || "—")}</td>
      <td class="fw-medium">${escapeHtml(r.lastName || "—")}</td>
      <td class="fw-medium">${escapeHtml(r.firstName || "—")}</td>
      <td>${escapeHtml(r.middleName || "—")}</td>
      <td><small class="text-muted">${escapeHtml(r.birthDate || "—")}</small></td>
      <td><small class="text-muted">${escapeHtml(r.address || "—")}</small></td>
      <td><small>${escapeHtml(r.email || "—")}</small></td>
      <td><span class="badge text-bg-light text-dark border">${escapeHtml(r.sponsor || "—")}</span></td>
      <td>${r.isLinked ? '<span class="badge text-bg-success"><i class="bi bi-person-check-fill me-1"></i>Enrolled Student</span>' : '<span class="badge text-bg-secondary"><i class="bi bi-person-plus me-1"></i>Scholar Record</span>'}</td>
    </tr>`
    )
    .join("");

  container.innerHTML = `
    <table class="table registrar-table registrar-scholarship-table mb-0" style="font-size:0.875rem">
      <thead>
        <tr>
          <th>No.</th>
          <th>Last Name</th>
          <th>First Name</th>
          <th>Middle Name</th>
          <th>Birthdate</th>
          <th>Address</th>
          <th>Email</th>
          <th>Sponsor</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;

  const endIdx = Math.min(startIdx + MASTERLIST_PAGE_SIZE, total);
  if (infoEl) {
    infoEl.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} record${total !== 1 ? "s" : ""}`;
  }

  if (paginationEl) {
    let pagesHtml = "";
    pagesHtml += `
      <li class="page-item ${masterlistPage === 1 ? "disabled" : ""}">
        <button class="page-link" type="button" data-page="${masterlistPage - 1}">Previous</button>
      </li>`;

    for (let p = 1; p <= totalPages; p++) {
      pagesHtml += `
        <li class="page-item ${p === masterlistPage ? "active" : ""}">
          <button class="page-link" type="button" data-page="${p}">${p}</button>
        </li>`;
    }

    pagesHtml += `
      <li class="page-item ${masterlistPage === totalPages ? "disabled" : ""}">
        <button class="page-link" type="button" data-page="${masterlistPage + 1}">Next</button>
      </li>`;

    paginationEl.innerHTML = pagesHtml;

    paginationEl.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const p = parseInt(e.target.dataset.page, 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          masterlistPage = p;
          renderMasterlist();
        }
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("scholarship-dropzone");
  const fileInput = document.getElementById("scholarship-file-input");
  const fileMeta = document.getElementById("scholarship-file-meta");
  const parseBtn = document.getElementById("scholarship-parse-btn");
  const clearBtn = document.getElementById("scholarship-clear-btn");
  const integrateBtn = document.getElementById("scholarship-integrate-btn");
  const exportBtn = document.getElementById("scholarship-export-btn");
  const actionsEl = document.getElementById("scholarship-actions");
  const statusEl = document.getElementById("scholarship-parse-status");
  const resultsTable = document.getElementById("scholarship-results-table");
  const resultsEmpty = document.getElementById("scholarship-results-empty");
  const rowSearch = document.getElementById("scholarship-row-search");
  const statsEl = document.getElementById("scholarship-stats");
  const pendingCount = document.getElementById("scholarship-pending-count");
  const sponsorEl = document.getElementById("scholarship-sponsor");
  const pipelineSteps = document.querySelectorAll(".registrar-scholarship-pipeline__step");
  const masterlistSearch = document.getElementById("masterlist-search");

  let selectedFile = null;
  let parsedRows = [];
  let rowFilter = "";

  function setPipeline(step) {
    const order = ["upload", "parse", "validate", "integrate"];
    const idx = order.indexOf(step);
    pipelineSteps.forEach((el, i) => {
      el.classList.toggle("is-active", i === idx);
      el.classList.toggle("is-done", i < idx);
    });
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function acceptedFile(file) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    return ["xls", "xlsx", "pdf"].includes(ext);
  }

  function handleFile(file) {
    if (!file) return;
    if (!acceptedFile(file)) {
      alert("Only .xls, .xlsx, and .pdf files are supported.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      alert("File exceeds 10 MB limit.");
      return;
    }
    selectedFile = file;
    parsedRows = [];
    if (parseBtn) parseBtn.disabled = false;
    if (fileMeta) {
      fileMeta.classList.remove("d-none");
      const ext = file.name.split(".").pop()?.toUpperCase();
      fileMeta.innerHTML = `
        <div class="registrar-scholarship-file-meta__inner">
          <i class="bi bi-file-earmark-${ext === "PDF" ? "pdf" : "spreadsheet"} text-success fs-4" aria-hidden="true"></i>
          <div>
            <p class="fw-semibold mb-0">${escapeHtml(file.name)}</p>
            <p class="text-muted small mb-0">${formatBytes(file.size)} · ${escapeHtml(ext || "file")}</p>
          </div>
        </div>`;
    }
    setPipeline("upload");
    renderResults();
    updateStats();
  }

  function updateStats() {
    const total = parsedRows.length;
    const matches = parsedRows.filter((r) => r.matchStatus === "matched").length;
    const pendingToImport = parsedRows.filter((r) => !r.integrated).length;

    if (pendingCount) pendingCount.textContent = String(pendingToImport || total);

    if (!statsEl) return;

    statsEl.innerHTML = `
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${total}</span>
          <span class="registrar-finalized-stat__label">Parsed rows</span>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${matches}</span>
          <span class="registrar-finalized-stat__label">Student matches</span>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${pendingToImport}</span>
          <span class="registrar-finalized-stat__label">Ready to save</span>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${parsedRows.filter(r => r.integrated).length}</span>
          <span class="registrar-finalized-stat__label">Saved scholars</span>
        </div>
      </div>`;
  }

  function badgeMatch(row) {
    if (row.matchStatus === "matched") {
      return `<span class="badge text-bg-success"><i class="bi bi-person-check-fill me-1"></i>Student Match</span>`;
    }
    return '<span class="badge text-bg-secondary"><i class="bi bi-person-plus me-1"></i>Scholar Record</span>';
  }

  function filteredRows() {
    const q = rowFilter.trim().toLowerCase();
    if (!q) return parsedRows;
    return parsedRows.filter(
      (r) =>
        (r.scholarName && r.scholarName.toLowerCase().includes(q)) ||
        (r.lastName && r.lastName.toLowerCase().includes(q)) ||
        (r.firstName && r.firstName.toLowerCase().includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.program && r.program.toLowerCase().includes(q))
    );
  }

  function renderResults() {
    const rows = filteredRows();

    if (parsedRows.length === 0) {
      resultsTable?.classList.add("d-none");
      resultsEmpty?.classList.remove("d-none");
      actionsEl?.classList.add("d-none");
      if (rowSearch) rowSearch.disabled = true;
      if (integrateBtn) integrateBtn.disabled = true;
      return;
    }

    resultsEmpty?.classList.add("d-none");
    resultsTable?.classList.remove("d-none");
    actionsEl?.classList.remove("d-none");
    if (rowSearch) rowSearch.disabled = false;

    const body = rows
      .map(
        (r) => `
      <tr>
        <td class="fw-semibold text-muted">${escapeHtml(r.no || "—")}</td>
        <td class="fw-medium">${escapeHtml(r.lastName || "—")}</td>
        <td class="fw-medium">${escapeHtml(r.firstName || "—")}</td>
        <td>${escapeHtml(r.middleName || "—")}</td>
        <td><small class="text-muted">${escapeHtml(r.birthDate || "—")}</small></td>
        <td><small class="text-muted">${escapeHtml(r.address || "—")}</small></td>
        <td><small>${escapeHtml(r.email || "—")}</small></td>
        <td>${badgeMatch(r)}</td>
        <td>${r.integrated ? '<span class="badge text-bg-primary"><i class="bi bi-check2-all me-1"></i>Saved</span>' : '<span class="badge text-bg-light text-dark">Pending</span>'}</td>
      </tr>`
      )
      .join("");

    if (resultsTable) {
      resultsTable.innerHTML = `
        <table class="table registrar-table registrar-scholarship-table mb-0" style="font-size:0.875rem">
          <thead>
            <tr>
              <th>No.</th>
              <th>Last Name</th>
              <th>First Name</th>
              <th>Middle Name</th>
              <th>Birthdate</th>
              <th>Address</th>
              <th>Email</th>
              <th>Match Status</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${body || '<tr><td colspan="9" class="text-center text-muted py-3">No rows match filter.</td></tr>'}</tbody>
        </table>`;
    }

    const canIntegrate = parsedRows.some((r) => !r.integrated);
    if (integrateBtn) integrateBtn.disabled = !canIntegrate;
  }

  function showStatus(type, html) {
    if (!statusEl) return;
    statusEl.classList.remove("d-none", "alert-success", "alert-danger", "alert-info");
    statusEl.classList.add(`alert-${type}`);
    statusEl.innerHTML = html;
  }

  async function runParse() {
    if (!selectedFile) return;
    parseBtn.disabled = true;
    showStatus("info", '<i class="bi bi-hourglass-split me-1"></i> Reading and parsing sponsor list file...');
    setPipeline("parse");

    try {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      let result;
      if (ext === "pdf") {
        result = await parsePdfFile(selectedFile);
      } else {
        result = await parseExcelFile(selectedFile);
      }

      parsedRows = result.rows || [];
      parsedRows = validateRows(parsedRows);

      setPipeline("validate");
      showStatus(
        "success",
        `<i class="bi bi-check-circle me-1"></i> Extracted <strong>${parsedRows.length}</strong> record(s) from ${result.format.toUpperCase()} (${escapeHtml(result.sheetName)}). Ready for saving.`
      );
      renderResults();
      updateStats();
    } catch (err) {
      showStatus("danger", `<i class="bi bi-x-circle me-1"></i> ${escapeHtml(err.message || "Parse failed.")}`);
      setPipeline("upload");
    } finally {
      parseBtn.disabled = !selectedFile;
    }
  }

  function clearAll() {
    selectedFile = null;
    parsedRows = [];
    if (fileInput) fileInput.value = "";
    if (fileMeta) fileMeta.classList.add("d-none");
    if (parseBtn) parseBtn.disabled = true;
    if (statusEl) statusEl.classList.add("d-none");
    setPipeline("upload");
    renderResults();
    updateStats();
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.content;
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : "";
  }

  async function integrateMatched() {
    const sponsor = sponsorEl?.value || "External Grant / Scholarship";
    const toApply = parsedRows.filter((r) => !r.integrated);
    if (!toApply.length) return;

    if (integrateBtn) integrateBtn.disabled = true;
    showStatus("info", '<i class="bi bi-hourglass-split me-1"></i> Saving scholar records into system...');

    try {
      const scholarsPayload = toApply.map((r) => ({
        no: r.no,
        lastName: r.lastName,
        firstName: r.firstName,
        middleName: r.middleName,
        scholarName: r.scholarName,
        birthDate: r.birthDate,
        address: r.address,
        email: r.email,
        program: r.program,
        slotId: r.slotId,
        amount: r.amount,
        registrationId: r.registrationId,
        profileId: r.profileId,
        scholarshipType: sponsor.toLowerCase().includes("tesda")
          ? "tesda"
          : sponsor.toLowerCase().includes("twsp")
            ? "twsp"
            : sponsor.toLowerCase().includes("pesa")
              ? "pesa"
              : sponsor.toLowerCase().includes("uaqtea")
                ? "uaqtea"
                : "others",
      }));

      const response = await fetch("/registrar/api/scholarship/integrate/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify({
          sponsor,
          filename: selectedFile ? selectedFile.name : "",
          totalParsedRows: parsedRows.length,
          scholars: scholarsPayload,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Could not save records into system.");
      }

      const log = getIntegrations();
      const now = new Date().toISOString();

      toApply.forEach((row) => {
        row.integrated = true;
        log.unshift({
          scholarName: row.scholarName,
          studentId: row.studentId,
          program: row.program,
          sponsor,
          slotId: row.slotId,
          amount: row.amount,
          integratedAt: now,
        });

        // Also add to active masterlist array
        MASTERLIST_RECORDS.unshift({
          id: String(Date.now()),
          no: row.no || "—",
          scholarName: row.scholarName,
          lastName: row.lastName || "—",
          firstName: row.firstName || "—",
          middleName: row.middleName || "—",
          birthDate: row.birthDate || "—",
          address: row.address || "—",
          email: row.email || "—",
          program: row.program || "—",
          sponsor,
          slotId: row.slotId || "—",
          amount: row.amount || "—",
          scholarshipType: "tesda",
          scholarshipLabel: "TESDA",
          isLinked: Boolean(row.profileId || row.registrationId),
          statusLabel: row.profileId || row.registrationId ? "Linked (Enrolled Student)" : "Saved Scholar Record",
          grantedAt: new Date().toLocaleString(),
        });
      });

      saveIntegrations(log.slice(0, 200));
      setPipeline("integrate");
      showStatus(
        "success",
        `<i class="bi bi-check-circle-fill me-1"></i> Successfully saved <strong>${data.updatedCount || toApply.length}</strong> scholar record(s) to system masterlist!`
      );
      renderResults();
      renderMasterlist();
      updateStats();
    } catch (err) {
      showStatus("danger", `<i class="bi bi-x-circle me-1"></i> ${escapeHtml(err.message || "Import failed.")}`);
    } finally {
      if (integrateBtn) integrateBtn.disabled = false;
    }
  }

  function exportCsv() {
    if (!parsedRows.length) return;
    const headers = ["No", "Last Name", "First Name", "Middle Name", "Birthdate", "Address", "Email", "Match Status", "Status"];
    const lines = parsedRows.map((r) =>
      [r.no, r.lastName, r.firstName, r.middleName, r.birthDate, r.address, r.email, r.matchStatus, r.integrated ? "Saved" : "Pending"]
        .map((c) => `"${String(c || "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scholarship-import-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("is-dragover"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    handleFile(file);
  });

  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
  });

  parseBtn?.addEventListener("click", runParse);
  clearBtn?.addEventListener("click", clearAll);
  integrateBtn?.addEventListener("click", integrateMatched);
  exportBtn?.addEventListener("click", exportCsv);

  rowSearch?.addEventListener("input", (e) => {
    rowFilter = e.target.value;
    renderResults();
  });

  masterlistSearch?.addEventListener("input", (e) => {
    masterlistFilter = e.target.value;
    masterlistPage = 1;
    renderMasterlist();
  });

  renderResults();
  renderMasterlist();
  updateStats();
});
