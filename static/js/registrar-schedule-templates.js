/**
 * Schedule templates for registrar batching & scheduling (per course).
 */

export const SCHEDULE_TEMPLATE_STORAGE_KEY = "vtiac-registrar-schedule-templates";

export const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const DAY_LABELS = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const WEEKDAY_CODES = ["mon", "tue", "wed", "thu", "fri"];
export const WEEKEND_CODES = ["sat", "sun"];

export const SCHEDULE_TYPES = ["weekdays", "weekends", "custom"];

function loadAll() {
  try {
    const raw = localStorage.getItem(SCHEDULE_TEMPLATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  localStorage.setItem(SCHEDULE_TEMPLATE_STORAGE_KEY, JSON.stringify(data));
}

export function getTemplatesForCourse(courseId) {
  const all = loadAll();
  return Array.isArray(all[courseId]) ? all[courseId] : [];
}

export function saveTemplateForCourse(courseId, template) {
  const all = loadAll();
  const list = getTemplatesForCourse(courseId);
  const idx = list.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    list[idx] = template;
  } else {
    list.push(template);
  }
  all[courseId] = list;
  saveAll(all);
  return template;
}

export function deleteTemplateForCourse(courseId, templateId) {
  const all = loadAll();
  all[courseId] = getTemplatesForCourse(courseId).filter((t) => t.id !== templateId);
  saveAll(all);
}

export function computeDailyHours(timeFrom, timeTo) {
  if (!timeFrom || !timeTo) return 0;
  const [fh, fm] = timeFrom.split(":").map(Number);
  const [th, tm] = timeTo.split(":").map(Number);
  const mins = th * 60 + tm - (fh * 60 + fm);
  if (mins <= 0) return 0;
  return Math.round((mins / 60) * 10) / 10;
}

export function formatTime12h(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function daysSummary(days) {
  if (!days?.length) return "—";
  return days.map((d) => DAY_LABELS[d] || d).join(", ");
}

export function scheduleTypeLabel(type) {
  if (type === "weekdays") return "Weekdays";
  if (type === "weekends") return "Weekends";
  return "Custom";
}

export function templateDisplayTitle(template) {
  const type = scheduleTypeLabel(template.scheduleType);
  const days = daysSummary(template.days);
  const range = `${formatTime12h(template.timeFrom)} – ${formatTime12h(template.timeTo)}`;
  return `${type} · ${days} · ${range}`;
}

export function createEmptyTemplateForm() {
  return {
    id: "",
    scheduleType: "weekdays",
    days: [...WEEKDAY_CODES],
    timeFrom: "08:00",
    timeTo: "12:00",
    availableFrom: "",
    availableUntil: "",
    trainerId: "",
    trainerName: "",
  };
}

export function daysForScheduleType(scheduleType) {
  if (scheduleType === "weekdays") return [...WEEKDAY_CODES];
  if (scheduleType === "weekends") return [...WEEKEND_CODES];
  return [];
}

/** Effective day codes for conflict checks (matches registrar batching API). */
export function effectiveScheduleDays(scheduleType, days) {
  const stype = String(scheduleType || "").trim().toLowerCase();
  if (stype === "weekdays") return new Set(WEEKDAY_CODES);
  if (stype === "weekends") return new Set(WEEKEND_CODES);
  return new Set(
    (Array.isArray(days) ? days : [])
      .map((d) => String(d).trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseTime24(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [h, m] = raw.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function dateRangesOverlap(fromA, untilA, fromB, untilB) {
  if (!fromA || !untilA || !fromB || !untilB) return true;
  return fromA <= untilB && fromB <= untilA;
}

/** True when two class schedules overlap (days, times, and date range). */
export function schedulesConflict(a, b) {
  if (!dateRangesOverlap(a.availableFrom, a.availableUntil, b.availableFrom, b.availableUntil)) {
    return false;
  }
  const daysA = effectiveScheduleDays(a.scheduleType, a.days);
  const daysB = effectiveScheduleDays(b.scheduleType, b.days);
  let shared = false;
  for (const d of daysA) {
    if (daysB.has(d)) {
      shared = true;
      break;
    }
  }
  if (!shared) return false;

  const startA = parseTime24(a.timeFrom);
  const endA = parseTime24(a.timeTo);
  const startB = parseTime24(b.timeFrom);
  const endB = parseTime24(b.timeTo);
  if (startA == null || endA == null || startB == null || endB == null) return true;
  return startA < endB && startB < endA;
}

export function trainerMatchesBatch(trainer, batch) {
  if (!trainer || !batch) return false;
  if (batch.trainerId && String(trainer.id) === String(batch.trainerId)) return true;
  const a = String(trainer.name || "").trim().toLowerCase();
  const b = String(batch.trainerName || batch.trainer || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

export function formatBatchConflictLabel(batch) {
  const course = batch.courseName || "another program";
  const label = batch.batchLabel || "Batch 1";
  return `${course} (${label})`;
}
