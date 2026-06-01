/**
 * Cashier transactions — localStorage until a payments API exists.
 */

export const TRANSACTIONS_STORAGE_KEY = "vtiac_cashier_transactions";

export function loadTransactions() {
  try {
    const raw = localStorage.getItem(TRANSACTIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function saveTransactions(list) {
  localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(list));
}

export function addTransaction(txn) {
  const list = loadTransactions();
  list.unshift(txn);
  saveTransactions(list);
  return list;
}

export function formatPeso(amount) {
  const n = Number(amount) || 0;
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function parseControlNumberSeq(controlNumber) {
  const match = String(controlNumber || "").match(/^CN-(\d+)$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function formatControlNumber(seq) {
  return `CN-${String(seq).padStart(4, "0")}`;
}

/** Highest CN-#### from saved transactions (client-side fallback). */
export function maxControlSeqFromTransactions() {
  return loadTransactions().reduce(
    (max, t) => Math.max(max, parseControlNumberSeq(t.controlNumber)),
    0
  );
}
