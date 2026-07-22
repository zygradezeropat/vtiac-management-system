/**
 * Registrar — batching & scheduling: course overview + class schedule builder.
 */

import { showScheduleSavedConfirm } from "./registrar-schedule-saved-modal.js";
import {
  DAY_CODES,
  DAY_LABELS,
  WEEKDAY_CODES,
  WEEKEND_CODES,
  computeDailyHours,
  createEmptyTemplateForm,
  daysForScheduleType,
  daysSummary,
  formatBatchConflictLabel,
  formatTime12h,
  schedulesConflict,
  scheduleTypeLabel,
  templateDisplayTitle,
  trainerMatchesBatch,
} from "./registrar-schedule-templates.js";

const MIN_STUDENTS_TO_FINALIZE = 3;
const BATCH_CAPACITY = 25;

const BATCH_CATEGORY_TABS = [
  { key: "institutional", label: "Institutional Competency" },
  { key: "national", label: "National Competency" },
];

/** Training days required per course (5.2). */
export const COURSE_DURATIONS = {
  "Driving NC II": 19,
  "Driving NC III (Passenger Bus / Straight Truck)": 24,
  "Automotive Servicing NC I": 61,
  "Automotive Servicing NC II": 37,
  "Automotive Servicing (Engine Repair) NC II": 37,
  "Rice Machinery Operations NC II": 29,
  Assessment: 1,
  "Competency Assessment": 1,
};

export const COURSES_DATA = [
  {
    id: "driving",
    name: "Driving NC II",
    durationDays: 19,
    batches: [
      {
        id: "b1",
        label: "Batch 1",
        students: [
          { lastName: "Diaz", firstName: "Carlos", program: "Driving NC II" },
          { lastName: "Garcia", firstName: "Luis", program: "Driving NC II" },
          { lastName: "Hernandez", firstName: "Ana", program: "Driving NC II" },
          { lastName: "Ortiz", firstName: "Mark", program: "Driving NC II" },
        ],
      },
    ],
  },
  {
    id: "driving-nc3",
    name: "Driving NC III (Passenger Bus / Straight Truck)",
    durationDays: 24,
    batches: [
      {
        id: "b1",
        label: "Batch 1",
        students: [
          {
            lastName: "Ramirez",
            firstName: "Joel",
            program: "Driving NC III (Passenger Bus / Straight Truck)",
          },
        ],
      },
    ],
  },
  {
    id: "rice",
    name: "Rice Machinery Operations NC II",
    durationDays: 29,
    batches: [
      {
        id: "b1",
        label: "Batch 1",
        students: [{ lastName: "Torres", firstName: "Ben", program: "Rice Machinery Operations NC II" }],
      },
    ],
  },
  {
    id: "automotive-1",
    name: "Automotive Servicing NC I",
    durationDays: 61,
    batches: [
      {
        id: "b1",
        label: "Batch 1",
        students: [
          { lastName: "Santos", firstName: "Maria", program: "Automotive Servicing NC I" },
          { lastName: "Reyes", firstName: "Paolo", program: "Automotive Servicing NC I" },
          { lastName: "Lim", firstName: "Grace", program: "Automotive Servicing NC I" },
          { lastName: "Cruz", firstName: "Noel", program: "Automotive Servicing NC I" },
          { lastName: "Bautista", firstName: "Rosa", program: "Automotive Servicing NC I" },
        ],
      },
    ],
  },
  {
    id: "automotive-2",
    name: "Automotive Servicing NC II",
    durationDays: 37,
    batches: [
      {
        id: "b1",
        label: "Batch 1",
        students: [
          { lastName: "Mendoza", firstName: "Rico", program: "Automotive Servicing NC II" },
          { lastName: "Navarro", firstName: "Liza", program: "Automotive Servicing NC II" },
        ],
      },
    ],
  },
  {
    id: "competency",
    name: "Competency Assessment",
    durationDays: 1,
    batches: [
      {
        id: "b1",
        label: "Batch 1",
        students: [{ lastName: "Castillo", firstName: "Troy", program: "Competency Assessment" }],
      },
    ],
  },
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function courseDurationDays(course) {
  return course.durationDays ?? COURSE_DURATIONS[course.name] ?? 0;
}

function activeBatchStudentCount(course) {
  const batch = course.batches[0];
  if (!batch) return 0;
  if (typeof batch.studentCount === "number") return batch.studentCount;
  return Array.isArray(batch.students) ? batch.students.length : 0;
}

function courseStatus(course) {
  const count = activeBatchStudentCount(course);
  if (count >= MIN_STUDENTS_TO_FINALIZE) {
    return { key: "ready", label: "Ready", class: "registrar-batch-card__status--ready" };
  }
  return { key: "open", label: "Open", class: "registrar-batch-card__status--open" };
}

function studentsNeeded(course) {
  const count = activeBatchStudentCount(course);
  return Math.max(0, MIN_STUDENTS_TO_FINALIZE - count);
}

function loadBatchingTrainersData() {
  const el = document.getElementById("batching-trainers-data");
  if (!el?.textContent) return [];
  try {
    const parsed = JSON.parse(el.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeQualificationLabel(value) {
  return String(value || "")
    .replace(/^other:\s*/i, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function loadBatchingCoursesData() {
  const el = document.getElementById("batching-courses-data");
  if (!el?.textContent) return [];
  try {
    const parsed = JSON.parse(el.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadBatchingTemplatesData() {
  const el = document.getElementById("batching-templates-data");
  if (!el?.textContent) return {};
  try {
    const parsed = JSON.parse(el.textContent);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function loadBatchingPendingEnrollmentsData() {
  const el = document.getElementById("batching-pending-enrollments-data");
  if (!el?.textContent) return [];
  try {
    const parsed = JSON.parse(el.textContent);
    if (Array.isArray(parsed?.modules)) {
      return parsed.modules.flatMap((mod) => mod.items || []);
    }
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function pendingItemKey(item) {
  return item.id != null ? `p-${item.id}` : `r-${item.registrationId}`;
}

function pendingMatchesCourse(item, course) {
  if (!course || (item.program || "").trim() !== course.name) return false;
  const isNational = batchingCourseCategory(course) === "national";
  const isAssessment = item.programType === "assessment_only";
  return isNational ? isAssessment : !isAssessment;
}

function parseStudentNameParts(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** True when id is a saved DB template pk (not a client-only tpl-* placeholder). */
function isPersistedTemplateId(id) {
  return /^\d+$/.test(String(id || "").trim());
}

function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");
  if (input?.value) return input.value;
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function batchingCourseCategory(course) {
  if (course?.batchKind === "national_assessment") {
    return "national";
  }
  const fromServer = course?.category;
  if (fromServer === "assessment") {
    return "national";
  }
  if (fromServer && BATCH_CATEGORY_TABS.some((t) => t.key === fromServer)) {
    return fromServer;
  }
  return "institutional";
}

function coursesInCategory(category) {
  return COURSES_DATA.filter((course) => batchingCourseCategory(course) === category);
}

function canonicalCourseKey(value) {
  const normalized = normalizeQualificationLabel(value);
  if (!normalized) return "";
  if (normalized.includes("automotive servicing") && normalized.includes("nc i")) {
    return "automotive servicing nc i";
  }
  if (normalized.includes("automotive") && normalized.includes("engine repair") && normalized.includes("nc ii")) {
    return "automotive servicing engine repair nc ii";
  }
  if (normalized.includes("automotive servicing") && normalized.includes("nc ii")) {
    return "automotive servicing engine repair nc ii";
  }
  if (normalized.includes("driving") && normalized.includes("nc iii")) {
    return "driving nc iii";
  }
  if (normalized.includes("driving") && normalized.includes("nc ii")) {
    return "driving nc ii";
  }
  if (normalized.includes("rice machinery operations") && normalized.includes("nc ii")) {
    return "rice machinery operations nc ii";
  }
  if (normalized.includes("competency assessment")) {
    return "competency assessment";
  }
  return normalized;
}

document.addEventListener("DOMContentLoaded", () => {
  const categoryTabsEl = document.getElementById("batching-category-tabs");
  const coursesEl = document.getElementById("batching-courses");
  const coursesEmptyEl = document.getElementById("batching-courses-empty");
  const placeholderEl = document.getElementById("batching-placeholder");
  const detailEl = document.getElementById("batching-detail");
  const detailTitleEl = document.getElementById("batching-detail-title");
  const detailSubtitleEl = document.getElementById("batching-detail-subtitle");
  const durationBadgeEl = document.getElementById("batching-duration-badge");
  const closeBtn = document.getElementById("batching-detail-close");

  const templateForm = document.getElementById("schedule-template-form");
  const daysErrorEl = document.getElementById("template-days-error");
  const dayPillsEl = document.getElementById("day-pills");
  const typePillsEl = document.getElementById("schedule-type-pills");
  const timeFromEl = document.getElementById("template-time-from");
  const timeToEl = document.getElementById("template-time-to");
  const dailyHoursEl = document.getElementById("template-daily-hours");
  const availableFromEl = document.getElementById("template-available-from");
  const availableUntilEl = document.getElementById("template-available-until");
  const trainerEl = document.getElementById("template-trainer");
  const trainerHintEl = document.getElementById("template-trainer-hint");
  const scheduleConflictEl = document.getElementById("template-schedule-conflict");
  const cancelBtn = document.getElementById("schedule-template-cancel");

  const approvalSectionEl = document.getElementById("batching-enrollment-approval");
  const pendingStudentsEl = document.getElementById("batching-pending-students");
  const pendingEmptyEl = document.getElementById("batching-pending-empty");
  const selectAllEl = document.getElementById("batching-select-all");
  const bulkApproveBtn = document.getElementById("batching-bulk-approve-btn");
  const bulkApproveCountEl = document.getElementById("batching-bulk-approve-count");

  if (!coursesEl) return;

  let selectedCourseId = null;
  let activeCategoryTab = "institutional";
  let formState = createEmptyTemplateForm();
  let editingTemplateId = null;
  let bulkApproveInFlight = false;
  const selectedPendingKeys = new Set();
  let pendingEnrollments = loadBatchingPendingEnrollmentsData();
  const allTrainers = loadBatchingTrainersData();
  const dbCourses = loadBatchingCoursesData();
  if (dbCourses.length) {
    COURSES_DATA.splice(0, COURSES_DATA.length, ...dbCourses);
  }
  const templatesByCourse = loadBatchingTemplatesData();

  function getCourse(id) {
    return COURSES_DATA.find((c) => c.id === id);
  }

  function selectedCourse() {
    return selectedCourseId ? getCourse(selectedCourseId) : null;
  }

  function getTemplatesForCourse(courseId) {
    const list = templatesByCourse[courseId];
    return Array.isArray(list) ? list : [];
  }

  function setTemplatesForCourse(courseId, templates) {
    templatesByCourse[courseId] = templates;
  }

  function pendingForSelectedCourse() {
    const course = selectedCourse();
    if (!course) return [];
    return pendingEnrollments.filter((item) => pendingMatchesCourse(item, course));
  }

  function approvablePendingForSelectedCourse() {
    return pendingForSelectedCourse().filter((item) => item.canApprove);
  }

  function syncSelectAllState() {
    if (!selectAllEl) return;
    const approvable = approvablePendingForSelectedCourse();
    const approvableKeys = approvable.map((item) => pendingItemKey(item));
    const selectedApprovable = approvableKeys.filter((key) => selectedPendingKeys.has(key));
    selectAllEl.disabled = approvable.length === 0;
    selectAllEl.checked = approvable.length > 0 && selectedApprovable.length === approvable.length;
    selectAllEl.indeterminate =
      selectedApprovable.length > 0 && selectedApprovable.length < approvable.length;
  }

  function updateBulkApproveUI() {
    const count = selectedPendingKeys.size;
    if (bulkApproveCountEl) bulkApproveCountEl.textContent = String(count);
    if (bulkApproveBtn) bulkApproveBtn.disabled = count === 0 || bulkApproveInFlight;
    syncSelectAllState();
  }

  function clearPendingSelection() {
    selectedPendingKeys.clear();
    updateBulkApproveUI();
  }

  function applyApprovedStudentsToCourse(course, items) {
    if (!course || !items.length) return;
    const batch = course.batches?.[0];
    if (!batch) return;

    items.forEach((item) => {
      const { firstName, lastName } = parseStudentNameParts(item.name);
      const student = {
        firstName,
        lastName,
        program: item.program || course.name,
      };
      if (!Array.isArray(batch.students)) batch.students = [];
      batch.students.push(student);
    });

    if (typeof batch.studentCount === "number") {
      batch.studentCount += items.length;
    } else {
      batch.studentCount = batch.students.length;
    }
  }

  function refreshScheduleLockUI() {
    const course = selectedCourse();
    if (!course) return;
    const count = activeBatchStudentCount(course);
    const scheduleLocked = count < MIN_STUDENTS_TO_FINALIZE;
    const isNational = batchingCourseCategory(course) === "national";
    if (templateForm) {
      templateForm.classList.toggle("pe-none", scheduleLocked);
      templateForm.classList.toggle("opacity-50", scheduleLocked);
    }
    if (detailSubtitleEl && scheduleLocked) {
      detailSubtitleEl.textContent = isNational
        ? "Approve more students below to reach the minimum batch size, then set the national assessment schedule."
        : "Approve more students below to reach the minimum batch size, then set the class schedule.";
    }
  }

  function renderEnrollmentApproval() {
    const course = selectedCourse();
    const rows = pendingForSelectedCourse();
    const approvable = rows.filter((item) => item.canApprove);

    if (!approvalSectionEl) return;

    if (!course) {
      approvalSectionEl.classList.add("d-none");
      return;
    }

    approvalSectionEl.classList.remove("d-none");

    if (!rows.length) {
      if (pendingStudentsEl) pendingStudentsEl.innerHTML = "";
      pendingEmptyEl?.classList.remove("d-none");
      if (selectAllEl) {
        selectAllEl.checked = false;
        selectAllEl.indeterminate = false;
        selectAllEl.disabled = true;
      }
      updateBulkApproveUI();
      return;
    }

    pendingEmptyEl?.classList.add("d-none");

    if (pendingStudentsEl) {
      pendingStudentsEl.innerHTML = rows
        .map((item) => {
          const key = pendingItemKey(item);
          const checked = selectedPendingKeys.has(key) ? " checked" : "";
          const disabled = item.canApprove ? "" : " disabled";
          const title = item.canApprove
            ? ""
            : "Available when learner profile, requirements, and payment are complete.";
          return `
            <tr data-pending-key="${escapeHtml(key)}">
              <td class="registrar-batching-approval-table__check">
                <input type="checkbox" class="form-check-input batching-pending-check" data-key="${escapeHtml(key)}" aria-label="Select ${escapeHtml(item.name)}"${checked}${disabled} title="${escapeHtml(title)}" />
              </td>
              <td>
                <div class="fw-semibold">${escapeHtml(item.name)}</div>
                <div class="text-muted small">${escapeHtml(item.email)}</div>
              </td>
              <td><span class="badge registrar-enrollment-status ${escapeHtml(item.neededBadgeClass || "")}">${escapeHtml(item.neededLabel || "Pending")}</span></td>
            </tr>`;
        })
        .join("");
    }

    selectedPendingKeys.forEach((key) => {
      if (!approvable.some((item) => pendingItemKey(item) === key)) {
        selectedPendingKeys.delete(key);
      }
    });
    updateBulkApproveUI();
  }

  async function bulkApproveSelected() {
    const course = selectedCourse();
    if (!course || bulkApproveInFlight || selectedPendingKeys.size === 0) return;

    const items = pendingForSelectedCourse().filter((item) =>
      selectedPendingKeys.has(pendingItemKey(item))
    );
    if (!items.length) return;

    const approvable = items.filter((item) => item.canApprove);
    if (!approvable.length) return;

    const label = approvable.length === 1 ? approvable[0].name : `${approvable.length} students`;
    if (
      !window.confirm(
        `Approve enrollment for ${label} in ${course.name}? They will become available for batching.`
      )
    ) {
      return;
    }

    bulkApproveInFlight = true;
    updateBulkApproveUI();

    try {
      const res = await fetch("/registrar/api/enrollment/bulk-approve/", {
        method: "POST",
        headers: {
          "X-CSRFToken": getCsrfToken(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          items: approvable.map((item) => ({
            profileId: item.id,
            registrationId: item.registrationId,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Bulk approval failed.");

      const approvedKeys = new Set(
        (data.approved || []).map((row) => {
          if (row.profileId != null) return `p-${row.profileId}`;
          if (row.registrationId) return `r-${row.registrationId}`;
          return "";
        })
      );

      const approvedItems = approvable.filter((item) => approvedKeys.has(pendingItemKey(item)));
      pendingEnrollments = pendingEnrollments.filter(
        (item) => !approvedKeys.has(pendingItemKey(item))
      );
      applyApprovedStudentsToCourse(course, approvedItems);
      clearPendingSelection();
      renderEnrollmentApproval();
      renderCourseCards();
      refreshScheduleLockUI();

      if (Array.isArray(data.failed) && data.failed.length) {
        window.alert(
          `Approved ${data.approvedCount || approvedItems.length} student(s). ${data.failed.length} could not be approved.`
        );
      }
    } catch (err) {
      window.alert(err.message || "Could not approve selected students.");
    } finally {
      bulkApproveInFlight = false;
      updateBulkApproveUI();
    }
  }

  /** Latest editable draft for this course (templates are ordered newest first). */
  function getDraftForCourse(courseId) {
    const course = getCourse(courseId);
    const kind = course?.batchKind || "training";
    return (
      getTemplatesForCourse(courseId).find(
        (t) => t.status !== "finalized" && (t.batchKind || "training") === kind
      ) || null
    );
  }

  async function upsertTemplateForCourse(courseId, template) {
    const body = new URLSearchParams();
    if (isPersistedTemplateId(template.id)) {
      body.set("id", String(template.id).trim());
    }
    body.set("course_id", courseId);
    body.set("course_name", template.courseName || "");
    body.set("batch_kind", template.batchKind || "training");
    body.set("name", template.name || "");
    body.set("schedule_type", template.scheduleType || "");
    (template.days || []).forEach((d) => body.append("days", d));
    body.set("time_from", template.timeFrom || "");
    body.set("time_to", template.timeTo || "");
    body.set("daily_hours", String(template.dailyHours ?? 0));
    body.set("available_from", template.availableFrom || "");
    body.set("available_until", template.availableUntil || "");
    body.set("trainer_request_id", template.trainerId || "");
    body.set("trainer_name", template.trainerName || "");

    const res = await fetch("/registrar/api/batching/template/upsert/", {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save schedule.");
    return data.template;
  }

  function renderDayPills() {
    if (!dayPillsEl) return;
    const custom = formState.scheduleType === "custom";
    dayPillsEl.innerHTML = DAY_CODES.map((code) => {
      const active = formState.days.includes(code);
      const disabled = !custom ? " disabled" : "";
      return `<button type="button" class="registrar-schedule-pill registrar-schedule-pill--day${active ? " is-active" : ""}" data-day="${code}"${disabled}>${DAY_LABELS[code]}</button>`;
    }).join("");
  }

  function updateTypePills() {
    typePillsEl?.querySelectorAll("[data-schedule-type]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.scheduleType === formState.scheduleType);
    });
  }

  function updateDailyHoursField() {
    const hours = computeDailyHours(formState.timeFrom, formState.timeTo);
    if (dailyHoursEl) {
      dailyHoursEl.value = hours ? `${hours} hrs / day` : "—";
    }
  }

  function qualifiedTrainersForCourse(course) {
    if (!course) return [];
    const target = canonicalCourseKey(course.name);
    return allTrainers.filter((trainer) => {
      const quals = Array.isArray(trainer.qualifications) ? trainer.qualifications : [];
      return quals.some((q) => canonicalCourseKey(q) === target);
    });
  }

  function getFinalizedBatches() {
    const rows = [];
    Object.values(templatesByCourse).forEach((list) => {
      if (!Array.isArray(list)) return;
      list.forEach((tpl) => {
        if (tpl.status === "finalized") rows.push(tpl);
      });
    });
    return rows;
  }

  function draftScheduleFromForm() {
    return {
      scheduleType: formState.scheduleType,
      days: [...formState.days],
      timeFrom: formState.timeFrom,
      timeTo: formState.timeTo,
      availableFrom: formState.availableFrom,
      availableUntil: formState.availableUntil,
    };
  }

  function hasMinimumScheduleForConflictCheck() {
    return Boolean(formState.days.length && formState.timeFrom && formState.timeTo);
  }

  function findTrainerScheduleConflict(trainer, excludeTemplateId = null) {
    if (!trainer || !hasMinimumScheduleForConflictCheck()) return null;
    const draft = draftScheduleFromForm();
    for (const batch of getFinalizedBatches()) {
      if (excludeTemplateId && String(batch.id) === String(excludeTemplateId)) continue;
      if (!trainerMatchesBatch(trainer, batch)) continue;
      if (schedulesConflict(draft, batch)) return batch;
    }
    return null;
  }

  function trainersForScheduleForm(course) {
    const qualified = qualifiedTrainersForCourse(course);
    if (!hasMinimumScheduleForConflictCheck()) {
      return { selectable: qualified, hidden: [], needsScheduleFields: true };
    }
    const excludeId = isPersistedTemplateId(editingTemplateId) ? editingTemplateId : null;
    const selectable = [];
    const hidden = [];
    qualified.forEach((trainer) => {
      const conflict = findTrainerScheduleConflict(trainer, excludeId);
      if (conflict) hidden.push({ trainer, conflict });
      else selectable.push(trainer);
    });
    return { selectable, hidden, needsScheduleFields: false };
  }

  function updateScheduleConflictNotice() {
    if (!scheduleConflictEl) return;
    const course = selectedCourse();
    if (!course || !detailEl || detailEl.classList.contains("d-none")) {
      scheduleConflictEl.classList.add("d-none");
      scheduleConflictEl.textContent = "";
      return;
    }

    const { needsScheduleFields } = trainersForScheduleForm(course);

    if (needsScheduleFields) {
      scheduleConflictEl.classList.add("d-none");
      scheduleConflictEl.textContent = "";
      return;
    }

    const excludeId = isPersistedTemplateId(editingTemplateId) ? editingTemplateId : null;
    const selected = qualifiedTrainersForCourse(course).find((t) => t.id === formState.trainerId);
    const selectedConflict = selected
      ? findTrainerScheduleConflict(selected, excludeId)
      : null;

    if (selectedConflict) {
      scheduleConflictEl.classList.remove("d-none");
      scheduleConflictEl.innerHTML = `<i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i><strong>Schedule conflict:</strong> ${escapeHtml(selected.name)} is already assigned to <strong>${escapeHtml(formatBatchConflictLabel(selectedConflict))}</strong> on overlapping days, times, or dates. Change the schedule or pick another trainer.`;
      return;
    }

    scheduleConflictEl.classList.add("d-none");
    scheduleConflictEl.textContent = "";
  }

  function refreshTrainerScheduleUI() {
    renderTrainerOptions();
    updateScheduleConflictNotice();
  }

  function renderTrainerOptions() {
    if (!trainerEl) return;
    const course = selectedCourse();
    const { selectable, hidden, needsScheduleFields } = trainersForScheduleForm(course);
    const current = formState.trainerId || "";
    const hasCurrent = selectable.some((t) => t.id === current);

    const options = ['<option value="">Select trainer</option>'];
    selectable.forEach((trainer) => {
      const selected = trainer.id === current ? " selected" : "";
      options.push(
        `<option value="${escapeHtml(trainer.id)}"${selected}>${escapeHtml(trainer.name)}</option>`
      );
    });
    trainerEl.innerHTML = options.join("");

    if (!hasCurrent) {
      formState.trainerId = "";
      formState.trainerName = "";
      trainerEl.value = "";
    }

    if (trainerHintEl) {
      if (!course) {
        trainerHintEl.textContent = "";
      } else if (!qualifiedTrainersForCourse(course).length) {
        trainerHintEl.textContent = "No qualified trainer available for this course yet.";
      } else if (needsScheduleFields) {
        trainerHintEl.textContent =
          "Set days and class times to hide trainers with conflicting finalized schedules.";
      } else if (!selectable.length) {
        trainerHintEl.textContent =
          "All qualified trainers have a conflicting finalized schedule for these days/times.";
      } else {
        trainerHintEl.textContent = `${selectable.length} trainer${selectable.length === 1 ? "" : "s"} available for this schedule.`;
      }
    }
  }

  function applyFormToInputs() {
    if (timeFromEl) timeFromEl.value = formState.timeFrom;
    if (timeToEl) timeToEl.value = formState.timeTo;
    if (availableFromEl) availableFromEl.value = formState.availableFrom;
    if (availableUntilEl) availableUntilEl.value = formState.availableUntil;
    updateTypePills();
    renderDayPills();
    updateDailyHoursField();
    refreshTrainerScheduleUI();
    daysErrorEl?.classList.add("d-none");
  }

  function readFormFromInputs() {
    formState.timeFrom = timeFromEl?.value || "";
    formState.timeTo = timeToEl?.value || "";
    formState.availableFrom = availableFromEl?.value || "";
    formState.availableUntil = availableUntilEl?.value || "";
    formState.trainerId = trainerEl?.value || "";
    if (formState.trainerId) {
      const selected = qualifiedTrainersForCourse(selectedCourse()).find(
        (t) => t.id === formState.trainerId
      );
      formState.trainerName = selected?.name || "";
    } else {
      formState.trainerName = "";
    }
    updateDailyHoursField();
  }

  function setScheduleType(type) {
    formState.scheduleType = type;
    if (type === "custom" && !formState.days.length) {
      formState.days = [...WEEKDAY_CODES];
    } else if (type !== "custom") {
      formState.days = daysForScheduleType(type);
    }
    updateTypePills();
    renderDayPills();
    refreshTrainerScheduleUI();
  }

  function toggleDay(code) {
    if (formState.scheduleType !== "custom") return;
    if (formState.days.includes(code)) {
      formState.days = formState.days.filter((d) => d !== code);
    } else {
      formState.days = [...formState.days, code].sort(
        (a, b) => DAY_CODES.indexOf(a) - DAY_CODES.indexOf(b)
      );
    }
    renderDayPills();
    refreshTrainerScheduleUI();
  }

  function resetForm() {
    editingTemplateId = null;
    formState = createEmptyTemplateForm();
    applyFormToInputs();
  }

  function loadDraftForSelectedCourse() {
    const course = selectedCourse();
    if (!course) {
      resetForm();
      return;
    }
    const draft = getDraftForCourse(course.id);
    if (draft) loadTemplateIntoForm(draft);
    else resetForm();
  }

  function loadTemplateIntoForm(template) {
    editingTemplateId = template.id;
    formState = {
      id: template.id,
      scheduleType: template.scheduleType,
      days: [...template.days],
      timeFrom: template.timeFrom,
      timeTo: template.timeTo,
      availableFrom: template.availableFrom || "",
      availableUntil: template.availableUntil || "",
      trainerId: template.trainerId || "",
      trainerName: template.trainerName || "",
      batchKind: template.batchKind || "training",
    };
    applyFormToInputs();
  }

  function validateForm() {
    readFormFromInputs();
    let ok = true;
    if (!formState.days.length) {
      if (daysErrorEl) {
        daysErrorEl.textContent = "Select at least one day.";
        daysErrorEl.classList.remove("d-none");
      }
      ok = false;
    }
    if (!formState.timeFrom || !formState.timeTo) {
      ok = false;
    } else if (formState.timeFrom >= formState.timeTo) {
      alert("End time must be after start time.");
      ok = false;
    }
    if (
      formState.availableFrom &&
      formState.availableUntil &&
      formState.availableUntil < formState.availableFrom
    ) {
      alert("Available until must be on or after available from.");
      ok = false;
    }
    if (!formState.trainerId) {
      alert("Please select a qualified trainer for this schedule.");
      ok = false;
    } else {
      const course = selectedCourse();
      const trainer = qualifiedTrainersForCourse(course).find((t) => t.id === formState.trainerId);
      const excludeId = isPersistedTemplateId(editingTemplateId) ? editingTemplateId : null;
      const conflict = trainer ? findTrainerScheduleConflict(trainer, excludeId) : null;
      if (conflict) {
        alert(
          `Schedule conflict: ${trainer.name} is already assigned to ${formatBatchConflictLabel(conflict)} on overlapping days, times, or dates.`
        );
        refreshTrainerScheduleUI();
        ok = false;
      }
    }
    return ok;
  }

  function renderCategoryTabs() {
    if (!categoryTabsEl) return;
    categoryTabsEl.innerHTML = BATCH_CATEGORY_TABS.map((tab) => {
      const count = coursesInCategory(tab.key).length;
      const active = activeCategoryTab === tab.key ? " is-active" : "";
      return `<button type="button" class="registrar-batch-tab${active}" role="tab" aria-selected="${activeCategoryTab === tab.key}" data-category-tab="${tab.key}">
        ${escapeHtml(tab.label)}
        <span class="registrar-batch-tab__count">${count}</span>
      </button>`;
    }).join("");
  }

  function setActiveCategoryTab(category) {
    if (!BATCH_CATEGORY_TABS.some((t) => t.key === category)) return;
    activeCategoryTab = category;
    if (selectedCourseId) {
      const selected = getCourse(selectedCourseId);
      if (selected && batchingCourseCategory(selected) !== category) {
        hideDetail();
      }
    }
    renderCategoryTabs();
    renderCourseCards();
  }

  function renderCourseCards() {
    renderCategoryTabs();
    const visibleCourses = coursesInCategory(activeCategoryTab);
    if (coursesEmptyEl) {
      coursesEmptyEl.classList.toggle("d-none", visibleCourses.length > 0);
    }
    coursesEl.classList.toggle("d-none", visibleCourses.length === 0);
    coursesEl.innerHTML = visibleCourses.map((course) => {
      const count = activeBatchStudentCount(course);
      const pct = Math.min(100, (count / BATCH_CAPACITY) * 100);
      const status = courseStatus(course);
      const needed = studentsNeeded(course);
      const batchCount = course.batches.length;
      const days = courseDurationDays(course);
      const hasDraft = Boolean(getDraftForCourse(course.id));
      const pendingForCourse = pendingEnrollments.filter((item) => pendingMatchesCourse(item, course));
      const locked = count < MIN_STUDENTS_TO_FINALIZE;
      const canOpen = !locked || pendingForCourse.length > 0;
      const alert =
        needed > 0
          ? `<div class="registrar-batch-card__alert"><i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>Need ${needed} more unassigned student${needed === 1 ? "" : "s"} before this course can be opened for scheduling.</div>`
          : "";
      const barClass = count >= MIN_STUDENTS_TO_FINALIZE ? "registrar-batch-card__bar-fill--ready" : "";
      const disabledAttr = canOpen ? "" : " disabled";
      const lockedClass = canOpen ? "" : " is-locked";
      const titleAttr = canOpen
        ? ""
        : ` title="At least ${MIN_STUDENTS_TO_FINALIZE} unassigned students are required before opening this course."`;

      return `
        <div class="col-md-6 col-lg-4">
          <button type="button" class="registrar-batch-card w-100 text-start${selectedCourseId === course.id ? " is-selected" : ""}${lockedClass}" data-course-id="${course.id}" aria-label="Open ${escapeHtml(course.name)} scheduling"${disabledAttr}${titleAttr}>
            <p class="registrar-batch-card__meta mb-1">${batchCount} Batch${batchCount === 1 ? "" : "es"} · ${days} day${days === 1 ? "" : "s"} · ${hasDraft ? "Schedule saved" : "No schedule yet"}</p>
            <h3 class="registrar-batch-card__title">${escapeHtml(course.name)}</h3>
            <p class="registrar-batch-card__count mb-2"><i class="bi bi-people me-1" aria-hidden="true"></i>Available for batch: <strong>${count} / ${BATCH_CAPACITY}</strong></p>
            <div class="registrar-batch-card__bar" aria-hidden="true"><span class="registrar-batch-card__bar-fill ${barClass}" style="width:${pct}%"></span></div>
            <span class="badge registrar-batch-card__status ${status.class}">${escapeHtml(status.label)}</span>
            ${alert}
          </button>
        </div>`;
    }).join("");
  }

  function showDetail(courseId, { loadDraft = true } = {}) {
    const course = getCourse(courseId);
    if (!course) return;

    selectedCourseId = courseId;

    placeholderEl?.classList.add("d-none");
    detailEl?.classList.remove("d-none");
    if (detailTitleEl) detailTitleEl.textContent = course.name;
    const isNational = batchingCourseCategory(course) === "national";
    if (detailSubtitleEl) {
      detailSubtitleEl.textContent = isNational
        ? "National competency assessment schedule (assessment-only clients and EGACE graduates pending assessment)."
        : "Class training schedule for this program.";
    }

    const days = courseDurationDays(course);
    if (durationBadgeEl) {
      durationBadgeEl.textContent = isNational
        ? "National assessment"
        : `${days} training day${days === 1 ? "" : "s"}`;
      durationBadgeEl.classList.remove("d-none");
    }

    const count = activeBatchStudentCount(course);
    const scheduleLocked = count < MIN_STUDENTS_TO_FINALIZE;
    if (templateForm) {
      templateForm.classList.toggle("pe-none", scheduleLocked);
      templateForm.classList.toggle("opacity-50", scheduleLocked);
    }
    if (scheduleLocked && detailSubtitleEl) {
      detailSubtitleEl.textContent = isNational
        ? "Approve more students below to reach the minimum batch size, then set the national assessment schedule."
        : "Approve more students below to reach the minimum batch size, then set the class schedule.";
    } else if (detailSubtitleEl) {
      detailSubtitleEl.textContent = isNational
        ? "National competency assessment schedule (assessment-only clients and EGACE graduates pending assessment)."
        : "Class training schedule for this program.";
    }

    if (loadDraft) loadDraftForSelectedCourse();
    renderEnrollmentApproval();
    renderCourseCards();
    templateForm?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideDetail() {
    selectedCourseId = null;
    editingTemplateId = null;
    clearPendingSelection();
    detailEl?.classList.add("d-none");
    placeholderEl?.classList.remove("d-none");
    durationBadgeEl?.classList.add("d-none");
    approvalSectionEl?.classList.add("d-none");
    renderCourseCards();
  }

  categoryTabsEl?.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-category-tab]");
    if (!tab) return;
    setActiveCategoryTab(tab.dataset.categoryTab);
  });

  coursesEl.addEventListener("click", (e) => {
    const card = e.target.closest("[data-course-id]");
    if (!card) return;
    if (card.disabled) return;
    showDetail(card.dataset.courseId);
  });

  closeBtn?.addEventListener("click", hideDetail);
  cancelBtn?.addEventListener("click", loadDraftForSelectedCourse);

  selectAllEl?.addEventListener("change", () => {
    const approvable = approvablePendingForSelectedCourse();
    if (selectAllEl.checked) {
      approvable.forEach((item) => selectedPendingKeys.add(pendingItemKey(item)));
    } else {
      approvable.forEach((item) => selectedPendingKeys.delete(pendingItemKey(item)));
    }
    pendingStudentsEl
      ?.querySelectorAll(".batching-pending-check:not(:disabled)")
      .forEach((input) => {
        input.checked = selectAllEl.checked;
      });
    updateBulkApproveUI();
  });

  pendingStudentsEl?.addEventListener("change", (e) => {
    const input = e.target.closest(".batching-pending-check");
    if (!input || input.disabled) return;
    const key = input.dataset.key;
    if (!key) return;
    if (input.checked) selectedPendingKeys.add(key);
    else selectedPendingKeys.delete(key);
    updateBulkApproveUI();
  });

  bulkApproveBtn?.addEventListener("click", () => {
    bulkApproveSelected();
  });

  typePillsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-schedule-type]");
    if (!btn) return;
    setScheduleType(btn.dataset.scheduleType);
  });

  dayPillsEl?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-day]");
    if (!btn || btn.disabled) return;
    toggleDay(btn.dataset.day);
  });

  timeFromEl?.addEventListener("change", () => {
    formState.timeFrom = timeFromEl.value;
    updateDailyHoursField();
    refreshTrainerScheduleUI();
  });

  timeToEl?.addEventListener("change", () => {
    formState.timeTo = timeToEl.value;
    updateDailyHoursField();
    refreshTrainerScheduleUI();
  });

  availableFromEl?.addEventListener("change", () => {
    formState.availableFrom = availableFromEl.value;
    refreshTrainerScheduleUI();
  });

  availableUntilEl?.addEventListener("change", () => {
    formState.availableUntil = availableUntilEl.value;
    refreshTrainerScheduleUI();
  });

  trainerEl?.addEventListener("change", () => {
    formState.trainerId = trainerEl.value || "";
    const selected = qualifiedTrainersForCourse(selectedCourse()).find(
      (t) => t.id === formState.trainerId
    );
    formState.trainerName = selected?.name || "";
    updateScheduleConflictNotice();
  });

  templateForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const course = selectedCourse();
    if (!course || !validateForm()) return;

    const template = {
      scheduleType: formState.scheduleType,
      days: [...formState.days],
      timeFrom: formState.timeFrom,
      timeTo: formState.timeTo,
      dailyHours: computeDailyHours(formState.timeFrom, formState.timeTo),
      availableFrom: formState.availableFrom,
      availableUntil: formState.availableUntil,
      trainerId: formState.trainerId,
      trainerName: formState.trainerName,
      courseId: course.id,
      courseName: course.name,
      batchKind: course.batchKind || "training",
      createdAt: new Date().toISOString(),
    };
    template.name = templateDisplayTitle(template);
    const draft = getDraftForCourse(course.id);
    if (isPersistedTemplateId(editingTemplateId)) {
      template.id = editingTemplateId;
    } else if (draft && isPersistedTemplateId(draft.id)) {
      template.id = draft.id;
    }
    try {
      const saved = await upsertTemplateForCourse(course.id, template);
      const list = getTemplatesForCourse(course.id);
      const replaceId = template.id || saved.id;
      const idx = list.findIndex(
        (t) => t.id === replaceId || t.id === saved.id
      );
      if (idx >= 0) list[idx] = saved;
      else list.unshift(saved);
      setTemplatesForCourse(course.id, list);
      loadTemplateIntoForm(saved);
      refreshTrainerScheduleUI();
      renderCourseCards();
      showScheduleSavedConfirm({ courseName: course.name });
    } catch (err) {
      window.alert(err.message || "Could not save schedule.");
    }
  });

  renderDayPills();
  updateTypePills();
  updateDailyHoursField();

  const urlParams = new URLSearchParams(window.location.search);
  const courseParam = urlParams.get("course");
  let categoryParam = urlParams.get("category");
  if (categoryParam === "assessment") {
    categoryParam = "national";
  }
  if (categoryParam && BATCH_CATEGORY_TABS.some((t) => t.key === categoryParam)) {
    activeCategoryTab = categoryParam;
  } else if (courseParam) {
    const courseForTab = getCourse(courseParam);
    if (courseForTab) {
      activeCategoryTab = batchingCourseCategory(courseForTab);
    }
  }
  renderCourseCards();

  const templateParam = urlParams.get("template");
  if (courseParam && getCourse(courseParam)) {
    showDetail(courseParam, { loadDraft: !templateParam });
    if (templateParam) {
      const tpl = getTemplatesForCourse(courseParam).find((t) => t.id === templateParam);
      if (tpl?.status === "finalized") {
        window.alert("This batch is finalized. View it on Finalized Batches.");
        loadDraftForSelectedCourse();
      } else if (tpl) {
        loadTemplateIntoForm(tpl);
      } else {
        loadDraftForSelectedCourse();
      }
    }
  }
});
