/**
 * Registrar Portal — National Assessment Examination Grading.
 *
 * Implements schedule date locking (locked for future dates, unlocked today & beyond),
 * program qualification tabs, track filtering (Assessment Only vs Training with Assessment),
 * dynamic scoring with unit competency calculations matching trainer module style,
 * and seamless synchronization with E.G.A.C.E records.
 */

import { getCsrfToken } from "./staff-settings-modal.js";

const SCORE_MIN = 0;
const SCORE_MAX = 100;
const PASSING_AVERAGE = 75.0;

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseScore(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < SCORE_MIN || num > SCORE_MAX) return null;
  return num;
}

function computeAverage(written, demo, interview) {
  const scores = [written, demo, interview].filter((s) => s != null);
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

function formatAverage(avg) {
  if (avg == null) return "—";
  return avg.toFixed(1) + "%";
}

function statusFromAverage(avg, passingAvg = PASSING_AVERAGE) {
  if (avg == null) return { label: "Pending", className: "badge bg-light text-muted border" };
  if (avg >= passingAvg) {
    return { label: "Competent", className: "badge bg-success-subtle text-success border border-success-subtle" };
  }
  return { label: "Not Yet Competent", className: "badge bg-danger-subtle text-danger border border-danger-subtle" };
}

class AssessmentGradingManager {
  constructor() {
    this.initialData = {};
    this.config = {};
    this.candidates = [];
    this.batches = [];
    this.programs = [];
    this.competenciesByProgram = {};
    this.todayStr = "";

    this.activeProgramTab = "all";
    this.searchQuery = "";

    this.currentCandidate = null;
    this.currentModalInstance = null;

    this.init();
  }

  init() {
    const dataEl = document.getElementById("assessment-grading-data");
    const configEl = document.getElementById("assessment-grading-config");

    if (dataEl) {
      try {
        this.initialData = JSON.parse(dataEl.textContent || "{}");
      } catch (err) {
        console.error("Failed to parse initial grading data:", err);
      }
    }

    if (configEl) {
      try {
        this.config = JSON.parse(configEl.textContent || "{}");
      } catch (err) {
        console.error("Failed to parse grading config:", err);
      }
    }

    this.candidates = this.initialData.candidates || [];
    this.batches = this.initialData.batches || [];
    this.programs = this.initialData.programs || [];
    this.competenciesByProgram = this.initialData.competencies_by_program || {};
    this.todayStr = this.initialData.today || new Date().toISOString().slice(0, 10);

    this.bindEvents();
    this.updateTabCounts();
    this.render();
  }

  bindEvents() {
    // 1. Program Tab Switching
    const tabsContainer = document.getElementById("programTabsList");
    if (tabsContainer) {
      tabsContainer.addEventListener("click", (e) => {
        const tabBtn = e.target.closest("[data-program-tab]");
        if (!tabBtn) return;

        tabsContainer.querySelectorAll("[data-program-tab]").forEach((btn) => {
          btn.classList.remove("is-active");
          btn.setAttribute("aria-selected", "false");
        });

        tabBtn.classList.add("is-active");
        tabBtn.setAttribute("aria-selected", "true");

        this.activeProgramTab = tabBtn.getAttribute("data-program-tab") || "all";
        this.render();
      });
    }

    // 2. Search Input
    const searchInput = document.getElementById("candidateSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = (e.target.value || "").trim().toLowerCase();
        this.render();
      });
    }

    // 4. Modal Save Button
    const saveBtn = document.getElementById("btnSaveAssessmentGrade");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.handleSaveGrade());
    }

    // 5. Table actions (delegation)
    const tbody = document.getElementById("assessmentCandidatesTbody");
    if (tbody) {
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action='open-grade-modal']");
        if (!btn) return;
        const candId = btn.getAttribute("data-candidate-id");
        const cand = this.candidates.find((c) => String(c.id) === String(candId) || String(c.registrationId) === String(candId));
        if (cand) {
          this.openGradingModal(cand);
        }
      });
    }
  }

  updateTabCounts() {
    const allCountEl = document.getElementById("countAllPrograms");
    if (allCountEl) {
      allCountEl.textContent = String(this.candidates.length);
    }

    this.programs.forEach((prog) => {
      const countEl = document.querySelector(`[data-program-count="${CSS.escape(prog)}"]`);
      if (countEl) {
        const count = this.candidates.filter((c) => (c.courseName || "").toLowerCase() === prog.toLowerCase()).length;
        countEl.textContent = String(count);
      }
    });
  }

  getFilteredCandidates() {
    return this.candidates.filter((cand) => {
      // Program Tab
      if (this.activeProgramTab !== "all") {
        if ((cand.courseName || "").toLowerCase() !== this.activeProgramTab.toLowerCase()) {
          return false;
        }
      }

      // Search Query
      if (this.searchQuery) {
        const hay = [
          cand.fullName,
          cand.referenceId,
          cand.registrationId,
          cand.batchLabel,
          cand.courseName,
          cand.examinerName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!hay.includes(this.searchQuery)) return false;
      }

      return true;
    });
  }

  render() {
    const filtered = this.getFilteredCandidates();
    const tbody = document.getElementById("assessmentCandidatesTbody");
    const emptyState = document.getElementById("assessmentEmptyState");
    const displayedCount = document.getElementById("displayedCandidatesCount");
    const headerTitle = document.getElementById("activeProgramHeader");

    if (headerTitle) {
      if (this.activeProgramTab === "all") {
        headerTitle.textContent = "All Assessment Batches & Candidates";
      } else {
        headerTitle.textContent = `${this.activeProgramTab} — Assessment Batches`;
      }
    }

    if (displayedCount) {
      displayedCount.textContent = String(filtered.length);
    }

    // Render Batch Lock Status Strip
    this.renderBatchStatusStrip();

    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.classList.remove("d-none");
      return;
    }

    if (emptyState) emptyState.classList.add("d-none");

    const rowsHtml = filtered
      .map((cand) => {
        // Lock status badge
        const lockBadge = cand.isLocked
          ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2.5 py-1 rounded-pill" title="Locked until exam date ${escapeHtml(cand.scheduleDateFormatted || cand.scheduleDate)}">
               <i class="bi bi-lock-fill me-1"></i>Locked
             </span>`
          : `<span class="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 rounded-pill" title="Schedule is today or beyond. Unlocked for grading.">
               <i class="bi bi-unlock-fill me-1"></i>Open (Today &amp; Beyond)
             </span>`;

        // Exam Result badge
        let resultBadge;
        if (cand.assessmentResult === "competent") {
          resultBadge = `<span class="badge bg-success text-white px-2.5 py-1 rounded-pill"><i class="bi bi-check-circle-fill me-1"></i>Competent</span>`;
        } else if (cand.assessmentResult === "not_yet_competent") {
          resultBadge = `<span class="badge bg-danger text-white px-2.5 py-1 rounded-pill"><i class="bi bi-x-circle-fill me-1"></i>Not Yet Competent</span>`;
        } else {
          resultBadge = `<span class="badge bg-secondary-subtle text-secondary border px-2.5 py-1 rounded-pill"><i class="bi bi-clock me-1"></i>Not Yet Assessed</span>`;
        }

        // Action button
        const actionLabel = cand.assessmentResult !== "pending" ? "View / Edit Grade" : (cand.isLocked ? "View Sheet (Locked)" : "Grade Exam");
        const actionBtnClass = cand.isLocked ? "btn-outline-secondary" : (cand.assessmentResult !== "pending" ? "btn-outline-success" : "btn-success");
        const actionIcon = cand.isLocked ? "bi-lock" : (cand.assessmentResult !== "pending" ? "bi-pencil-square" : "bi-pencil-fill");

        return `
          <tr class="align-middle">
            <td>
              <div class="fw-bold text-dark">${escapeHtml(cand.fullName)}</div>
              <div class="d-flex align-items-center gap-1.5 mt-0.5">
                <span class="badge bg-light text-muted border font-monospace fs-8">${escapeHtml(cand.referenceId || cand.registrationId || "ID")}</span>
              </div>
            </td>
            <td>
              <span class="fw-semibold text-secondary small">${escapeHtml(cand.courseName)}</span>
            </td>
            <td>
              <div class="small fw-semibold text-dark">${escapeHtml(cand.batchLabel)}</div>
              <div class="text-muted small">
                <i class="bi bi-calendar3 me-1"></i>${escapeHtml(cand.scheduleDateFormatted || "Date pending")}
              </div>
            </td>
            <td class="text-center">${lockBadge}</td>
            <td class="text-center">${resultBadge}</td>
            <td class="text-end">
              <button type="button" class="btn btn-sm ${actionBtnClass} rounded-pill px-3 shadow-xs"
                      data-action="open-grade-modal"
                      data-candidate-id="${escapeHtml(cand.id || cand.registrationId)}">
                <i class="bi ${actionIcon} me-1"></i>${actionLabel}
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    tbody.innerHTML = rowsHtml;
  }

  renderBatchStatusStrip() {
    const strip = document.getElementById("batchesLockStatusStrip");
    if (!strip) return;

    let relevantBatches = this.batches;
    if (this.activeProgramTab !== "all") {
      relevantBatches = this.batches.filter((b) => (b.courseName || "").toLowerCase() === this.activeProgramTab.toLowerCase());
    }

    if (relevantBatches.length === 0) {
      strip.innerHTML = "";
      return;
    }

    const pills = relevantBatches
      .map((b) => {
        const isLocked = b.isLocked;
        const icon = isLocked ? "bi-lock-fill" : "bi-calendar-check-fill";
        const badgeColor = isLocked ? "bg-warning-subtle text-warning-emphasis border border-warning-subtle" : "bg-success-subtle text-success border border-success-subtle";
        const statusText = isLocked ? `Locked until ${escapeHtml(b.scheduleDateFormatted)}` : `Open (${escapeHtml(b.scheduleDateFormatted)})`;

        return `
          <div class="d-inline-flex align-items-center gap-1.5 px-3 py-1.5 rounded-pill small ${badgeColor}">
            <i class="bi ${icon}"></i>
            <strong>${escapeHtml(b.batchLabel)}</strong>:
            <span>${statusText}</span>
          </div>
        `;
      })
      .join("");

    strip.innerHTML = pills;
  }

  openGradingModal(cand) {
    this.currentCandidate = cand;

    const modalEl = document.getElementById("assessmentGradingModal");
    if (!modalEl) return;

    // Set Header & Meta
    const nameEl = document.getElementById("modalCandidateName");
    const metaEl = document.getElementById("modalCandidateMeta");
    const schedEl = document.getElementById("modalScheduleMeta");
    const venueEl = document.getElementById("modalAssessorVenueMeta");
    const trackBadge = document.getElementById("modalTrackBadge");
    const lockBadge = document.getElementById("modalLockBadge");
    const lockAlert = document.getElementById("modalLockAlert");
    const errorAlert = document.getElementById("modalGradingError");
    const saveBtn = document.getElementById("btnSaveAssessmentGrade");

    if (errorAlert) errorAlert.classList.add("d-none");

    if (nameEl) nameEl.textContent = cand.fullName;
    if (metaEl) {
      metaEl.textContent = `ID: ${cand.referenceId || cand.registrationId || "—"} • Qualification: ${cand.courseName}`;
    }
    if (schedEl) {
      schedEl.textContent = `Batch: ${cand.batchLabel} • Scheduled: ${cand.scheduleDateFormatted || cand.scheduleDate || "TBA"}`;
    }
    if (venueEl) {
      venueEl.textContent = `Assessor: ${cand.examinerName || "Official TESDA Assessor"}`;
    }

    // Candidate Badge
    if (trackBadge) {
      trackBadge.className = "badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 rounded-pill";
      trackBadge.textContent = "National Assessment Candidate";
    }

    // Lock Status Handling
    const isLocked = Boolean(cand.isLocked);
    if (lockBadge) {
      if (isLocked) {
        lockBadge.className = "badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2.5 py-1 rounded-pill";
        lockBadge.innerHTML = `<i class="bi bi-lock-fill me-1"></i>Exam Locked (Future Date)`;
      } else {
        lockBadge.className = "badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1 rounded-pill";
        lockBadge.innerHTML = `<i class="bi bi-unlock-fill me-1"></i>Exam Open (Today & Beyond)`;
      }
    }

    if (lockAlert) {
      lockAlert.classList.toggle("d-none", !isLocked);
    }

    if (saveBtn) {
      saveBtn.disabled = isLocked;
      if (isLocked) {
        saveBtn.innerHTML = `<i class="bi bi-lock-fill me-1.5"></i>Locked (Opens on Exam Date)`;
        saveBtn.classList.replace("btn-success", "btn-secondary");
      } else {
        saveBtn.innerHTML = `<i class="bi bi-check2-circle me-1.5"></i>Save Assessment Grade`;
        saveBtn.classList.replace("btn-secondary", "btn-success");
      }
    }

    // Render Unit Competencies Table
    this.renderCompetenciesTable(cand, isLocked);

    // Set Verdict Fields
    const verdictSelect = document.getElementById("modalVerdictSelect");
    const examDateInput = document.getElementById("modalExamDateInput");
    const examinerInput = document.getElementById("modalExaminerInput");
    const remarksInput = document.getElementById("modalRemarksInput");

    if (verdictSelect) {
      verdictSelect.value = cand.assessmentResult === "competent" ? "competent" : (cand.assessmentResult === "not_yet_competent" ? "not_yet_competent" : "");
      verdictSelect.disabled = isLocked;
    }
    if (examDateInput) {
      examDateInput.value = cand.examDate || cand.scheduleDate || this.todayStr;
      examDateInput.disabled = isLocked;
    }
    if (examinerInput) {
      examinerInput.value = cand.examinerName || "Official TESDA Assessor";
      examinerInput.disabled = isLocked;
    }
    if (remarksInput) {
      remarksInput.value = cand.remarks || "";
      remarksInput.disabled = isLocked;
    }

    // Show modal via Bootstrap
    if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
      this.currentModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
      this.currentModalInstance.show();
    }
  }

  renderCompetenciesTable(cand, isLocked) {
    const tbody = document.getElementById("modalCompetenciesTbody");
    if (!tbody) return;

    const progName = cand.courseName || "";
    const ucs = this.competenciesByProgram[progName] || [];

    if (ucs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            <i class="bi bi-info-circle me-1"></i>No unit competencies registered for <strong>${escapeHtml(progName)}</strong>. Overall verdict can still be set below.
          </td>
        </tr>
      `;
      return;
    }

    // Group competencies into Basic, Common, Core
    const groups = {
      basic: {
        key: "basic",
        label: "Basic Competencies",
        shortLabel: "Basic",
        badge: "bg-success text-white",
        subtleBadge: "bg-success-subtle text-success border border-success-subtle",
        icon: "bi-check2-circle",
        desc: "Workplace communication, teamwork & safety foundations",
        units: [],
      },
      common: {
        key: "common",
        label: "Common Competencies",
        shortLabel: "Common",
        badge: "bg-primary text-white",
        subtleBadge: "bg-primary-subtle text-primary border border-primary-subtle",
        icon: "bi-gear-fill",
        desc: "Quality standards, tools, mensuration & workshop operations",
        units: [],
      },
      core: {
        key: "core",
        label: "Core Competencies",
        shortLabel: "Core",
        badge: "bg-warning text-dark border border-warning",
        subtleBadge: "bg-warning-subtle text-dark border border-warning",
        icon: "bi-award-fill",
        desc: "Core trade qualifications & technical performance demonstration",
        units: [],
      },
    };

    ucs.forEach((uc, idx) => {
      const catKey = (uc.category || "core").toLowerCase();
      if (groups[catKey]) {
        groups[catKey].units.push({ ...uc, originalIndex: idx });
      } else {
        groups.core.units.push({ ...uc, originalIndex: idx });
      }
    });

    // Update filter badge counts
    const countAllEl = document.getElementById("modalCompCountAll");
    const countBasicEl = document.getElementById("modalCompCountBasic");
    const countCommonEl = document.getElementById("modalCompCountCommon");
    const countCoreEl = document.getElementById("modalCompCountCore");

    if (countAllEl) countAllEl.textContent = String(ucs.length);
    if (countBasicEl) countBasicEl.textContent = String(groups.basic.units.length);
    if (countCommonEl) countCommonEl.textContent = String(groups.common.units.length);
    if (countCoreEl) countCoreEl.textContent = String(groups.core.units.length);

    const scores = cand.scores || {};
    const disabledAttr = isLocked ? "disabled" : "";

    let rowsHtml = "";

    ["basic", "common", "core"].forEach((catKey) => {
      const grp = groups[catKey];
      if (grp.units.length === 0) return;

      // Group header divider row
      rowsHtml += `
        <tr class="table-light comp-category-header" data-category-group="${catKey}">
          <td colspan="5" class="py-2.5 px-3 bg-light border-top border-bottom">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div class="d-flex align-items-center gap-2">
                <span class="badge ${grp.badge} px-2.5 py-1 text-uppercase fw-bold fs-8">
                  <i class="bi ${grp.icon} me-1"></i>${grp.label}
                </span>
                <span class="text-muted small fw-semibold">(${grp.units.length} ${grp.units.length === 1 ? 'Unit' : 'Units'})</span>
              </div>
              <span class="text-muted small d-none d-md-inline">${grp.desc}</span>
            </div>
          </td>
        </tr>
      `;

      // Group rows
      grp.units.forEach((uc) => {
        const ucId = String(uc.id || uc.originalIndex);
        const ucScore = scores[ucId] || {};
        const writtenVal = ucScore.written != null ? ucScore.written : "";
        const demoVal = ucScore.demo != null ? ucScore.demo : "";
        const interviewVal = ucScore.interview != null ? ucScore.interview : "";

        const wNum = parseScore(writtenVal);
        const dNum = parseScore(demoVal);
        const iNum = parseScore(interviewVal);
        const avg = computeAverage(wNum, dNum, iNum);
        const status = statusFromAverage(avg);

        rowsHtml += `
          <tr data-uc-id="${escapeHtml(ucId)}" data-uc-category="${catKey}" class="align-middle comp-unit-row">
            <td>
              <div class="d-flex align-items-start gap-2">
                <span class="badge ${grp.subtleBadge} px-2 py-0.5 rounded-pill fs-8 flex-shrink-0 mt-0.5">${grp.shortLabel}</span>
                <div>
                  <div class="fw-semibold text-dark">${escapeHtml(uc.title || uc.name || `Unit ${uc.originalIndex + 1}`)}</div>
                  ${(uc.code || uc.unit_code) ? `<span class="badge bg-light text-muted border font-monospace fs-8">${escapeHtml(uc.code || uc.unit_code)}</span>` : ""}
                </div>
              </div>
            </td>
            <td class="text-center">
              <input type="number" min="0" max="100" step="1"
                     class="form-control form-control-sm text-center fw-semibold uc-score-input"
                     data-score-type="written"
                     value="${escapeHtml(writtenVal)}"
                     placeholder="0–100" ${disabledAttr} />
            </td>
            <td class="text-center">
              <input type="number" min="0" max="100" step="1"
                     class="form-control form-control-sm text-center fw-semibold uc-score-input"
                     data-score-type="demo"
                     value="${escapeHtml(demoVal)}"
                     placeholder="0–100" ${disabledAttr} />
            </td>
            <td class="text-center">
              <input type="number" min="0" max="100" step="1"
                     class="form-control form-control-sm text-center fw-semibold uc-score-input"
                     data-score-type="interview"
                     value="${escapeHtml(interviewVal)}"
                     placeholder="0–100" ${disabledAttr} />
            </td>
            <td class="text-center uc-calc-cell">
              <div class="uc-avg-display fw-bold text-dark">${formatAverage(avg)}</div>
              <div class="uc-status-badge mt-1"><span class="${status.className}">${status.label}</span></div>
            </td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = rowsHtml;

    // Bind category filter pill clicks
    const filterContainer = document.getElementById("modalCompCategoryFilter");
    if (filterContainer) {
      filterContainer.querySelectorAll("[data-comp-filter]").forEach((btn) => {
        const cat = btn.getAttribute("data-comp-filter");
        btn.classList.toggle("active", cat === "all");
        btn.classList.toggle("btn-dark", cat === "all");

        btn.onclick = (e) => {
          const filterBtn = e.target.closest("[data-comp-filter]");
          if (!filterBtn) return;
          const targetCat = filterBtn.getAttribute("data-comp-filter");

          filterContainer.querySelectorAll("[data-comp-filter]").forEach((b) => {
            b.classList.remove("active", "btn-dark", "btn-success", "btn-primary", "btn-warning");
            const c = b.getAttribute("data-comp-filter");
            if (c === "all") b.className = "btn btn-sm btn-outline-dark rounded-pill px-3 py-1 fs-8";
            else if (c === "basic") b.className = "btn btn-sm btn-outline-success rounded-pill px-3 py-1 fs-8";
            else if (c === "common") b.className = "btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fs-8";
            else if (c === "core") b.className = "btn btn-sm btn-outline-warning text-dark rounded-pill px-3 py-1 fs-8";
          });

          filterBtn.classList.add("active");
          if (targetCat === "all") filterBtn.className = "btn btn-sm btn-dark rounded-pill px-3 py-1 fs-8 active";
          else if (targetCat === "basic") filterBtn.className = "btn btn-sm btn-success rounded-pill px-3 py-1 fs-8 active";
          else if (targetCat === "common") filterBtn.className = "btn btn-sm btn-primary rounded-pill px-3 py-1 fs-8 active";
          else if (targetCat === "core") filterBtn.className = "btn btn-sm btn-warning text-dark rounded-pill px-3 py-1 fs-8 active";

          tbody.querySelectorAll(".comp-category-header").forEach((hdr) => {
            const grp = hdr.getAttribute("data-category-group");
            hdr.classList.toggle("d-none", targetCat !== "all" && grp !== targetCat);
          });

          tbody.querySelectorAll(".comp-unit-row").forEach((row) => {
            const rowCat = row.getAttribute("data-uc-category");
            row.classList.toggle("d-none", targetCat !== "all" && rowCat !== targetCat);
          });
        };
      });
    }

    if (!isLocked) {
      // Bind live calculation events
      tbody.querySelectorAll(".uc-score-input").forEach((input) => {
        input.addEventListener("input", (e) => {
          let val = e.target.value;
          if (val !== "") {
            let num = Number(val);
            if (num > SCORE_MAX) e.target.value = SCORE_MAX;
            if (num < SCORE_MIN) e.target.value = SCORE_MIN;
          }
          this.recalculateUcRow(e.target.closest("tr"));
          this.checkAndSuggestOverallVerdict();
        });
      });
    }
  }

  recalculateUcRow(row) {
    if (!row) return;
    const writtenInput = row.querySelector("[data-score-type='written']");
    const demoInput = row.querySelector("[data-score-type='demo']");
    const interviewInput = row.querySelector("[data-score-type='interview']");
    const avgDisplay = row.querySelector(".uc-avg-display");
    const statusWrap = row.querySelector(".uc-status-badge");

    const w = parseScore(writtenInput?.value);
    const d = parseScore(demoInput?.value);
    const i = parseScore(interviewInput?.value);
    const avg = computeAverage(w, d, i);
    const status = statusFromAverage(avg);

    if (avgDisplay) avgDisplay.textContent = formatAverage(avg);
    if (statusWrap) {
      statusWrap.innerHTML = `<span class="${status.className}">${status.label}</span>`;
    }
  }

  checkAndSuggestOverallVerdict() {
    const rows = document.querySelectorAll("#modalCompetenciesTbody tr[data-uc-id]");
    if (rows.length === 0) return;

    let allGraded = true;
    let anyNyc = false;

    rows.forEach((row) => {
      const written = parseScore(row.querySelector("[data-score-type='written']")?.value);
      const demo = parseScore(row.querySelector("[data-score-type='demo']")?.value);
      const interview = parseScore(row.querySelector("[data-score-type='interview']")?.value);
      const avg = computeAverage(written, demo, interview);

      if (avg == null) {
        allGraded = false;
      } else if (avg < PASSING_AVERAGE) {
        anyNyc = true;
      }
    });

    const verdictSelect = document.getElementById("modalVerdictSelect");
    if (verdictSelect && allGraded) {
      if (!anyNyc) {
        verdictSelect.value = "competent";
      } else {
        verdictSelect.value = "not_yet_competent";
      }
    }
  }

  async handleSaveGrade() {
    if (!this.currentCandidate) return;
    const cand = this.currentCandidate;

    const errorAlert = document.getElementById("modalGradingError");
    if (errorAlert) {
      errorAlert.classList.add("d-none");
      errorAlert.textContent = "";
    }

    const verdictSelect = document.getElementById("modalVerdictSelect");
    const examDateInput = document.getElementById("modalExamDateInput");
    const examinerInput = document.getElementById("modalExaminerInput");
    const remarksInput = document.getElementById("modalRemarksInput");
    const saveBtn = document.getElementById("btnSaveAssessmentGrade");

    const verdict = verdictSelect?.value;
    if (!verdict) {
      if (errorAlert) {
        errorAlert.textContent = "Please select an Official Assessment Verdict (Competent or Not Yet Competent).";
        errorAlert.classList.remove("d-none");
      }
      return;
    }

    // Collect UC scores
    const scores = {};
    document.querySelectorAll("#modalCompetenciesTbody tr[data-uc-id]").forEach((row) => {
      const ucId = row.getAttribute("data-uc-id");
      const w = parseScore(row.querySelector("[data-score-type='written']")?.value);
      const d = parseScore(row.querySelector("[data-score-type='demo']")?.value);
      const i = parseScore(row.querySelector("[data-score-type='interview']")?.value);
      scores[ucId] = { written: w, demo: d, interview: i };
    });

    const payload = {
      student_key: cand.registrationId || cand.referenceId || cand.id,
      student_name: cand.fullName,
      program: cand.courseName,
      template_id: cand.batchId,
      scores: scores,
      learning_outcomes: {},
      national_assessment: {
        result: verdict === "competent" ? "Competent" : "Not Yet Competent",
        date: examDateInput?.value || this.todayStr,
        examiner: examinerInput?.value || "Official TESDA Assessor",
        remarks: remarksInput?.value || "",
      },
    };

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1.5" role="status" aria-hidden="true"></span>Saving Assessment Grade...`;
    }

    try {
      const saveUrl = this.config.endpoints?.save || "/registrar/api/assessment-grading/save/";
      const response = await fetch(saveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Failed to save assessment examination grade.");
      }

      // Update in-memory candidate data
      cand.assessmentResult = data.result || verdict;
      cand.scores = data.scores || scores;
      cand.examDate = payload.national_assessment.date;
      cand.examinerName = payload.national_assessment.examiner;
      cand.remarks = payload.national_assessment.remarks;

      // Close modal
      if (this.currentModalInstance) {
        this.currentModalInstance.hide();
      }

      // Refresh candidate table
      this.render();

      // Show temporary toast or feedback
      this.showSaveSuccessToast(cand.fullName, cand.assessmentResult === "competent");
    } catch (err) {
      console.error("Save assessment grade error:", err);
      if (errorAlert) {
        errorAlert.textContent = err.message || "An unexpected error occurred while saving.";
        errorAlert.classList.remove("d-none");
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="bi bi-check2-circle me-1.5"></i>Save Assessment Grade`;
      }
    }
  }

  showSaveSuccessToast(candidateName, isCompetent) {
    const existing = document.getElementById("gradingSaveToast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "gradingSaveToast";
    toast.className = "toast align-items-center text-white border-0 position-fixed bottom-0 end-0 m-4 shadow-lg";
    toast.style.zIndex = "1090";
    toast.classList.add(isCompetent ? "bg-success" : "bg-warning-subtle", isCompetent ? "text-white" : "text-dark");

    toast.innerHTML = `
      <div class="d-flex p-2">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${isCompetent ? "bi-check-circle-fill" : "bi-exclamation-triangle-fill"} fs-5"></i>
          <div>
            <strong>Grade Saved:</strong> ${escapeHtml(candidateName)} marked as <em>${isCompetent ? "Competent" : "Not Yet Competent"}</em>. Synchronized with E.G.A.C.E records.
          </div>
        </div>
        <button type="button" class="btn-close ${isCompetent ? "btn-close-white" : ""} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;

    document.body.appendChild(toast);
    if (typeof bootstrap !== "undefined" && bootstrap.Toast) {
      const toastInstance = new bootstrap.Toast(toast, { delay: 4500 });
      toastInstance.show();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new AssessmentGradingManager();
});
