/**
 * Registrar — scholarship management: upload, parse Excel/PDF, validate, integrate (demo).
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

function loadEnrolledScholars() {
  const el = document.getElementById("scholarship-scholars-seed");
  if (!el?.textContent?.trim()) return [];
  try {
    const parsed = JSON.parse(el.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const COLUMN_ALIASES = {
  scholarName: ["scholar name", "name", "student name", "full name", "scholar", "beneficiary"],
  firstName: ["first name", "firstname", "given name", "first_name"],
  lastName: ["last name", "lastname", "surname", "family name", "last_name"],
  middleName: ["middle name", "middlename", "middle nar", "middle_name"],
  birthDate: ["birth date", "birthdate", "bday", "b-day", "date of birth", "dob", "birth_date", "birthday"],
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
  { name: "program", keywords: ["program", "course", "qualification", "program/course"] },
  { name: "sponsor", keywords: ["sponsor", "grant", "funder", "organization"] },
  { name: "contact", keywords: ["email", "address", "phone", "contact"] },
  { name: "idNo", keywords: ["no", "no.", "id", "slot", "num", "number"] },
];

function escapeHtml(text) {
  return String(text)
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
  const s = String(raw).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const parsed = Date.parse(s);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return s.toLowerCase();
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
  const firstName = pickField(raw, COLUMN_ALIASES.firstName);
  const lastName = pickField(raw, COLUMN_ALIASES.lastName);
  const middleName = pickField(raw, COLUMN_ALIASES.middleName);

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
  const birthDate = normalizeDateStr(rawBday);

  return {
    id: `row-${index}`,
    scholarName,
    firstName,
    lastName,
    middleName,
    birthDate,
    rawBirthDate: rawBday,
    rawObject: raw,
    program: pickField(raw, COLUMN_ALIASES.program) || "—",
    sponsor: pickField(raw, COLUMN_ALIASES.sponsor) || "",
    slotId: pickField(raw, COLUMN_ALIASES.slotId) || "",
    amount: pickField(raw, COLUMN_ALIASES.amount) || "",
    status: pickField(raw, COLUMN_ALIASES.status) || "Pending",
    matchStatus: "pending",
    matchDetails: "",
    slotStatus: "pending",
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
  const key = normalizeKey(scholarName);
  if (!key || isHeaderOrInvalidRow(scholarName)) return null;

  const targetBday = birthDate ? normalizeDateStr(birthDate) : "";
  const rowFirst = normalizeKey(rowObj?.firstName || pickField(rowObj || {}, COLUMN_ALIASES.firstName));
  const rowLast = normalizeKey(rowObj?.lastName || pickField(rowObj || {}, COLUMN_ALIASES.lastName));

  for (const s of STUDENT_REGISTRY) {
    const sFirst = normalizeKey(s.firstName || s.name.split(" ")[0]);
    const sLast = normalizeKey(s.lastName || s.name.split(" ").slice(-1)[0]);
    const sFullName = normalizeKey(s.name);
    const sBday = s.birthDate ? normalizeDateStr(s.birthDate) : "";

    let nameMatch = false;

    if (sFullName === key || key.includes(sFullName) || sFullName.includes(key)) {
      if (rowFirst && sFirst) {
        const firstWordsRow = rowFirst.split(" ").filter((w) => w.length > 1);
        const firstWordsS = sFirst.split(" ").filter((w) => w.length > 1);
        const sameFirstCount = firstWordsS.filter((w) => firstWordsRow.includes(w)).length;
        if (sameFirstCount >= Math.min(firstWordsRow.length, firstWordsS.length)) {
          nameMatch = true;
        }
      } else {
        nameMatch = true;
      }
    }

    if (!nameMatch) continue;

    if (targetBday) {
      if (sBday && sBday === targetBday) {
        return { hit: s, confidence: "exact_name_and_bday" };
      }
      continue;
    }

    return { hit: s, confidence: "exact_name" };
  }

  return null;
}

function validateRows(rows) {
  const usedSlots = new Set();
  let slotSeq = 0;

  return rows.map((row) => {
    const matchRes = matchStudentStrict(row.scholarName, row.birthDate || row.rawBirthDate, row.rawObject);
    const match = matchRes?.hit || null;

    if (match) {
      row.matchStatus = "matched";
      row.matchDetails = matchRes.confidence === "exact_name_and_bday"
        ? "Matched (Name & DOB)"
        : "Matched (Name)";
      row.studentId = match.studentId ?? null;
      row.registrationId = match.registrationId ?? null;
      row.profileId = match.profileId ?? null;
      if (!row.program || row.program === "—") row.program = match.program;
      if (!row.birthDate && match.birthDateStr) row.birthDate = match.birthDateStr;
    } else {
      row.matchStatus = "unmatched";
      row.matchDetails = "Unmatched";
      row.studentId = null;
      row.registrationId = null;
      row.profileId = null;
    }

    let slot = row.slotId;
    if (!slot && match) {
      slotSeq += 1;
      slot = `AUTO-${String(slotSeq).padStart(2, "0")}`;
      row.slotId = slot;
    }

    if (!slot) {
      row.slotStatus = "missing_slot";
    } else if (usedSlots.has(slot)) {
      row.slotStatus = "duplicate_slot";
    } else {
      usedSlots.add(slot);
      row.slotStatus = "valid";
    }

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
  const slotCapEl = document.getElementById("scholarship-slot-cap");
  const sponsorEl = document.getElementById("scholarship-sponsor");
  const pipelineSteps = document.querySelectorAll(".registrar-scholarship-pipeline__step");

  let selectedFile = null;
  let parsedRows = [];
  let rowFilter = "";
  let lastParseMeta = null;

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
      alert("File exceeds 10 MB limit (demo).");
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
    const matched = parsedRows.filter((r) => r.matchStatus === "matched").length;
    const validSlots = parsedRows.filter((r) => r.slotStatus === "valid").length;
    const integrated = getIntegrations().length;
    const pending = parsedRows.filter((r) => r.matchStatus === "matched" && !r.integrated).length;

    if (pendingCount) pendingCount.textContent = String(pending || parsedRows.length);

    if (!statsEl) return;
    if (parsedRows.length === 0 && integrated === 0) {
      const scholars = loadEnrolledScholars();
      statsEl.innerHTML = scholars.length
        ? `
      <div class="col-md-4">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${scholars.length}</span>
          <span class="registrar-finalized-stat__label">Scholars on enrollment profiles</span>
        </div>
      </div>
      <div class="col-md-8">
        <p class="text-muted small mb-0 pt-2">Upload sponsor lists to match against <strong>${STUDENT_REGISTRY.length}</strong> enrolled students in the system.</p>
      </div>`
        : `<div class="col-12"><p class="text-muted small mb-0">No scholars on file yet. Students can select a scholarship type during enrollment.</p></div>`;
      return;
    }

    statsEl.innerHTML = `
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${parsedRows.length}</span>
          <span class="registrar-finalized-stat__label">Parsed rows</span>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${matched}</span>
          <span class="registrar-finalized-stat__label">Matched names</span>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${validSlots}</span>
          <span class="registrar-finalized-stat__label">Valid slots</span>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="registrar-finalized-stat">
          <span class="registrar-finalized-stat__value">${integrated}</span>
          <span class="registrar-finalized-stat__label">Integrated</span>
        </div>
      </div>`;
  }

  function badgeMatch(row) {
    if (row.matchStatus === "matched") {
      if (row.matchDetails?.includes("DOB")) {
        return `<span class="badge text-bg-success"><i class="bi bi-patch-check-fill me-1"></i>${escapeHtml(row.matchDetails)}</span>`;
      }
      return `<span class="badge text-bg-success"><i class="bi bi-check-circle me-1"></i>${escapeHtml(row.matchDetails || "Matched")}</span>`;
    }
    return '<span class="badge text-bg-danger">Unmatched</span>';
  }

  function badgeSlot(row) {
    const map = {
      valid: "text-bg-success",
      over_capacity: "text-bg-danger",
      duplicate_slot: "text-bg-danger",
      missing_slot: "text-bg-warning",
    };
    const labels = {
      valid: "Valid slot",
      over_capacity: "Over cap",
      duplicate_slot: "Duplicate",
      missing_slot: "No slot",
    };
    return `<span class="badge ${map[row.slotStatus] || "text-bg-secondary"}">${labels[row.slotStatus] || row.slotStatus}</span>`;
  }

  function filteredRows() {
    const q = rowFilter.trim().toLowerCase();
    if (!q) return parsedRows;
    return parsedRows.filter(
      (r) =>
        r.scholarName.toLowerCase().includes(q) ||
        r.program.toLowerCase().includes(q) ||
        (r.sponsor && r.sponsor.toLowerCase().includes(q))
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
        <td class="fw-medium">
          <div>${escapeHtml(r.scholarName)}</div>
          ${r.birthDate ? `<small class="text-muted" style="font-size:0.75rem"><i class="bi bi-calendar-event me-1"></i>${escapeHtml(r.birthDate)}</small>` : ""}
        </td>
        <td>${escapeHtml(r.program)}</td>
        <td>${escapeHtml(r.sponsor || sponsorEl?.value || "—")}</td>
        <td>${escapeHtml(r.slotId || "—")}</td>
        <td>${escapeHtml(r.amount || "—")}</td>
        <td>${badgeMatch(r)}</td>
        <td>${badgeSlot(r)}</td>
        <td>${r.integrated ? '<span class="badge text-bg-primary"><i class="bi bi-check2-all me-1"></i>Applied</span>' : '<span class="badge text-bg-light text-dark">Pending</span>'}</td>
      </tr>`
      )
      .join("");

    if (resultsTable) {
      resultsTable.innerHTML = `
        <table class="table registrar-table registrar-scholarship-table mb-0">
          <thead>
            <tr>
              <th>Scholar</th>
              <th>Program</th>
              <th>Sponsor</th>
              <th>Slot</th>
              <th>Amount</th>
              <th>Match</th>
              <th>Slot check</th>
              <th>Integration</th>
            </tr>
          </thead>
          <tbody>${body || '<tr><td colspan="8" class="text-center text-muted py-3">No rows match filter.</td></tr>'}</tbody>
        </table>`;
    }

    const canIntegrate = parsedRows.some((r) => r.matchStatus === "matched" && r.slotStatus === "valid" && !r.integrated);
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
    showStatus("info", '<i class="bi bi-hourglass-split me-1"></i> Reading and parsing file...');
    setPipeline("parse");

    try {
      const ext = selectedFile.name.split(".").pop()?.toLowerCase();
      let result;
      if (ext === "pdf") {
        result = await parsePdfFile(selectedFile);
      } else {
        result = await parseExcelFile(selectedFile);
      }

      parsedRows = validateRows(parsedRows);
      lastParseMeta = result;

      setPipeline("validate");
      showStatus(
        "success",
        `<i class="bi bi-check-circle me-1"></i> Parsed <strong>${parsedRows.length}</strong> record(s) from ${result.format.toUpperCase()} (${escapeHtml(result.sheetName)}). Names and DOB validated against registry.`
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
    lastParseMeta = null;
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
    const toApply = parsedRows.filter((r) => r.matchStatus === "matched" && r.slotStatus === "valid" && !r.integrated);
    if (!toApply.length) return;

    if (integrateBtn) integrateBtn.disabled = true;
    showStatus("info", '<i class="bi bi-hourglass-split me-1"></i> Saving matched scholar records to system database...');

    try {
      const scholarsPayload = toApply.map((r) => ({
        registrationId: r.registrationId,
        profileId: r.profileId,
        scholarName: r.scholarName,
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
          scholars: scholarsPayload,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Could not integrate records into database.");
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
      });

      saveIntegrations(log.slice(0, 200));
      setPipeline("integrate");
      showStatus(
        "success",
        `<i class="bi bi-database-check me-1"></i> Successfully saved <strong>${data.updatedCount || toApply.length}</strong> scholar record(s) directly to the system database!`
      );
      renderResults();
      updateStats();
    } catch (err) {
      showStatus("danger", `<i class="bi bi-x-circle me-1"></i> ${escapeHtml(err.message || "Integration failed.")}`);
    } finally {
      if (integrateBtn) integrateBtn.disabled = false;
    }
  }

  function exportCsv() {
    if (!parsedRows.length) return;
    const headers = ["Scholar Name", "Program", "Sponsor", "Slot", "Amount", "Match", "Slot Status", "Integrated"];
    const lines = parsedRows.map((r) =>
      [r.scholarName, r.program, r.sponsor, r.slotId, r.amount, r.matchStatus, r.slotStatus, r.integrated]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `scholarship-parse-${Date.now()}.csv`;
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

  fileInput?.addEventListener("change", (e) => handleFile(e.target.files?.[0]));

  parseBtn?.addEventListener("click", runParse);
  clearBtn?.addEventListener("click", clearAll);
  integrateBtn?.addEventListener("click", integrateMatched);
  exportBtn?.addEventListener("click", exportCsv);
  rowSearch?.addEventListener("input", (e) => {
    rowFilter = e.target.value;
    renderResults();
  });

  updateStats();
  setPipeline("upload");
});
