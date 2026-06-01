/**
 * Registrar — E.G.A.C.E table (mirrors trainer module; employment column excluded).
 */

import { escapeHtml } from "./registrar-student-detail.js";
import {
  getEgaceTableRows,
  syncFromTrainerModule,
  subscribeTrainerEgaceSync,
} from "./trainer-egace-store.js";

function initialsFromName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function pillTrainerStatus(status) {
  const s = (status || "Pending").toLowerCase();
  const cls =
    s === "complete" || s === "completed"
      ? "registrar-egace-pill--success"
      : s === "in progress"
        ? "registrar-egace-pill--info"
        : "registrar-egace-pill--muted";
  return `<span class="registrar-egace-pill ${cls}">${escapeHtml(status || "Pending")}</span>`;
}

function pillPayment(label) {
  const text = label || "—";
  const isFull = text.toLowerCase().includes("full");
  const cls = isFull ? "registrar-egace-pill--payment" : "registrar-egace-pill--payment-partial";
  return `<span class="registrar-egace-pill ${cls}">${escapeHtml(text)}</span>`;
}

function milestoneCell(value, options = {}) {
  const yes = Boolean(value);
  const auto = options.auto && !yes;
  if (yes) {
    return `
      <span class="registrar-egace-milestone registrar-egace-milestone--yes">
        <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
        <span>Yes</span>
      </span>`;
  }
  const label = auto ? "No (Auto)" : "No";
  const shape = options.round ? "registrar-egace-milestone__icon--round" : "";
  return `
    <span class="registrar-egace-milestone registrar-egace-milestone--no">
      <span class="registrar-egace-milestone__icon ${shape}" aria-hidden="true"><i class="bi bi-x-lg"></i></span>
      <span>${escapeHtml(label)}</span>
    </span>`;
}

function renderRow(row) {
  const initials = row.initials || initialsFromName(row.studentName);
  return `
    <tr data-id="${row.id}">
      <td>
        <div class="registrar-egace-student">
          <span class="registrar-egace-student__avatar" aria-hidden="true">${escapeHtml(initials)}</span>
          <div class="registrar-egace-student__text">
            <span class="registrar-egace-student__name">${escapeHtml(row.studentName)}</span>
            <span class="registrar-egace-student__course">${escapeHtml(row.course)}</span>
          </div>
        </div>
      </td>
      <td>${pillTrainerStatus(row.trainerStatus)}</td>
      <td>${pillPayment(row.statementOfAccount)}</td>
      <td>${milestoneCell(row.graduate, { auto: row.graduateAuto, round: true })}</td>
      <td>${milestoneCell(row.assessment)}</td>
      <td>${milestoneCell(row.certified)}</td>
    </tr>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const seedEl = document.getElementById("trainer-egace-seed");
  const tbody = document.getElementById("egace-table-body");
  const countEl = document.getElementById("egace-row-count");
  const searchEl = document.getElementById("egace-search");
  const emptyEl = document.getElementById("egace-empty");
  const syncHintEl = document.getElementById("egace-sync-hint");

  if (!tbody) return;

  if (seedEl?.textContent?.trim()) {
    try {
      const seed = JSON.parse(seedEl.textContent);
      syncFromTrainerModule(seed);
    } catch {
      /* ignore bad seed */
    }
  }

  let searchQuery = "";

  function filteredRows() {
    const rows = getEgaceTableRows();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.studentName?.toLowerCase().includes(q) ||
        r.course?.toLowerCase().includes(q) ||
        r.trainerStatus?.toLowerCase().includes(q)
    );
  }

  function render() {
    const rows = filteredRows();
    if (countEl) countEl.textContent = String(getEgaceTableRows().length);
    if (syncHintEl) {
      syncHintEl.textContent = `Synced from trainer module · ${new Date().toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
    }

    if (rows.length === 0) {
      tbody.innerHTML = "";
      emptyEl?.classList.remove("d-none");
      return;
    }

    emptyEl?.classList.add("d-none");
    tbody.innerHTML = rows.map(renderRow).join("");
  }

  searchEl?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    render();
  });

  subscribeTrainerEgaceSync(render);
  render();
});
