/**
 * Registrar — scholarship management: upload, parse Excel/PDF, validate, integrate (demo).
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const STORAGE_KEY = "vtiac_scholarship_integrations";

/** Demo registry for name matching (replace with API). */
const STUDENT_REGISTRY = [
  { key: "maria santos", name: "Maria Santos", program: "Automotive Servicing (Engine Repair) NC II", studentId: "VTIAC-2026-0001" },
  { key: "john ramos", name: "John Ramos", program: "Automotive Servicing NC I", studentId: "VTIAC-2026-0002" },
  { key: "ana lopez", name: "Ana Lopez", program: "Driving NC II", studentId: "VTIAC-2026-0003" },
  { key: "paolo cruz", name: "Paolo Cruz", program: "Rice Machinery Operations NC II", studentId: "VTIAC-2026-0004" },
  { key: "liza navarro", name: "Liza Navarro", program: "Automotive Servicing NC I", studentId: "VTIAC-2026-0006" },
  { key: "juan dela cruz", name: "Juan Dela Cruz", program: "Automotive Servicing NC I", studentId: "VTIAC-2026-0101" },
  { key: "rosa fernandez", name: "Rosa Fernandez", program: "Driving NC II", studentId: "VTIAC-2026-0202" },
  { key: "rico tan", name: "Rico Tan", program: "Rice Machinery Operations NC II", studentId: "VTIAC-2026-0007" },
];

const COLUMN_ALIASES = {
  scholarName: ["scholar name", "name", "student name", "full name", "scholar", "beneficiary"],
  program: ["program", "course", "qualification", "program/course"],
  sponsor: ["sponsor", "grant", "funder", "organization"],
  slotId: ["slot id", "slot", "slot no", "allocation", "slot #"],
  amount: ["amount", "grant amount", "subsidy", "value", "php"],
  status: ["status", "remarks", "note"],
};

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
  const scholarName =
    pickField(raw, COLUMN_ALIASES.scholarName) ||
    Object.values(raw).find((v) => typeof v === "string" && v.length > 2) ||
    `Row ${index + 1}`;
  return {
    id: `row-${index}`,
    scholarName,
    program: pickField(raw, COLUMN_ALIASES.program) || "—",
    sponsor: pickField(raw, COLUMN_ALIASES.sponsor) || "",
    slotId: pickField(raw, COLUMN_ALIASES.slotId) || "",
    amount: pickField(raw, COLUMN_ALIASES.amount) || "",
    status: pickField(raw, COLUMN_ALIASES.status) || "Pending",
    matchStatus: "pending",
    slotStatus: "pending",
    studentId: null,
    integrated: false,
  };
}

function matchStudent(scholarName) {
  const key = normalizeKey(scholarName);
  const hit = STUDENT_REGISTRY.find((s) => s.key === key || key.includes(s.key) || s.key.includes(key));
  return hit || null;
}

function validateRows(rows, slotCap) {
  const usedSlots = new Set();
  let slotSeq = 0;

  return rows.map((row) => {
    const match = matchStudent(row.scholarName);
    row.matchStatus = match ? "matched" : "unmatched";
    row.studentId = match?.studentId ?? null;
    if (match && !row.program) row.program = match.program;

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
      const slotNum = parseInt(slot.replace(/\D/g, ""), 10);
      if (!Number.isNaN(slotNum) && slotNum > slotCap) {
        row.slotStatus = "over_capacity";
      } else if (usedSlots.size > slotCap) {
        row.slotStatus = "over_capacity";
      } else {
        row.slotStatus = "valid";
      }
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
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const rows = json.map((r, i) => normalizeParsedRow(r, i));
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
      statsEl.innerHTML = "";
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
    if (row.matchStatus === "matched") return '<span class="badge text-bg-success">Matched</span>';
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
        <td class="fw-medium">${escapeHtml(r.scholarName)}</td>
        <td>${escapeHtml(r.program)}</td>
        <td>${escapeHtml(r.sponsor || sponsorEl?.value || "—")}</td>
        <td>${escapeHtml(r.slotId || "—")}</td>
        <td>${escapeHtml(r.amount || "—")}</td>
        <td>${badgeMatch(r)}</td>
        <td>${badgeSlot(r)}</td>
        <td>${r.integrated ? '<span class="badge text-bg-primary">Applied</span>' : '<span class="badge text-bg-light text-dark">Pending</span>'}</td>
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

      const sponsor = sponsorEl?.value || "";
      parsedRows = result.rows.map((r) => ({
        ...r,
        sponsor: r.sponsor || sponsor,
      }));

      const cap = Number(slotCapEl?.value) || 25;
      parsedRows = validateRows(parsedRows, cap);
      lastParseMeta = result;

      setPipeline("validate");
      showStatus(
        "success",
        `<i class="bi bi-check-circle me-1"></i> Parsed <strong>${parsedRows.length}</strong> record(s) from ${result.format.toUpperCase()} (${escapeHtml(result.sheetName)}). Names and slots validated against the registry (demo).`
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

  function integrateMatched() {
    const sponsor = sponsorEl?.value || "External sponsor";
    const toApply = parsedRows.filter((r) => r.matchStatus === "matched" && r.slotStatus === "valid" && !r.integrated);
    if (!toApply.length) return;

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
      `<i class="bi bi-database-check me-1"></i> Applied <strong>${toApply.length}</strong> scholarship record(s) to student financial profiles (demo).`
    );
    renderResults();
    updateStats();
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

  slotCapEl?.addEventListener("change", () => {
    if (parsedRows.length) {
      parsedRows = validateRows(parsedRows, Number(slotCapEl.value) || 25);
      renderResults();
      updateStats();
    }
  });

  updateStats();
  setPipeline("upload");
});
