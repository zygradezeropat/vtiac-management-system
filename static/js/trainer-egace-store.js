/**
 * Trainer module — student progress store (source for E.G.A.C.E mirroring).
 * Employment fields live on trainer records but are stripped before EGACE display (9.1).
 */

export const TRAINER_EGACE_STORAGE_KEY = "vtiac_trainer_egace_records";
export const TRAINER_EGACE_SYNC_EVENT = "vtiac-trainer-egace-sync";

/** Trainer-only fields stripped before registrar EGACE display */
export const EGACE_EXCLUDED_FIELDS = [
  "employmentStatus",
  "employmentDetails",
  "trainerStatus",
  "statementOfAccount",
  "graduateAuto",
  "certified",
];

export function projectTrainerRecordForEgace(record) {
  const row = {};
  for (const [key, value] of Object.entries(record)) {
    if (!EGACE_EXCLUDED_FIELDS.includes(key)) row[key] = value;
  }
  return row;
}

export function getTrainerModuleRecords() {
  try {
    const raw = localStorage.getItem(TRAINER_EGACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveTrainerModuleRecords(records) {
  localStorage.setItem(TRAINER_EGACE_STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(TRAINER_EGACE_SYNC_EVENT, { detail: { records } }));
}

/** Rows safe for registrar EGACE UI (employment excluded). */
export function getEgaceTableRows() {
  const records = getTrainerModuleRecords() || [];
  return records.map(projectTrainerRecordForEgace);
}

/** Replace local mirror with trainer-module payload (registrar page load / API). */
export function syncFromTrainerModule(records) {
  if (!Array.isArray(records)) return;
  saveTrainerModuleRecords(records);
}

/** Update one registrar EGACE row in the local mirror (e.g. after manual employment toggle). */
export function patchEgaceRow(rowId, patch) {
  const records = getTrainerModuleRecords() || [];
  if (!records.length) return false;
  let found = false;
  const next = records.map((row) => {
    if (String(row.id) !== String(rowId)) return row;
    found = true;
    return { ...row, ...patch };
  });
  if (!found) return false;
  saveTrainerModuleRecords(next);
  return true;
}

export function subscribeTrainerEgaceSync(callback) {
  const handler = () => callback(getEgaceTableRows());
  window.addEventListener(TRAINER_EGACE_SYNC_EVENT, handler);
  window.addEventListener("storage", (e) => {
    if (e.key === TRAINER_EGACE_STORAGE_KEY) handler();
  });
  return () => {
    window.removeEventListener(TRAINER_EGACE_SYNC_EVENT, handler);
  };
}
