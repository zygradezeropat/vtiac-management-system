/**
 * Trainer — class record and progress report downloads (CSV).
 */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function loadReportsConfig() {
  const el = document.getElementById("trainer-reports-config");
  if (!el?.textContent?.trim()) return { students: [], batch_cards: [] };
  try {
    return JSON.parse(el.textContent);
  } catch {
    return { students: [], batch_cards: [] };
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildClassRecordCsv(config) {
  const students = config.students || [];
  const lines = [
    ["Last Name", "First Name", "Program", "Batch", "Schedule", "Reference ID"].map(csvEscape).join(","),
  ];
  students.forEach((student) => {
    lines.push(
      [
        student.last_name,
        student.first_name,
        student.program,
        student.batch_label,
        student.schedule,
        student.reference_id,
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines;
}

function buildProgressCsv(config) {
  const batches = config.batch_cards || [];
  const lines = [["Program", "Batch", "Schedule", "Students"].map(csvEscape).join(",")];
  batches.forEach((batch) => {
    lines.push(
      [batch.course_name, batch.batch_label, batch.schedule_display, batch.student_count]
        .map(csvEscape)
        .join(",")
    );
  });
  const students = config.students || [];
  lines.push("");
  lines.push(["Student", "Program", "Batch"].map(csvEscape).join(","));
  students.forEach((student) => {
    const name = student.name || `${student.first_name || ""} ${student.last_name || ""}`.trim();
    lines.push([name, student.program, student.batch_label].map(csvEscape).join(","));
  });
  return lines;
}

function buildAnalyticsCsv(config) {
  const students = config.students || [];
  const byProgram = new Map();
  students.forEach((student) => {
    const program = student.program || "Unassigned";
    byProgram.set(program, (byProgram.get(program) || 0) + 1);
  });
  const lines = [["Program", "Student Count"].map(csvEscape).join(",")];
  [...byProgram.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([program, count]) => {
      lines.push([program, count].map(csvEscape).join(","));
    });
  return lines;
}

function initTrainerReports() {
  const config = loadReportsConfig();
  const hasData = (config.students || []).length > 0;

  function handleDownload(type) {
    if (!hasData) {
      window.alert("No assigned students to include in this report.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (type === "class") {
      downloadCsv(`class-record-${stamp}.csv`, buildClassRecordCsv(config));
    } else if (type === "progress") {
      downloadCsv(`progress-report-${stamp}.csv`, buildProgressCsv(config));
    } else {
      downloadCsv(`performance-analytics-${stamp}.csv`, buildAnalyticsCsv(config));
    }
  }

  document.getElementById("downloadClassRecordBtn")?.addEventListener("click", () => handleDownload("class"));
  document.getElementById("downloadProgressReportBtn")?.addEventListener("click", () => handleDownload("progress"));
  document.getElementById("downloadAnalyticsBtn")?.addEventListener("click", () => handleDownload("analytics"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTrainerReports);
} else {
  initTrainerReports();
}
