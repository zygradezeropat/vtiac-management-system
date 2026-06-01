/**
 * Finalized batch repository (demo — localStorage until API exists).
 * Batches finalized in Batching & Scheduling are moved here automatically.
 */

const STORAGE_KEY = "vtiac_registrar_finalized_batches";

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatTime12h(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function scheduleLabel(schedule) {
  if (!schedule?.day || !schedule?.timeFrom || !schedule?.timeTo) return "—";
  return `${schedule.day} · ${formatTime12h(schedule.timeFrom)} – ${formatTime12h(schedule.timeTo)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getFinalizedBatches() {
  return readAll().sort((a, b) => new Date(b.finalizedAt) - new Date(a.finalizedAt));
}

/** @param {object} payload */
export function addFinalizedBatch(payload) {
  const list = readAll();
  const record = {
    id: `fin-${payload.courseId}-${payload.batchId}-${Date.now()}`,
    courseId: payload.courseId,
    courseName: payload.courseName,
    durationDays: payload.durationDays,
    batchLabel: payload.batchLabel,
    batchId: payload.batchId,
    schedule: { ...payload.schedule },
    startDate: payload.startDate,
    endDate: payload.endDate,
    trainer: payload.trainer,
    students: payload.students.map((s) => ({ ...s })),
    studentCount: payload.students.length,
    finalizedAt: new Date().toISOString(),
  };
  list.unshift(record);
  writeAll(list);
  return record;
}

export function getFinalizedBatch(id) {
  return readAll().find((b) => b.id === id) ?? null;
}

/** Demo samples when repository is empty (first visit). */
export function seedFinalizedDemoIfEmpty() {
  if (readAll().length > 0) return;

  writeAll([
    {
      id: "fin-demo-automotive-1",
      courseId: "automotive-1",
      courseName: "Automotive Servicing NC I",
      durationDays: 61,
      batchLabel: "Batch 1",
      batchId: "demo-b1",
      schedule: { day: "Monday – Friday", timeFrom: "08:00", timeTo: "12:00" },
      startDate: "2026-02-03",
      endDate: "2026-05-08",
      trainer: "Maria Cruz",
      students: [
        { lastName: "Santos", firstName: "Elena", program: "Automotive Servicing NC I" },
        { lastName: "Reyes", firstName: "Paolo", program: "Automotive Servicing NC I" },
        { lastName: "Lim", firstName: "Grace", program: "Automotive Servicing NC I" },
        { lastName: "Cruz", firstName: "Noel", program: "Automotive Servicing NC I" },
        { lastName: "Bautista", firstName: "Rosa", program: "Automotive Servicing NC I" },
      ],
      studentCount: 5,
      finalizedAt: "2026-04-18T09:30:00.000Z",
    },
  ]);
}
