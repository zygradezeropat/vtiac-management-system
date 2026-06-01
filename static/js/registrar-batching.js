/**
 * Registrar — batching & scheduling: course overview + schedule template builder.
 */

import { showFinalizeBatchConfirm } from "./registrar-batch-finalize-modal.js";
import {
  DAY_CODES,
  DAY_LABELS,
  WEEKDAY_CODES,
  WEEKEND_CODES,
  computeDailyHours,
  createEmptyTemplateForm,
  daysForScheduleType,
  daysSummary,
  formatTime12h,
  scheduleTypeLabel,
  templateDisplayTitle,
} from "./registrar-schedule-templates.js";

const MIN_STUDENTS_TO_FINALIZE = 3;
const BATCH_CAPACITY = 25;

const BATCH_CATEGORY_TABS = [
  { key: "assessment", label: "Assessment" },
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

function formatDateTimeLocal(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
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
  const fromServer = course?.category;
  if (fromServer && BATCH_CATEGORY_TABS.some((t) => t.key === fromServer)) {
    return fromServer;
  }
  const name = String(course?.name || "").trim();
  if (!name) return "institutional";
  if (name.includes(" NC I") || name.includes(" NC II") || name.includes(" NC III")) {
    return "national";
  }
  const lower = name.toLowerCase();
  if (lower === "assessment" || lower === "competency assessment" || lower.includes("assessment")) {
    return "assessment";
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
  const assessmentAtEl = document.getElementById("template-assessment-at");
  const examinerNameEl = document.getElementById("template-examiner-name");
  const examinationCourseEl = document.getElementById("template-examination-course");
  const cancelBtn = document.getElementById("schedule-template-cancel");
  const templatesListEl = document.getElementById("schedule-templates-list");
  const templatesEmptyEl = document.getElementById("schedule-templates-empty");

  if (!coursesEl) return;

  let selectedCourseId = null;
  let activeCategoryTab = "assessment";
  let formState = createEmptyTemplateForm();
  let editingTemplateId = null;
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

  async function upsertTemplateForCourse(courseId, template) {
    const body = new URLSearchParams();
    if (isPersistedTemplateId(template.id)) {
      body.set("id", String(template.id).trim());
    }
    body.set("course_id", courseId);
    body.set("course_name", template.courseName || "");
    body.set("name", template.name || "");
    body.set("schedule_type", template.scheduleType || "");
    (template.days || []).forEach((d) => body.append("days", d));
    body.set("time_from", template.timeFrom || "");
    body.set("time_to", template.timeTo || "");
    body.set("daily_hours", String(template.dailyHours ?? 0));
    body.set("available_from", template.availableFrom || "");
    body.set("available_until", template.availableUntil || "");
    body.set("assessment_at", template.assessmentAt || "");
    body.set("examiner_name", template.examinerName || "");
    body.set("examination_course", template.examinationCourse || "");
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
    if (!res.ok) throw new Error(data.error || "Could not save template.");
    return data.template;
  }

  async function finalizeTemplateForCourse(courseId, templateId) {
    const res = await fetch(
      `/registrar/api/batching/template/finalize/${encodeURIComponent(templateId)}/`,
      {
        method: "POST",
        headers: {
          "X-CSRFToken": getCsrfToken(),
          Accept: "application/json",
        },
        credentials: "same-origin",
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not finalize batch.");
    const saved = data.batch;
    const list = getTemplatesForCourse(courseId);
    const idx = list.findIndex((t) => t.id === templateId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...saved, id: saved.id };
    }
    setTemplatesForCourse(courseId, list);
    return saved;
  }

  async function deleteTemplateForCourse(courseId, templateId) {
    const res = await fetch(`/registrar/api/batching/template/delete/${encodeURIComponent(templateId)}/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCsrfToken(),
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete template.");
    setTemplatesForCourse(
      courseId,
      getTemplatesForCourse(courseId).filter((t) => t.id !== templateId)
    );
    return data;
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

  function renderTrainerOptions() {
    if (!trainerEl) return;
    const course = selectedCourse();
    const available = qualifiedTrainersForCourse(course);
    const current = formState.trainerId || "";
    const hasCurrent = available.some((t) => t.id === current);

    const options = ['<option value="">Select trainer</option>'];
    available.forEach((trainer) => {
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
      } else if (!available.length) {
        trainerHintEl.textContent = "No qualified trainer available for this course yet.";
      } else {
        trainerHintEl.textContent = `${available.length} qualified trainer${
          available.length === 1 ? "" : "s"
        } available.`;
      }
    }
  }

  function applyFormToInputs() {
    if (timeFromEl) timeFromEl.value = formState.timeFrom;
    if (timeToEl) timeToEl.value = formState.timeTo;
    if (availableFromEl) availableFromEl.value = formState.availableFrom;
    if (availableUntilEl) availableUntilEl.value = formState.availableUntil;
    if (assessmentAtEl) assessmentAtEl.value = formState.assessmentAt || "";
    if (examinerNameEl) examinerNameEl.value = formState.examinerName || "";
    if (examinationCourseEl) examinationCourseEl.value = formState.examinationCourse || "";
    renderTrainerOptions();
    if (trainerEl) trainerEl.value = formState.trainerId || "";
    updateTypePills();
    renderDayPills();
    updateDailyHoursField();
    daysErrorEl?.classList.add("d-none");
  }

  function readFormFromInputs() {
    formState.timeFrom = timeFromEl?.value || "";
    formState.timeTo = timeToEl?.value || "";
    formState.availableFrom = availableFromEl?.value || "";
    formState.availableUntil = availableUntilEl?.value || "";
    formState.assessmentAt = assessmentAtEl?.value || "";
    formState.examinerName = examinerNameEl?.value || "";
    formState.examinationCourse = examinationCourseEl?.value || "";
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
  }

  function resetForm() {
    editingTemplateId = null;
    formState = createEmptyTemplateForm();
    applyFormToInputs();
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
      assessmentAt: template.assessmentAt || "",
      examinerName: template.examinerName || "",
      examinationCourse: template.examinationCourse || "",
      trainerId: template.trainerId || "",
      trainerName: template.trainerName || "",
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
    }
    if (!formState.assessmentAt) {
      alert("Please set the assessment date and time.");
      ok = false;
    }
    if (!formState.examinerName) {
      alert("Please enter the examiner name.");
      ok = false;
    }
    if (!formState.examinationCourse) {
      alert("Please select the examination.");
      ok = false;
    }
    return ok;
  }

  function renderSavedTemplates() {
    const course = selectedCourse();
    if (!course || !templatesListEl) return;

    const templates = getTemplatesForCourse(course.id);
    templatesEmptyEl?.classList.toggle("d-none", templates.length > 0);

    templatesListEl.innerHTML = templates
      .map((tpl) => {
        const hours = tpl.dailyHours ?? computeDailyHours(tpl.timeFrom, tpl.timeTo);
        const title = tpl.name || templateDisplayTitle(tpl);
        const avail =
          tpl.availableFrom || tpl.availableUntil
            ? `<span class="text-muted"> · ${escapeHtml(tpl.availableFrom || "…")} – ${escapeHtml(tpl.availableUntil || "open")}</span>`
            : "";
        const trainer =
          tpl.trainerName
            ? `<span class="text-muted"> · Trainer: ${escapeHtml(tpl.trainerName)}</span>`
            : "";
        const assessmentAt = tpl.assessmentAt
          ? `<span class="text-muted"> · Assessment: ${escapeHtml(formatDateTimeLocal(tpl.assessmentAt))}</span>`
          : "";
        const examiner = tpl.examinerName
          ? `<span class="text-muted"> · Examiner: ${escapeHtml(tpl.examinerName)}</span>`
          : "";
        const examination = tpl.examinationCourse
          ? `<span class="text-muted"> · Exam: ${escapeHtml(tpl.examinationCourse)}</span>`
          : "";
        const isFinal = tpl.status === "finalized";
        const availableCount = activeBatchStudentCount(course);
        const canFinalize = availableCount >= MIN_STUDENTS_TO_FINALIZE;
        const statusTag = isFinal
          ? `<span class="registrar-schedule-tag registrar-schedule-tag--green ms-1">Finalized</span>`
          : `<span class="registrar-schedule-tag registrar-schedule-tag--amber ms-1">Draft</span>`;
        const finalizeDisabled = canFinalize
          ? ""
          : ` disabled title="At least ${MIN_STUDENTS_TO_FINALIZE} unassigned students required to finalize"`;
        const actions = isFinal
          ? `<a href="/registrar/finalized-batches/" class="btn btn-sm btn-outline-primary">View in repository</a>`
          : `<button type="button" class="btn btn-sm btn-outline-secondary" data-edit-template="${escapeHtml(tpl.id)}">Edit</button>
              <button type="button" class="btn btn-sm btn-success" data-finalize-template="${escapeHtml(tpl.id)}"${finalizeDisabled}>Finalize</button>
              <button type="button" class="btn btn-sm btn-outline-danger" data-delete-template="${escapeHtml(tpl.id)}">Delete</button>`;
        return `
          <div class="registrar-schedule-template-card">
            <div class="registrar-schedule-template-card__body">
              <h4 class="registrar-schedule-template-card__title mb-1">${escapeHtml(title)}${statusTag}</h4>
              <p class="registrar-schedule-template-card__meta small text-muted mb-0">
                <span class="registrar-schedule-tag registrar-schedule-tag--blue">${escapeHtml(scheduleTypeLabel(tpl.scheduleType))}</span>
                ${escapeHtml(daysSummary(tpl.days))} · ${hours} hrs/day
                ${avail}
                ${trainer}
                ${assessmentAt}
                ${examiner}
                ${examination}
              </p>
            </div>
            <div class="registrar-schedule-template-card__actions d-flex flex-wrap gap-1">
              ${actions}
            </div>
          </div>`;
      })
      .join("");
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
      const templateCount = getTemplatesForCourse(course.id).length;
      const locked = count < MIN_STUDENTS_TO_FINALIZE;
      const alert =
        needed > 0
          ? `<div class="registrar-batch-card__alert"><i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>Need ${needed} more unassigned student${needed === 1 ? "" : "s"} before this course can be opened for scheduling.</div>`
          : "";
      const barClass = count >= MIN_STUDENTS_TO_FINALIZE ? "registrar-batch-card__bar-fill--ready" : "";
      const disabledAttr = locked ? " disabled" : "";
      const lockedClass = locked ? " is-locked" : "";
      const titleAttr = locked
        ? ` title="At least ${MIN_STUDENTS_TO_FINALIZE} unassigned students are required before opening this course."`
        : "";

      return `
        <div class="col-md-6 col-lg-4">
          <button type="button" class="registrar-batch-card w-100 text-start${selectedCourseId === course.id ? " is-selected" : ""}${lockedClass}" data-course-id="${course.id}" aria-label="Open ${escapeHtml(course.name)} scheduling"${disabledAttr}${titleAttr}>
            <p class="registrar-batch-card__meta mb-1">${batchCount} Batch${batchCount === 1 ? "" : "es"} · ${days} day${days === 1 ? "" : "s"} · ${templateCount} template${templateCount === 1 ? "" : "s"}</p>
            <h3 class="registrar-batch-card__title">${escapeHtml(course.name)}</h3>
            <p class="registrar-batch-card__count mb-2"><i class="bi bi-people me-1" aria-hidden="true"></i>Available for batch: <strong>${count} / ${BATCH_CAPACITY}</strong></p>
            <div class="registrar-batch-card__bar" aria-hidden="true"><span class="registrar-batch-card__bar-fill ${barClass}" style="width:${pct}%"></span></div>
            <span class="badge registrar-batch-card__status ${status.class}">${escapeHtml(status.label)}</span>
            ${alert}
          </button>
        </div>`;
    }).join("");
  }

  function showDetail(courseId) {
    const course = getCourse(courseId);
    if (!course) return;

    selectedCourseId = courseId;
    resetForm();

    placeholderEl?.classList.add("d-none");
    detailEl?.classList.remove("d-none");
    if (detailTitleEl) detailTitleEl.textContent = course.name;

    const days = courseDurationDays(course);
    if (durationBadgeEl) {
      durationBadgeEl.textContent = `${days} training day${days === 1 ? "" : "s"}`;
      durationBadgeEl.classList.remove("d-none");
    }

    renderCourseCards();
    renderSavedTemplates();
    templateForm?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideDetail() {
    selectedCourseId = null;
    editingTemplateId = null;
    detailEl?.classList.add("d-none");
    placeholderEl?.classList.remove("d-none");
    durationBadgeEl?.classList.add("d-none");
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
  cancelBtn?.addEventListener("click", resetForm);

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
  });

  timeToEl?.addEventListener("change", () => {
    formState.timeTo = timeToEl.value;
    updateDailyHoursField();
  });

  availableFromEl?.addEventListener("change", () => {
    formState.availableFrom = availableFromEl.value;
  });

  availableUntilEl?.addEventListener("change", () => {
    formState.availableUntil = availableUntilEl.value;
  });

  assessmentAtEl?.addEventListener("change", () => {
    formState.assessmentAt = assessmentAtEl.value;
  });

  examinerNameEl?.addEventListener("input", () => {
    formState.examinerName = examinerNameEl.value;
  });

  examinationCourseEl?.addEventListener("change", () => {
    formState.examinationCourse = examinationCourseEl.value;
  });

  trainerEl?.addEventListener("change", () => {
    formState.trainerId = trainerEl.value || "";
    const selected = qualifiedTrainersForCourse(selectedCourse()).find(
      (t) => t.id === formState.trainerId
    );
    formState.trainerName = selected?.name || "";
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
      assessmentAt: formState.assessmentAt,
      examinerName: formState.examinerName,
      examinationCourse: formState.examinationCourse,
      trainerId: formState.trainerId,
      trainerName: formState.trainerName,
      courseId: course.id,
      courseName: course.name,
      createdAt: new Date().toISOString(),
    };
    template.name = templateDisplayTitle(template);
    if (isPersistedTemplateId(editingTemplateId)) {
      template.id = editingTemplateId;
    }
    try {
      const saved = await upsertTemplateForCourse(course.id, template);
      const list = getTemplatesForCourse(course.id);
      const replaceId = editingTemplateId || saved.id;
      const idx = list.findIndex(
        (t) => t.id === replaceId || t.id === saved.id
      );
      if (idx >= 0) list[idx] = saved;
      else list.push(saved);
      setTemplatesForCourse(course.id, list);
      resetForm();
      renderSavedTemplates();
      renderCourseCards();
    } catch (err) {
      window.alert(err.message || "Could not save template.");
    }
  });

  templatesListEl?.addEventListener("click", (e) => {
    const course = selectedCourse();
    if (!course) return;

    const editBtn = e.target.closest("[data-edit-template]");
    const finalizeBtn = e.target.closest("[data-finalize-template]");
    const deleteBtn = e.target.closest("[data-delete-template]");

    if (editBtn) {
      const tpl = getTemplatesForCourse(course.id).find((t) => t.id === editBtn.dataset.editTemplate);
      if (tpl?.status === "finalized") {
        window.alert("This batch is finalized. View it in Finalized Batches.");
        return;
      }
      if (tpl) loadTemplateIntoForm(tpl);
      return;
    }

    if (finalizeBtn) {
      if (finalizeBtn.disabled) {
        window.alert(
          `At least ${MIN_STUDENTS_TO_FINALIZE} unassigned students are required before finalizing. Save draft templates anytime; finalize when enough students are available.`
        );
        return;
      }
      const templateId = finalizeBtn.dataset.finalizeTemplate;
      const tpl = getTemplatesForCourse(course.id).find((t) => t.id === templateId);
      if (!tpl) return;
      const availableCount = activeBatchStudentCount(course);
      if (availableCount < MIN_STUDENTS_TO_FINALIZE) {
        window.alert(
          `This course has ${availableCount} unassigned student${availableCount === 1 ? "" : "s"}. At least ${MIN_STUDENTS_TO_FINALIZE} are required to finalize.`
        );
        return;
      }
      const batchPayload = {
        courseName: course.name,
        batchLabel: tpl.batchLabel || "Batch 1",
        studentCount: tpl.studentCount ?? activeBatchStudentCount(course),
      };
      showFinalizeBatchConfirm(batchPayload, async () => {
        await finalizeTemplateForCourse(course.id, templateId);
        if (editingTemplateId === templateId) resetForm();
        renderSavedTemplates();
        renderCourseCards();
      });
      return;
    }

    if (deleteBtn) {
      const deleteId = deleteBtn.dataset.deleteTemplate;
      if (!isPersistedTemplateId(deleteId)) {
        setTemplatesForCourse(
          course.id,
          getTemplatesForCourse(course.id).filter((t) => t.id !== deleteId)
        );
        if (editingTemplateId === deleteId) resetForm();
        renderSavedTemplates();
        renderCourseCards();
        return;
      }
      if (!window.confirm("Delete this schedule template?")) return;
      deleteTemplateForCourse(course.id, deleteId)
        .then(() => {
          if (editingTemplateId === deleteId) resetForm();
          renderSavedTemplates();
          renderCourseCards();
        })
        .catch((err) => window.alert(err.message || "Could not delete template."));
    }
  });

  renderDayPills();
  updateTypePills();
  updateDailyHoursField();

  const urlParams = new URLSearchParams(window.location.search);
  const courseParam = urlParams.get("course");
  const categoryParam = urlParams.get("category");
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
    showDetail(courseParam);
    if (templateParam) {
      const tpl = getTemplatesForCourse(courseParam).find((t) => t.id === templateParam);
      if (tpl?.status === "finalized") {
        window.alert("This batch is already finalized and cannot be edited.");
      } else if (tpl) {
        loadTemplateIntoForm(tpl);
      }
    }
  }
});
