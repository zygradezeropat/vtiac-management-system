/**
 * Registrar — batching & scheduling:
 * course overview + class schedule builder.
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
  {
    key: "institutional",
    label: "Institutional Competency",
  },
  {
    key: "national",
    label: "National Competency",
  },
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

export const COURSES_DATA = [];

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

function calculateScheduledDays(startDateStr, endDateStr, activeDays = []) {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(startDateStr + "T00:00:00");
  const end = new Date(endDateStr + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;

  const codeToDayIndex = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const activeDayIndices = new Set(
    (activeDays || [])
      .map((code) => codeToDayIndex[String(code).toLowerCase()])
      .filter((idx) => idx !== undefined)
  );

  let count = 0;
  const curr = new Date(start);
  while (curr <= end) {
    if (activeDayIndices.size === 0 || activeDayIndices.has(curr.getDay())) {
      count++;
    }
    curr.setDate(curr.getDate() + 1);
  }
  return count;
}

function computeEndDateForNominalDays(startDateStr, targetDays, activeDays = []) {
  if (!startDateStr || !targetDays || targetDays <= 0) return "";
  const start = new Date(startDateStr + "T00:00:00");
  if (isNaN(start.getTime())) return "";

  const codeToDayIndex = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const activeDayIndices = new Set(
    (activeDays || [])
      .map((code) => codeToDayIndex[String(code).toLowerCase()])
      .filter((idx) => idx !== undefined)
  );

  let counted = 0;
  const curr = new Date(start);
  while (counted < targetDays) {
    if (activeDayIndices.size === 0 || activeDayIndices.has(curr.getDay())) {
      counted++;
      if (counted >= targetDays) break;
    }
    curr.setDate(curr.getDate() + 1);
  }

  const yyyy = curr.getFullYear();
  const mm = String(curr.getMonth() + 1).padStart(2, "0");
  const dd = String(curr.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDatePretty(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return dateStr;
}

function activeBatchStudentCount(course) {
  const batch = course.batches[0];

  if (!batch) {
    return 0;
  }

  if (typeof batch.studentCount === "number") {
    return batch.studentCount;
  }

  return Array.isArray(batch.students)
    ? batch.students.length
    : 0;
}

function courseStatus(course) {
  const count = activeBatchStudentCount(course);

  if (count >= MIN_STUDENTS_TO_FINALIZE) {
    return {
      key: "open",
      label: "Open",
      class: "registrar-batch-card__status--ready",
    };
  }

  return {
    key: "not-available",
    label: "Not Available",
    class: "registrar-batch-card__status--closed",
  };
}

function studentsNeeded(course) {
  const count = activeBatchStudentCount(course);

  return Math.max(
    0,
    MIN_STUDENTS_TO_FINALIZE - count
  );
}

function loadBatchingTrainersData() {
  const el = document.getElementById(
    "batching-trainers-data"
  );

  if (!el?.textContent) {
    return [];
  }

  try {
    const parsed = JSON.parse(el.textContent);

    return Array.isArray(parsed)
      ? parsed
      : [];
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
  const el = document.getElementById(
    "batching-courses-data"
  );

  if (!el?.textContent) {
    return [];
  }

  try {
    const parsed = JSON.parse(el.textContent);

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function loadBatchingTemplatesData() {
  const el = document.getElementById(
    "batching-templates-data"
  );

  if (!el?.textContent) {
    return {};
  }

  try {
    const parsed = JSON.parse(el.textContent);

    return parsed &&
      typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function loadBatchingPendingEnrollmentsData() {
  const el = document.getElementById(
    "batching-pending-enrollments-data"
  );

  if (!el?.textContent) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      el.textContent
    );

    if (
      Array.isArray(parsed?.modules)
    ) {
      return parsed.modules.flatMap(
        (mod) => mod.items || []
      );
    }

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch {
    return [];
  }
}

function pendingItemKey(item) {
  return item.id != null
    ? `p-${item.id}`
    : `r-${item.registrationId}`;
}

function pendingMatchesCourse(
  item,
  course
) {
  if (
    !course ||
    (item.program || "").trim() !==
      course.name
  ) {
    return false;
  }

  const isNational =
    batchingCourseCategory(course) ===
    "national";

  const isAssessment =
    item.programType ===
    "assessment_only";

  return isNational
    ? isAssessment
    : !isAssessment;
}

function parseStudentNameParts(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts[0],
    lastName: parts
      .slice(1)
      .join(" "),
  };
}

/** True when id is a saved DB template pk. */
function isPersistedTemplateId(id) {
  return /^\d+$/.test(
    String(id || "").trim()
  );
}

function getCsrfToken() {
  const input = document.querySelector(
    "[name=csrfmiddlewaretoken]"
  );

  if (input?.value) {
    return input.value;
  }

  const match =
    document.cookie.match(
      /csrftoken=([^;]+)/
    );

  return match
    ? decodeURIComponent(match[1])
    : "";
}

function batchingCourseCategory(course) {
  if (
    course?.batchKind ===
    "national_assessment"
  ) {
    return "national";
  }

  const fromServer =
    course?.category;

  if (
    fromServer === "assessment"
  ) {
    return "national";
  }

  if (
    fromServer &&
    BATCH_CATEGORY_TABS.some(
      (t) => t.key === fromServer
    )
  ) {
    return fromServer;
  }

  return "institutional";
}

function coursesInCategory(category) {
  return COURSES_DATA.filter(
    (course) =>
      batchingCourseCategory(course) ===
      category
  );
}

function canonicalCourseKey(value) {
  const normalized =
    normalizeQualificationLabel(
      value
    );

  if (!normalized) {
    return "";
  }

  if (
    normalized.includes(
      "automotive servicing"
    ) &&
    normalized.includes("nc i")
  ) {
    return "automotive servicing nc i";
  }

  if (
    normalized.includes("automotive") &&
    normalized.includes("engine repair") &&
    normalized.includes("nc ii")
  ) {
    return "automotive servicing engine repair nc ii";
  }

  if (
    normalized.includes(
      "automotive servicing"
    ) &&
    normalized.includes("nc ii")
  ) {
    return "automotive servicing engine repair nc ii";
  }

  if (
    normalized.includes("driving") &&
    normalized.includes("nc iii")
  ) {
    return "driving nc iii";
  }

  if (
    normalized.includes("driving") &&
    normalized.includes("nc ii")
  ) {
    return "driving nc ii";
  }

  if (
    normalized.includes(
      "rice machinery operations"
    ) &&
    normalized.includes("nc ii")
  ) {
    return "rice machinery operations nc ii";
  }

  if (
    normalized.includes(
      "competency assessment"
    )
  ) {
    return "competency assessment";
  }

  return normalized;
}

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const categoryTabsEl =
      document.getElementById(
        "batching-category-tabs"
      );

    const coursesEl =
      document.getElementById(
        "batching-courses"
      );

    const coursesEmptyEl =
      document.getElementById(
        "batching-courses-empty"
      );

    const placeholderEl =
      document.getElementById(
        "batching-placeholder"
      );

    const detailEl =
      document.getElementById(
        "batching-detail"
      );

    const detailTitleEl =
      document.getElementById(
        "batching-detail-title"
      );

    const detailSubtitleEl =
      document.getElementById(
        "batching-detail-subtitle"
      );

    const durationBadgeEl =
      document.getElementById(
        "batching-duration-badge"
      );

    const closeBtn =
      document.getElementById(
        "batching-detail-close"
      );

    /*
     * ==================================================
     * COURSE CARD SELECT ALL ELEMENTS
     * ==================================================
     *
     * These IDs match the HTML:
     *
     * batching-course-selection-toolbar
     * batching-course-select-all
     * batching-selected-course-count
     */

    const courseSelectionToolbar =
      document.getElementById(
        "batching-course-selection-toolbar"
      );

    const courseSelectAllEl =
      document.getElementById(
        "batching-course-select-all"
      );

    const courseSelectionCountEl =
      document.getElementById(
        "batching-selected-course-count"
      );

    const programTabsContainer =
      document.getElementById(
        "batching-program-tabs-container"
      );

    const programTabsEl =
      document.getElementById(
        "batching-program-tabs"
      );

    const programTabsCountEl =
      document.getElementById(
        "batching-program-tabs-count"
      );

    const templateForm =
      document.getElementById(
        "schedule-template-form"
      );

    const daysErrorEl =
      document.getElementById(
        "template-days-error"
      );

    const dayPillsEl =
      document.getElementById(
        "day-pills"
      );

    const typePillsEl =
      document.getElementById(
        "schedule-type-pills"
      );

    const timeFromEl =
      document.getElementById(
        "template-time-from"
      );

    const timeToEl =
      document.getElementById(
        "template-time-to"
      );

    const dailyHoursEl =
      document.getElementById(
        "template-daily-hours"
      );

    const availableFromEl =
      document.getElementById(
        "template-available-from"
      );

    const availableUntilEl =
      document.getElementById(
        "template-available-until"
      );

    const trainerEl =
      document.getElementById(
        "template-trainer"
      );

    const trainerHintEl =
      document.getElementById(
        "template-trainer-hint"
      );

    const scheduleConflictEl =
      document.getElementById(
        "template-schedule-conflict"
      );

    const cancelBtn =
      document.getElementById(
        "schedule-template-cancel"
      );

    const academicYearEl =
      document.getElementById(
        "template-academic-year"
      );

    const termEl =
      document.getElementById(
        "template-term"
      );

    const batchNameEl =
      document.getElementById(
        "template-name"
      );

    const identifierPreviewEl =
      document.getElementById(
        "template-identifier-preview"
      );

    function updateBatchIdentifierPreview() {
      if (!identifierPreviewEl) return;
      const ay = academicYearEl?.value || "AY 2026–2027";
      const tm = termEl?.value || "1st Semester";
      const nm = batchNameEl?.value?.trim() || "Batch 1";
      identifierPreviewEl.textContent = `${ay} · ${tm} · ${nm}`;
    }

    academicYearEl?.addEventListener("change", () => {
      updateBatchIdentifierPreview();
      updateActionButtonsState();
    });
    termEl?.addEventListener("change", () => {
      updateBatchIdentifierPreview();
      updateActionButtonsState();
    });
    batchNameEl?.addEventListener("input", () => {
      updateBatchIdentifierPreview();
      updateActionButtonsState();
    });

    const enrolledStudentsEl =
      document.getElementById(
        "batching-enrolled-students"
      );

    const enrolledEmptyEl =
      document.getElementById(
        "batching-enrolled-empty"
      );

    const enrolledCountBadgeEl =
      document.getElementById(
        "batching-enrolled-count-badge"
      );

    const enrolledSearchEl =
      document.getElementById(
        "batching-enrolled-search"
      );

    const pendingNoticeEl =
      document.getElementById(
        "batching-pending-notice"
      );

    const pendingNoticeCountEl =
      document.getElementById(
        "batching-pending-notice-count"
      );

    const approvalSectionEl =
      document.getElementById(
        "batching-enrollment-approval"
      );

    const pendingStudentsEl =
      document.getElementById(
        "batching-pending-students"
      );

    const pendingEmptyEl =
      document.getElementById(
        "batching-pending-empty"
      );

    /*
     * Student Select All
     *
     * IMPORTANT:
     * This is separate from course Select All.
     */
    const selectAllEl =
      document.getElementById(
        "batching-select-all"
      );

    const bulkApproveBtn =
      document.getElementById(
        "batching-bulk-approve-btn"
      );

    const bulkApproveCountEl =
      document.getElementById(
        "batching-bulk-approve-count"
      );

    if (!coursesEl) {
      return;
    }

    let selectedCourseId = null;

    let activeCategoryTab =
      "institutional";

    let formState =
      createEmptyTemplateForm();

    let editingTemplateId = null;

    let bulkApproveInFlight =
      false;

    /*
     * ==================================================
     * COURSE CARD SELECTION STATE
     * ==================================================
     *
     * Stores selected course IDs.
     *
     * Example:
     *
     * Set {
     *   "driving",
     *   "automotive-1"
     * }
     */

    const selectedCourseIds =
      new Set();

    const selectedPendingKeys =
      new Set();

    let pendingEnrollments =
      loadBatchingPendingEnrollmentsData();

    const allTrainers =
      loadBatchingTrainersData();

    const dbCourses =
      loadBatchingCoursesData();

    COURSES_DATA.splice(
      0,
      COURSES_DATA.length,
      ...dbCourses
    );

    const templatesByCourse =
      loadBatchingTemplatesData();

    // In-memory working draft cache for each course ID to persist data across tabs
    const workingDraftsByCourse = new Map();

    /*
     * ==================================================
     * COURSE CARD SELECT ALL FUNCTIONS
     * ==================================================
     */

    function visibleCourseIds() {
      return coursesInCategory(
        activeCategoryTab
      ).map((course) =>
        String(course.id)
      );
    }

    /*
     * Updates:
     *
     * 1. Select All checkbox
     * 2. Indeterminate state
     * 3. Selected course count
     * 4. Toolbar visibility
     */

    function updateCourseSelectionUI() {
      const visibleCourses =
        coursesInCategory(
          activeCategoryTab
        );

      const totalVisible =
        visibleCourses.length;

      const openableCourses =
        visibleCourses.filter(
          (c) =>
            activeBatchStudentCount(c) >=
            MIN_STUDENTS_TO_FINALIZE
        );

      const totalOpenable =
        openableCourses.length;

      const totalSelectedOpenable =
        openableCourses.filter((c) =>
          selectedCourseIds.has(String(c.id))
        ).length;

      /*
       * Hide toolbar when
       * there are no course cards.
       */

      if (courseSelectionToolbar) {
        courseSelectionToolbar.classList.toggle(
          "d-none",
          totalVisible === 0
        );
      }

      /*
       * Disable Select All
       * when there are no available openable courses.
       */

      if (courseSelectAllEl) {
        courseSelectAllEl.disabled =
          totalOpenable === 0;

        /*
         * All openable cards selected.
         */

        courseSelectAllEl.checked =
          totalOpenable > 0 &&
          totalSelectedOpenable ===
            totalOpenable;

        /*
         * Some but not all openable cards selected.
         */

        courseSelectAllEl.indeterminate =
          totalSelectedOpenable > 0 &&
          totalSelectedOpenable <
            totalOpenable;
      }

      /*
       * Update selection count.
       */

      if (courseSelectionCountEl) {
        const total =
          selectedCourseIds.size;

        courseSelectionCountEl.textContent =
          `${total} course${
            total === 1
              ? ""
              : "s"
          } selected`;
      }

      /*
       * Toggle multi-course save button.
       */
      const saveAllBtn =
        document.getElementById(
          "schedule-template-save-all"
        );
      const saveAllCountEl =
        document.getElementById(
          "schedule-save-all-count"
        );

      const multiCount =
        selectedCourseIds.size;

      if (saveAllBtn && saveAllCountEl) {
        saveAllBtn.classList.toggle(
          "d-none",
          multiCount < 2
        );
        saveAllCountEl.textContent =
          String(multiCount);
      }

      updateActionButtonsState();
    }

    /*
     * Updates the individual
     * checkboxes inside course cards.
     */

    function updateCourseCardSelectionUI() {
      coursesEl
        .querySelectorAll(
          ".batching-course-select"
        )
        .forEach((checkbox) => {
          const courseId =
            String(
              checkbox.dataset
                .courseId || ""
            );

          checkbox.checked =
            selectedCourseIds.has(
              courseId
            );
        });

      /*
       * Add/remove selected
       * visual class from cards.
       */

      coursesEl
        .querySelectorAll(
          "[data-course-id]"
        )
        .forEach((card) => {
          const courseId =
            String(
              card.dataset
                .courseId || ""
            );

          card.classList.toggle(
            "is-course-selected",
            selectedCourseIds.has(
              courseId
            )
          );
        });
    }

    /*
     * Select or deselect
     * one individual course.
     */

    function renderProgramTabs() {
      if (!programTabsEl) {
        return;
      }

      if (
        selectedCourseId &&
        !selectedCourseIds.has(String(selectedCourseId))
      ) {
        selectedCourseIds.add(String(selectedCourseId));
      }

      const selectedList = Array.from(selectedCourseIds)
        .map((id) => getCourse(id))
        .filter(Boolean);

      if (!selectedList.length) {
        programTabsContainer?.classList.add("d-none");
        return;
      }

      programTabsContainer?.classList.remove("d-none");

      if (programTabsCountEl) {
        programTabsCountEl.textContent = String(selectedList.length);
      }

      programTabsEl.innerHTML = selectedList
        .map((course) => {
          const isActive =
            String(course.id) === String(selectedCourseId);
          const count = activeBatchStudentCount(course);
          const activeClass = isActive ? " is-active" : "";
          const reqCheck = checkCourseRequirements(course.id);
          const isReady = reqCheck.ok;

          const statusPill = isReady
            ? `<span class="registrar-batch-tab__status registrar-batch-tab__status--ready"><i class="bi bi-check-circle-fill"></i> Ready</span>`
            : `<span class="registrar-batch-tab__status registrar-batch-tab__status--incomplete"><i class="bi bi-clock"></i> Incomplete</span>`;

          return `
            <button
              type="button"
              class="registrar-batch-tab${activeClass}"
              role="tab"
              aria-selected="${isActive}"
              data-program-tab-id="${escapeHtml(course.id)}"
              title="${isReady ? 'Schedule is complete and ready' : 'Missing: ' + reqCheck.missing.join(', ')}"
            >
              <i class="bi ${
                isActive
                  ? "bi-check-circle-fill"
                  : "bi-circle"
              } me-1" style="font-size: 0.75rem;"></i>
              <span>${escapeHtml(course.name)}</span>
              <span class="registrar-batch-tab__count">
                ${count}
              </span>
              ${statusPill}
            </button>
          `;
        })
        .join("");
    }

    function toggleCourseSelection(
      courseId,
      checked
    ) {
      const normalizedId =
        String(courseId || "");

      if (!normalizedId) {
        return;
      }

      if (checked) {
        selectedCourseIds.add(
          normalizedId
        );

        if (!selectedCourseId || !selectedCourseIds.has(String(selectedCourseId))) {
          showDetail(normalizedId);
        } else {
          renderProgramTabs();
        }
      } else {
        selectedCourseIds.delete(
          normalizedId
        );
        workingDraftsByCourse.delete(
          normalizedId
        );

        if (String(selectedCourseId) === normalizedId) {
          if (selectedCourseIds.size > 0) {
            const nextCourseId = Array.from(selectedCourseIds)[0];
            showDetail(nextCourseId);
          } else {
            hideDetail();
          }
        } else {
          renderProgramTabs();
        }
      }

      updateCourseSelectionUI();

      updateCourseCardSelectionUI();
    }

    /*
     * Select or deselect
     * ALL VISIBLE COURSES.
     *
     * Important:
     * This only affects courses
     * in the current category tab.
     */

    function toggleAllVisibleCourses(
      checked
    ) {
      const visibleCourses =
        coursesInCategory(
          activeCategoryTab
        );

      const openableCourses =
        visibleCourses.filter(
          (c) =>
            activeBatchStudentCount(c) >=
            MIN_STUDENTS_TO_FINALIZE
        );

      if (checked) {
        openableCourses.forEach(
          (course) => {
            selectedCourseIds.add(
              String(course.id)
            );
          }
        );
      } else {
        visibleCourses.forEach(
          (course) => {
            const courseId =
              String(course.id);
            selectedCourseIds.delete(
              courseId
            );
            workingDraftsByCourse.delete(
              courseId
            );
          }
        );
      }

      if (checked) {
        if (openableCourses.length > 0) {
          if (!selectedCourseId || !selectedCourseIds.has(String(selectedCourseId))) {
            showDetail(String(openableCourses[0].id));
          } else {
            renderProgramTabs();
          }
        }
      } else {
        if (selectedCourseIds.size === 0) {
          hideDetail();
        } else {
          if (!selectedCourseIds.has(String(selectedCourseId))) {
            showDetail(Array.from(selectedCourseIds)[0]);
          } else {
            renderProgramTabs();
          }
        }
      }

      updateCourseSelectionUI();

      updateCourseCardSelectionUI();
    }

    /*
     * ==================================================
     * EXISTING COURSE FUNCTIONS
     * ==================================================
     */

    function getCourse(id) {
      return COURSES_DATA.find(
        (c) => c.id === id
      );
    }

    function selectedCourse() {
      return selectedCourseId
        ? getCourse(
            selectedCourseId
          )
        : null;
    }

    function getTemplatesForCourse(
      courseId
    ) {
      const list =
        templatesByCourse[
          courseId
        ];

      return Array.isArray(list)
        ? list
        : [];
    }

    function setTemplatesForCourse(
      courseId,
      templates
    ) {
      templatesByCourse[
        courseId
      ] = templates;
    }

    function pendingForSelectedCourse() {
      const course =
        selectedCourse();

      if (!course) {
        return [];
      }

      return pendingEnrollments.filter(
        (item) =>
          pendingMatchesCourse(
            item,
            course
          )
      );
    }

    function approvablePendingForSelectedCourse() {
      return pendingForSelectedCourse().filter(
        (item) => item.canApprove
      );
    }

    /*
     * ==================================================
     * STUDENT SELECT ALL
     * ==================================================
     */

    function syncSelectAllState() {
      if (!selectAllEl) {
        return;
      }

      const approvable =
        approvablePendingForSelectedCourse();

      const approvableKeys =
        approvable.map(
          (item) =>
            pendingItemKey(item)
        );

      const selectedApprovable =
        approvableKeys.filter(
          (key) =>
            selectedPendingKeys.has(
              key
            )
        );

      selectAllEl.disabled =
        approvable.length === 0;

      selectAllEl.checked =
        approvable.length > 0 &&
        selectedApprovable.length ===
          approvable.length;

      selectAllEl.indeterminate =
        selectedApprovable.length > 0 &&
        selectedApprovable.length <
          approvable.length;
    }

    function updateBulkApproveUI() {
      const count =
        selectedPendingKeys.size;

      if (bulkApproveCountEl) {
        bulkApproveCountEl.textContent =
          String(count);
      }

      if (bulkApproveBtn) {
        bulkApproveBtn.disabled =
          count === 0 ||
          bulkApproveInFlight;
      }

      syncSelectAllState();
    }

    function clearPendingSelection() {
      selectedPendingKeys.clear();

      updateBulkApproveUI();
    }

    function applyApprovedStudentsToCourse(
      course,
      items
    ) {
      if (
        !course ||
        !items.length
      ) {
        return;
      }

      const batch =
        course.batches?.[0];

      if (!batch) {
        return;
      }

      items.forEach((item) => {
        const {
          firstName,
          lastName,
        } =
          parseStudentNameParts(
            item.name
          );

        const student = {
          firstName,
          lastName,
          program:
            item.program ||
            course.name,
        };

        if (
          !Array.isArray(
            batch.students
          )
        ) {
          batch.students = [];
        }

        batch.students.push(
          student
        );
      });

      if (
        typeof batch.studentCount ===
        "number"
      ) {
        batch.studentCount +=
          items.length;
      } else {
        batch.studentCount =
          batch.students.length;
      }
    }

    function refreshScheduleLockUI() {
      const course =
        selectedCourse();

      if (!course) {
        return;
      }

      const count =
        activeBatchStudentCount(
          course
        );

      const scheduleLocked =
        count <
        MIN_STUDENTS_TO_FINALIZE;

      const isNational =
        batchingCourseCategory(
          course
        ) === "national";

      if (templateForm) {
        templateForm.classList.toggle(
          "pe-none",
          scheduleLocked
        );

        templateForm.classList.toggle(
          "opacity-50",
          scheduleLocked
        );
      }

      if (
        detailSubtitleEl &&
        scheduleLocked
      ) {
        detailSubtitleEl.textContent =
          isNational
            ? `At least ${MIN_STUDENTS_TO_FINALIZE} enrolled students are needed to schedule national assessment (currently ${count}).`
            : `At least ${MIN_STUDENTS_TO_FINALIZE} enrolled students are needed to schedule this batch (currently ${count}).`;
      } else if (detailSubtitleEl) {
        detailSubtitleEl.textContent =
          isNational
            ? `${count} enrolled student(s) available. Configure national assessment schedule below.`
            : `${count} enrolled student(s) ready. Configure the class schedule below and save to review in Finalized Batches.`;
      }

      renderEnrolledStudentsRoster();
    }

    function renderEnrolledStudentsRoster() {
      const course = selectedCourse();
      if (!enrolledStudentsEl) {
        return;
      }

      if (!course) {
        enrolledStudentsEl.innerHTML = "";
        enrolledEmptyEl?.classList.remove("d-none");
        if (enrolledCountBadgeEl) {
          enrolledCountBadgeEl.textContent = "0 Ready";
        }
        if (pendingNoticeEl) {
          pendingNoticeEl.classList.add("d-none");
        }
        return;
      }

      const allStudents =
        course.batches &&
        course.batches[0] &&
        Array.isArray(course.batches[0].students)
          ? course.batches[0].students
          : [];

      const query = (enrolledSearchEl?.value || "").trim().toLowerCase();
      const filtered = query
        ? allStudents.filter((s) => {
            const fullName = `${s.lastName || ""} ${s.firstName || ""} ${s.middleName || ""}`.toLowerCase();
            const email = (s.email || "").toLowerCase();
            const ref = (s.referenceId || "").toLowerCase();
            return (
              fullName.includes(query) ||
              email.includes(query) ||
              ref.includes(query)
            );
          })
        : allStudents;

      if (enrolledCountBadgeEl) {
        enrolledCountBadgeEl.textContent = `${allStudents.length} Ready`;
      }

      if (!filtered.length) {
        enrolledStudentsEl.innerHTML = "";
        enrolledEmptyEl?.classList.remove("d-none");
      } else {
        enrolledEmptyEl?.classList.add("d-none");
        enrolledStudentsEl.innerHTML = filtered
          .map((s, idx) => {
            const lName = escapeHtml(s.lastName || "");
            const fName = escapeHtml(s.firstName || "");
            const mName = escapeHtml(s.middleName || "");
            const fullName = `${lName}, ${fName}${mName ? " " + mName : ""}`;
            const email = escapeHtml(s.email || "-");
            const phone = escapeHtml(s.phoneNumber || "");
            const ref = escapeHtml(s.referenceId || "");
            const progTrack = escapeHtml(
              s.programTypeDisplay || s.programType || "Training with Assessment"
            );
            const prefSched = escapeHtml(
              s.preferredSchedule || "Standard Schedule"
            );

            return `
              <tr>
                <td class="text-muted small align-middle">${idx + 1}</td>
                <td class="align-middle">
                  <div class="fw-semibold text-dark">${fullName}</div>
                  ${
                    ref
                      ? `<small class="text-muted font-monospace">${ref}</small>`
                      : ""
                  }
                </td>
                <td class="align-middle">
                  <div>${email}</div>
                  ${
                    phone
                      ? `<small class="text-muted">${phone}</small>`
                      : ""
                  }
                </td>
                <td class="align-middle">
                  <span class="badge text-bg-light border text-secondary">${progTrack}</span>
                </td>
                <td class="align-middle">
                  <span class="small text-secondary">${prefSched}</span>
                </td>
                <td class="text-center align-middle">
                  <span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2">
                    <i class="bi bi-check2-circle me-1" aria-hidden="true"></i>Enrolled · Ready
                  </span>
                </td>
              </tr>
            `;
          })
          .join("");
      }

      // Check for pending applicants awaiting document verification in Enrollment module
      const pendingForCourse = pendingEnrollments.filter((item) =>
        pendingMatchesCourse(item, course)
      );

      if (pendingNoticeEl) {
        if (pendingForCourse.length > 0) {
          pendingNoticeEl.classList.remove("d-none");
          if (pendingNoticeCountEl) {
            pendingNoticeCountEl.textContent = String(pendingForCourse.length);
          }
        } else {
          pendingNoticeEl.classList.add("d-none");
        }
      }
    }

    function renderEnrollmentApproval() {
      const course =
        selectedCourse();

      const rows =
        pendingForSelectedCourse();

      const approvable =
        rows.filter(
          (item) =>
            item.canApprove
        );

      if (!approvalSectionEl) {
        return;
      }

      approvalSectionEl.classList.add(
        "d-none"
      );

      if (!course) {
        return;
      }

      if (!rows.length) {
        if (pendingStudentsEl) {
          pendingStudentsEl.innerHTML =
            "";
        }

        pendingEmptyEl?.classList.remove(
          "d-none"
        );

        if (selectAllEl) {
          selectAllEl.checked =
            false;

          selectAllEl.indeterminate =
            false;

          selectAllEl.disabled =
            true;
        }

        updateBulkApproveUI();

        return;
      }

      pendingEmptyEl?.classList.add(
        "d-none"
      );

      if (pendingStudentsEl) {
        pendingStudentsEl.innerHTML =
          rows
            .map((item) => {
              const key =
                pendingItemKey(
                  item
                );

              const checked =
                selectedPendingKeys.has(
                  key
                )
                  ? " checked"
                  : "";

              const disabled =
                item.canApprove
                  ? ""
                  : " disabled";

              const title =
                item.canApprove
                  ? ""
                  : "Available when learner profile, requirements, and payment are complete.";

              return `
                <tr data-pending-key="${escapeHtml(
                  key
                )}">
                  <td class="registrar-batching-approval-table__check">
                    <input
                      type="checkbox"
                      class="form-check-input batching-pending-check"
                      data-key="${escapeHtml(
                        key
                      )}"
                      aria-label="Select ${escapeHtml(
                        item.name
                      )}"
                      ${checked}
                      ${disabled}
                      title="${escapeHtml(
                        title
                      )}"
                    />
                  </td>

                  <td>
                    <div class="fw-semibold">
                      ${escapeHtml(
                        item.name
                      )}
                    </div>

                    <div class="text-muted small">
                      ${escapeHtml(
                        item.email
                      )}
                    </div>
                  </td>

                  <td>
                    <span class="badge registrar-enrollment-status ${escapeHtml(
                      item.neededBadgeClass ||
                        ""
                    )}">
                      ${escapeHtml(
                        item.neededLabel ||
                          "Pending"
                      )}
                    </span>
                  </td>
                </tr>
              `;
            })
            .join("");
      }

      selectedPendingKeys.forEach(
        (key) => {
          if (
            !approvable.some(
              (item) =>
                pendingItemKey(
                  item
                ) === key
            )
          ) {
            selectedPendingKeys.delete(
              key
            );
          }
        }
      );

      updateBulkApproveUI();
    }

    async function bulkApproveSelected() {
      const course =
        selectedCourse();

      if (
        !course ||
        bulkApproveInFlight ||
        selectedPendingKeys.size === 0
      ) {
        return;
      }

      const items =
        pendingForSelectedCourse().filter(
          (item) =>
            selectedPendingKeys.has(
              pendingItemKey(item)
            )
        );

      if (!items.length) {
        return;
      }

      const approvable =
        items.filter(
          (item) =>
            item.canApprove
        );

      if (!approvable.length) {
        return;
      }

      const label =
        approvable.length === 1
          ? approvable[0].name
          : `${approvable.length} students`;

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
        const res =
          await fetch(
            "/registrar/api/enrollment/bulk-approve/",
            {
              method: "POST",
              headers: {
                "X-CSRFToken":
                  getCsrfToken(),

                Accept:
                  "application/json",

                "Content-Type":
                  "application/json",
              },

              credentials:
                "same-origin",

              body: JSON.stringify({
                items:
                  approvable.map(
                    (item) => ({
                      profileId:
                        item.id,

                      registrationId:
                        item.registrationId,
                    })
                  ),
              }),
            }
          );

        const data =
          await res
            .json()
            .catch(
              () => ({})
            );

        if (!res.ok) {
          throw new Error(
            data.error ||
              "Bulk approval failed."
          );
        }

        const approvedKeys =
          new Set(
            (data.approved || [])
              .map((row) => {
                if (
                  row.profileId != null
                ) {
                  return `p-${row.profileId}`;
                }

                if (
                  row.registrationId
                ) {
                  return `r-${row.registrationId}`;
                }

                return "";
              })
          );

        const approvedItems =
          approvable.filter(
            (item) =>
              approvedKeys.has(
                pendingItemKey(
                  item
                )
              )
          );

        pendingEnrollments =
          pendingEnrollments.filter(
            (item) =>
              !approvedKeys.has(
                pendingItemKey(
                  item
                )
              )
          );

        applyApprovedStudentsToCourse(
          course,
          approvedItems
        );

        clearPendingSelection();

        renderEnrollmentApproval();

        renderCourseCards();

        refreshScheduleLockUI();

        if (
          Array.isArray(
            data.failed
          ) &&
          data.failed.length
        ) {
          window.alert(
            `Approved ${
              data.approvedCount ||
              approvedItems.length
            } student(s). ${
              data.failed.length
            } could not be approved.`
          );
        }
      } catch (err) {
        window.alert(
          err.message ||
            "Could not approve selected students."
        );
      } finally {
        bulkApproveInFlight =
          false;

        updateBulkApproveUI();
      }
    }

    /*
     * ==================================================
     * SCHEDULE FUNCTIONS
     * ==================================================
     */

    function getDraftForCourse(
      courseId
    ) {
      const course =
        getCourse(courseId);

      const kind =
        course?.batchKind ||
        "training";

      return getTemplatesForCourse(
        courseId
      ).find(
        (t) =>
          t.status === "draft" &&
          (t.batchKind ||
            "training") ===
            kind
      ) || null;
    }

    function saveActiveTabToWorkingDraft() {
      if (!selectedCourseId) return;
      readFormFromInputs();
      workingDraftsByCourse.set(String(selectedCourseId), {
        ...formState,
        days: [...(formState.days || [])],
        editingTemplateId: editingTemplateId,
        modifiedByUser: true,
      });
    }

    function loadCourseIntoForm(courseId) {
      const normalizedId = String(courseId);
      const course = getCourse(normalizedId);
      if (!course) {
        resetForm();
        return;
      }

      if (workingDraftsByCourse.has(normalizedId)) {
        const cached = workingDraftsByCourse.get(normalizedId);
        editingTemplateId = cached.editingTemplateId ?? null;
        formState = {
          ...cached,
          days: [...(cached.days || [])],
        };
        applyFormToInputs();
      } else {
        const draft = getDraftForCourse(course.id);
        if (draft) {
          loadTemplateIntoForm(draft);
          workingDraftsByCourse.set(normalizedId, {
            ...formState,
            days: [...formState.days],
            editingTemplateId: editingTemplateId,
            modifiedByUser: false,
          });
        } else {
          resetForm();
          const existingList = getTemplatesForCourse(course.id) || [];
          const nextBatchNum = existingList.length + 1;
          formState.name = `Batch ${nextBatchNum}`;
          // Fresh schedule for this course starts with empty dates and unassigned trainer
          formState.availableFrom = "";
          formState.availableUntil = "";
          formState.trainerId = "";
          formState.trainerName = "";
          applyFormToInputs();
          workingDraftsByCourse.set(normalizedId, {
            ...formState,
            days: [...formState.days],
            editingTemplateId: null,
            modifiedByUser: false,
          });
        }
      }
      updateScheduleDurationUI();
    }

    function checkCourseRequirements(courseId) {
      const course = getCourse(courseId);
      if (!course) return { ok: false, missing: ["program not found"], state: null, studentCount: 0 };

      const state = (String(courseId) === String(selectedCourseId))
        ? formState
        : (workingDraftsByCourse.get(String(courseId)) || getDraftForCourse(courseId));

      if (!state) {
        return {
          ok: false,
          missing: ["schedule not configured"],
          state: null,
          studentCount: activeBatchStudentCount(course),
        };
      }

      const missing = [];
      if (!state.days || !state.days.length) {
        missing.push("training day(s)");
      }
      if (!state.timeFrom || !state.timeTo) {
        missing.push("start & end times");
      } else if (state.timeFrom >= state.timeTo) {
        missing.push("end time after start time");
      }

      if (!state.availableFrom || !state.availableUntil) {
        missing.push("start & end dates");
      } else if (state.availableUntil < state.availableFrom) {
        missing.push("end date on/after start date");
      }

      if (!state.trainerId) {
        missing.push("qualified trainer");
      }

      if (!state.name || !state.name.trim()) {
        missing.push("batch name");
      }

      // Check trainer conflict
      const excludeId =
        state.editingTemplateId ||
        (isPersistedTemplateId(editingTemplateId) ? editingTemplateId : null);
      if (
        state.trainerId &&
        state.days?.length &&
        state.timeFrom &&
        state.timeTo
      ) {
        const trainer = qualifiedTrainersForCourse(course).find(
          (t) => String(t.id) === String(state.trainerId)
        );
        if (
          trainer &&
          findTrainerScheduleConflict(trainer, excludeId, state, course.id)
        ) {
          missing.push("resolve trainer conflict");
        }
      }

      return {
        ok: missing.length === 0,
        missing,
        state,
        studentCount: activeBatchStudentCount(course),
      };
    }

    function updateScheduleDurationUI() {
      const course = selectedCourse();
      if (!course || !durationBadgeEl) return;

      const isNational = batchingCourseCategory(course) === "national";
      if (isNational) {
        durationBadgeEl.textContent = "National assessment";
        durationBadgeEl.classList.remove("d-none");
        return;
      }

      const nominalDays = courseDurationDays(course);
      const scheduledDays = calculateScheduledDays(
        formState.availableFrom,
        formState.availableUntil,
        formState.days
      );

      const feedbackEl = document.getElementById("template-dates-dynamic-feedback");
      const feedbackTextEl = document.getElementById("template-dates-dynamic-text");
      const autoCalcLabel = document.getElementById("auto-calc-days-label");

      if (autoCalcLabel) {
        autoCalcLabel.textContent = String(nominalDays || 24);
      }

      if (scheduledDays !== null) {
        durationBadgeEl.innerHTML = `<i class="bi bi-calendar-check me-1"></i>${scheduledDays} training day${scheduledDays === 1 ? "" : "s"}`;
        durationBadgeEl.title = `Scheduled: ${scheduledDays} training days (${formState.availableFrom} to ${formState.availableUntil}). Nominal course regulation: ${nominalDays} days.`;
        durationBadgeEl.classList.remove("d-none");

        if (feedbackEl && feedbackTextEl) {
          feedbackEl.classList.remove("d-none");
          feedbackTextEl.innerHTML = `<strong>${scheduledDays} training day${scheduledDays === 1 ? "" : "s"} scheduled</strong> (${formatDatePretty(formState.availableFrom)} to ${formatDatePretty(formState.availableUntil)}). Course nominal requirement is ${nominalDays} days.`;
        }
      } else if (nominalDays > 0) {
        durationBadgeEl.innerHTML = `<i class="bi bi-clock me-1"></i>${nominalDays} training days (default)`;
        durationBadgeEl.title = `Standard nominal course duration: ${nominalDays} training days. Set start and end dates below to calculate actual schedule.`;
        durationBadgeEl.classList.remove("d-none");

        if (feedbackEl && feedbackTextEl) {
          if (formState.availableFrom && !formState.availableUntil) {
            feedbackEl.classList.remove("d-none");
            feedbackTextEl.innerHTML = `Select an End Date, or click <strong>Auto-calculate (${nominalDays} days)</strong> to auto-fill.`;
          } else {
            feedbackEl.classList.add("d-none");
          }
        }
      } else {
        durationBadgeEl.classList.add("d-none");
        if (feedbackEl) feedbackEl.classList.add("d-none");
      }
    }

    async function upsertTemplateForCourse(
      courseId,
      template
    ) {
      const body =
        new URLSearchParams();

      if (
        isPersistedTemplateId(
          template.id
        )
      ) {
        body.set(
          "id",
          String(
            template.id
          ).trim()
        );
      }

      body.set(
        "course_id",
        courseId
      );

      body.set(
        "course_name",
        template.courseName ||
          ""
      );

      body.set(
        "batch_kind",
        template.batchKind ||
          "training"
      );

      body.set(
        "academic_year",
        template.academicYear ||
          academicYearEl?.value ||
          "AY 2026–2027"
      );

      body.set(
        "term",
        template.term ||
          termEl?.value ||
          "1st Semester"
      );

      const rawBatchName = template.name || batchNameEl?.value?.trim() || "Batch 1";
      const ay = template.academicYear || academicYearEl?.value || "AY 2026–2027";

      body.set(
        "batch_label",
        `${ay} · ${rawBatchName}`.slice(0, 64)
      );

      body.set(
        "name",
        rawBatchName
      );

      body.set(
        "schedule_type",
        template.scheduleType ||
          ""
      );

      (
        template.days || []
      ).forEach((d) =>
        body.append(
          "days",
          d
        )
      );

      body.set(
        "time_from",
        template.timeFrom ||
          ""
      );

      body.set(
        "time_to",
        template.timeTo ||
          ""
      );

      body.set(
        "daily_hours",
        String(
          template.dailyHours ??
            0
        )
      );

      body.set(
        "available_from",
        template.availableFrom ||
          ""
      );

      body.set(
        "available_until",
        template.availableUntil ||
          ""
      );

      body.set(
        "trainer_request_id",
        template.trainerId ||
          ""
      );

      body.set(
        "trainer_name",
        template.trainerName ||
          ""
      );

      const res =
        await fetch(
          "/registrar/api/batching/template/upsert/",
          {
            method: "POST",

            headers: {
              "X-CSRFToken":
                getCsrfToken(),

              "Content-Type":
                "application/x-www-form-urlencoded",

              Accept:
                "application/json",
            },

            credentials:
              "same-origin",

            body:
              body.toString(),
          }
        );

      const data =
        await res
          .json()
          .catch(
            () => ({})
          );

      if (!res.ok) {
        throw new Error(
          data.error ||
            "Could not save schedule."
        );
      }

      return data.template;
    }

    function renderDayPills() {
      if (!dayPillsEl) {
        return;
      }

      const custom =
        formState.scheduleType ===
        "custom";

      dayPillsEl.innerHTML =
        DAY_CODES.map(
          (code) => {
            const active =
              formState.days.includes(
                code
              );

            const disabled =
              !custom
                ? " disabled"
                : "";

            return `
              <button
                type="button"
                class="registrar-schedule-pill registrar-schedule-pill--day${
                  active
                    ? " is-active"
                    : ""
                }"
                data-day="${code}"
                ${disabled}
              >
                ${DAY_LABELS[code]}
              </button>
            `;
          }
        ).join("");
    }

    function updateTypePills() {
      typePillsEl
        ?.querySelectorAll(
          "[data-schedule-type]"
        )
        .forEach((btn) => {
          btn.classList.toggle(
            "is-active",
            btn.dataset
                .scheduleType ===
              formState.scheduleType
          );
        });
    }

    function updateDailyHoursField() {
      const hours =
        computeDailyHours(
          formState.timeFrom,
          formState.timeTo
        );

      if (dailyHoursEl) {
        dailyHoursEl.value =
          hours
            ? `${hours} hrs / day`
            : "—";
      }
    }

    function qualifiedTrainersForCourse(
      course
    ) {
      if (!course) {
        return [];
      }

      const target =
        canonicalCourseKey(
          course.name
        );

      return allTrainers.filter(
        (trainer) => {
          const quals =
            Array.isArray(
              trainer.qualifications
            )
              ? trainer.qualifications
              : [];

          return quals.some(
            (q) =>
              canonicalCourseKey(
                q
              ) === target
          );
        }
      );
    }

    function getFinalizedBatches() {
      const rows = [];

      Object.values(
        templatesByCourse
      ).forEach((list) => {
        if (
          !Array.isArray(list)
        ) {
          return;
        }

        list.forEach((tpl) => {
          if (
            tpl.status ===
            "finalized"
          ) {
            rows.push(tpl);
          }
        });
      });

      return rows;
    }

    function draftScheduleFromForm() {
      return {
        scheduleType:
          formState.scheduleType,

        days: [
          ...formState.days,
        ],

        timeFrom:
          formState.timeFrom,

        timeTo:
          formState.timeTo,

        availableFrom:
          formState.availableFrom,

        availableUntil:
          formState.availableUntil,
      };
    }

    function hasMinimumScheduleForConflictCheck() {
      return Boolean(
        formState.days.length &&
          formState.timeFrom &&
          formState.timeTo
      );
    }

    function findTrainerScheduleConflict(
      trainer,
      excludeTemplateId = null,
      customSchedule = null,
      targetCourseId = null
    ) {
      if (!trainer) {
        return null;
      }

      const currentCourse = selectedCourse();
      const courseIdToCheck = targetCourseId || currentCourse?.id;

      const scheduleToCheck =
        customSchedule || draftScheduleFromForm();

      if (
        !scheduleToCheck ||
        !scheduleToCheck.days ||
        !scheduleToCheck.days.length ||
        !scheduleToCheck.timeFrom ||
        !scheduleToCheck.timeTo
      ) {
        return null;
      }

      // 1. Check in-memory drafts from other tabs in workingDraftsByCourse
      for (const [cId, draft] of workingDraftsByCourse.entries()) {
        if (courseIdToCheck && String(cId) === String(courseIdToCheck)) {
          continue;
        }

        if (
          excludeTemplateId &&
          String(draft.editingTemplateId || draft.id) ===
            String(excludeTemplateId)
        ) {
          continue;
        }

        if (!trainerMatchesBatch(trainer, draft)) {
          continue;
        }

        if (!draft.days || !draft.days.length || !draft.timeFrom || !draft.timeTo) {
          continue;
        }

        if (schedulesConflict(scheduleToCheck, draft)) {
          return {
            courseName:
              draft.courseName || getCourse(cId)?.name || "another program",
            batchLabel: draft.batchLabel || draft.name || "Draft",
            timeFrom: draft.timeFrom,
            timeTo: draft.timeTo,
            days: draft.days,
            availableFrom: draft.availableFrom,
            availableUntil: draft.availableUntil,
            isDraft: true,
          };
        }
      }

      // 2. Check saved templates from DB (active and drafts of other courses)
      for (const list of Object.values(templatesByCourse)) {
        if (!Array.isArray(list)) {
          continue;
        }

        for (const tpl of list) {
          if (
            excludeTemplateId &&
            String(tpl.id) === String(excludeTemplateId)
          ) {
            continue;
          }

          // If it's a DRAFT of the same course being edited, skip it so it doesn't conflict with itself.
          // But ACTIVE batches of the same course (e.g. Batch 1) MUST be checked for trainer conflict!
          if (
            tpl.status === "draft" &&
            courseIdToCheck &&
            String(tpl.courseId) === String(courseIdToCheck)
          ) {
            continue;
          }

          if (
            tpl.status === "draft" &&
            tpl.courseId &&
            workingDraftsByCourse.has(String(tpl.courseId))
          ) {
            continue;
          }

          if (tpl.status === "completed") {
            continue;
          }

          if (!trainerMatchesBatch(trainer, tpl)) {
            continue;
          }

          if (!tpl.days || !tpl.days.length || !tpl.timeFrom || !tpl.timeTo) {
            continue;
          }

          if (schedulesConflict(scheduleToCheck, tpl)) {
            return tpl;
          }
        }
      }

      return null;
    }

    function trainersForScheduleForm(
      course
    ) {
      const qualified =
        qualifiedTrainersForCourse(
          course
        );

      if (
        !hasMinimumScheduleForConflictCheck()
      ) {
        return {
          selectable: qualified,
          hidden: [],
          needsScheduleFields: true,
        };
      }

      const excludeId =
        isPersistedTemplateId(
          editingTemplateId
        )
          ? editingTemplateId
          : null;

      const selectable = [];

      const hidden = [];

      qualified.forEach(
        (trainer) => {
          const conflict =
            findTrainerScheduleConflict(
              trainer,
              excludeId,
              null,
              course?.id
            );

          if (conflict) {
            hidden.push({
              trainer,
              conflict,
            });
          } else {
            selectable.push(
              trainer
            );
          }
        }
      );

      return {
        selectable,
        hidden,
        needsScheduleFields: false,
      };
    }

    function updateScheduleConflictNotice() {
      if (!scheduleConflictEl) {
        return;
      }

      const course =
        selectedCourse();

      if (
        !course ||
        !detailEl ||
        detailEl.classList.contains(
          "d-none"
        )
      ) {
        scheduleConflictEl.classList.add(
          "d-none"
        );

        scheduleConflictEl.textContent =
          "";

        return;
      }

      const {
        needsScheduleFields,
      } =
        trainersForScheduleForm(
          course
        );

      if (needsScheduleFields) {
        scheduleConflictEl.classList.add(
          "d-none"
        );

        scheduleConflictEl.textContent =
          "";

        return;
      }

      const excludeId =
        isPersistedTemplateId(
          editingTemplateId
        )
          ? editingTemplateId
          : null;

      const selected =
        qualifiedTrainersForCourse(
          course
        ).find(
          (t) =>
            String(t.id) ===
            String(formState.trainerId)
        );

      const selectedConflict =
        selected
          ? findTrainerScheduleConflict(
              selected,
              excludeId,
              null,
              course?.id
            )
          : null;

      if (selectedConflict) {
        scheduleConflictEl.classList.remove(
          "d-none"
        );

        scheduleConflictEl.innerHTML = `
          <i
            class="bi bi-exclamation-triangle me-1"
            aria-hidden="true">
          </i>

          <strong>
            Schedule conflict:
          </strong>

          ${escapeHtml(
            selected.name
          )}

          is already assigned to

          <strong>
            ${escapeHtml(
              formatBatchConflictLabel(
                selectedConflict
              )
            )}
          </strong>

          on overlapping days, times, or dates.
          Change the schedule or pick another trainer.
        `;

        return;
      }

      scheduleConflictEl.classList.add(
        "d-none"
      );

      scheduleConflictEl.textContent =
        "";
    }

    function refreshTrainerScheduleUI() {
      renderTrainerOptions();

      updateScheduleConflictNotice();

      updateActionButtonsState();
    }

    function renderTrainerOptions() {
      if (!trainerEl) {
        return;
      }

      const course =
        selectedCourse();

      const {
        selectable,
        hidden,
        needsScheduleFields,
      } =
        trainersForScheduleForm(
          course
        );

      const current =
        formState.trainerId ||
        "";

      const isCurrentConflicted = hidden.some(
        (h) => String(h.trainer.id) === String(current)
      );

      const isCurrentSelectable = selectable.some(
        (t) => String(t.id) === String(current)
      );

      const isQualifiedAvailable =
        qualifiedTrainersForCourse(course).length > 0;

      const options = [
        !isQualifiedAvailable
          ? '<option value="">No qualified trainer assigned to this program</option>'
          : '<option value="">Select trainer</option>',
      ];

      selectable.forEach(
        (trainer) => {
          const selected =
            String(trainer.id) === String(current)
              ? " selected"
              : "";

          options.push(`
            <option
              value="${escapeHtml(
                trainer.id
              )}"
              ${selected}
            >
              ${escapeHtml(
                trainer.name
              )}
            </option>
          `);
        }
      );

      hidden.forEach(({ trainer, conflict }) => {
        const conflictLabel = formatBatchConflictLabel(conflict);
        const selected =
          String(trainer.id) === String(current)
            ? " selected"
            : "";
        options.push(`
          <option
            value="${escapeHtml(trainer.id)}"
            disabled
            class="text-muted fst-italic"
            ${selected}
          >
            ${escapeHtml(trainer.name)} (Unavailable — Conflict with ${escapeHtml(conflictLabel)})
          </option>
        `);
      });

      trainerEl.innerHTML =
        options.join("");

      if (!isCurrentSelectable && !isCurrentConflicted) {
        formState.trainerId =
          "";

        formState.trainerName =
          "";

        trainerEl.value =
          "";
      } else {
        trainerEl.value = current;
      }

      if (trainerHintEl) {
        if (!course) {
          trainerHintEl.textContent =
            "";
        } else if (
          !isQualifiedAvailable
        ) {
          trainerHintEl.innerHTML =
            `<span class="text-danger fw-semibold"><i class="bi bi-exclamation-triangle-fill me-1"></i>No trainer is currently assigned to this program. A trainer can be assigned multiple programs in Trainer settings.</span>`;
        } else if (
          needsScheduleFields
        ) {
          trainerHintEl.textContent =
            "Set days and class times to check trainer availability.";
        } else if (
          !selectable.length &&
          hidden.length > 0
        ) {
          trainerHintEl.innerHTML =
            `<span class="text-danger fw-semibold"><i class="bi bi-exclamation-triangle-fill me-1"></i>All qualified trainers have a schedule conflict on these days/times.</span>`;
        } else if (hidden.length > 0) {
          trainerHintEl.innerHTML =
            `<span class="text-success">${selectable.length} trainer${
              selectable.length === 1 ? "" : "s"
            } available.</span> <span class="text-muted">(${hidden.length} unavailable due to schedule overlap)</span>`;
        } else {
          trainerHintEl.textContent =
            `${selectable.length} trainer${
              selectable.length ===
              1
                ? ""
                : "s"
            } available for this schedule.`;
        }
      }
    }

    function applyFormToInputs() {
      if (timeFromEl) {
        timeFromEl.value =
          formState.timeFrom;
      }

      if (timeToEl) {
        timeToEl.value =
          formState.timeTo;
      }

      if (availableFromEl) {
        availableFromEl.value =
          formState.availableFrom;
      }

      if (availableUntilEl) {
        availableUntilEl.value =
          formState.availableUntil;
      }

      updateTypePills();

      renderDayPills();

      updateDailyHoursField();

      refreshTrainerScheduleUI();

      if (academicYearEl) {
        academicYearEl.value =
          formState.academicYear ||
          "AY 2026–2027";
      }

      if (termEl) {
        termEl.value =
          formState.term ||
          "1st Semester";
      }

      if (batchNameEl) {
        batchNameEl.value =
          formState.name ||
          "Batch 1";
      }

      updateBatchIdentifierPreview();

      daysErrorEl?.classList.add(
        "d-none"
      );

      updateActionButtonsState();
    }

    function readFormFromInputs() {
      formState.timeFrom =
        timeFromEl?.value ||
        "";

      formState.timeTo =
        timeToEl?.value ||
        "";

      formState.availableFrom =
        availableFromEl?.value ||
        "";

      formState.availableUntil =
        availableUntilEl?.value ||
        "";

      formState.trainerId =
        trainerEl?.value ||
        "";

      if (
        formState.trainerId
      ) {
        const selected =
          qualifiedTrainersForCourse(
            selectedCourse()
          ).find(
            (t) =>
              t.id ===
              formState.trainerId
          );

        formState.trainerName =
          selected?.name ||
          "";
      } else {
        formState.trainerName =
          "";
      }

      formState.academicYear =
        academicYearEl?.value ||
        "AY 2026–2027";

      formState.term =
        termEl?.value ||
        "1st Semester";

      formState.name =
        batchNameEl?.value?.trim() ||
        "Batch 1";

      updateDailyHoursField();
    }

    function setScheduleType(
      type
    ) {
      formState.scheduleType =
        type;

      if (
        type === "custom" &&
        !formState.days.length
      ) {
        formState.days = [
          ...WEEKDAY_CODES,
        ];
      } else if (
        type !== "custom"
      ) {
        formState.days =
          daysForScheduleType(
            type
          );
      }

      updateTypePills();

      renderDayPills();

      refreshTrainerScheduleUI();
      saveActiveTabToWorkingDraft();
      updateScheduleDurationUI();
      updateActionButtonsState();
    }

    function toggleDay(code) {
      if (
        formState.scheduleType !==
        "custom"
      ) {
        return;
      }

      if (
        formState.days.includes(
          code
        )
      ) {
        formState.days =
          formState.days.filter(
            (d) => d !== code
          );
      } else {
        formState.days = [
          ...formState.days,
          code,
        ].sort(
          (a, b) =>
            DAY_CODES.indexOf(
              a
            ) -
            DAY_CODES.indexOf(
              b
            )
        );
      }

      renderDayPills();

      refreshTrainerScheduleUI();
      saveActiveTabToWorkingDraft();
      updateScheduleDurationUI();
      updateActionButtonsState();
    }

    function resetForm() {
      editingTemplateId =
        null;

      formState =
        createEmptyTemplateForm();

      applyFormToInputs();
    }

    function loadDraftForSelectedCourse() {
      const course =
        selectedCourse();

      if (!course) {
        resetForm();

        return;
      }

      const draft =
        getDraftForCourse(
          course.id
        );

      if (draft) {
        loadTemplateIntoForm(
          draft
        );
      } else {
        resetForm();
      }
    }

    function loadTemplateIntoForm(
      template
    ) {
      editingTemplateId =
        template.id;

      formState = {
        id: template.id,

        scheduleType:
          template.scheduleType,

        days: [
          ...template.days,
        ],

        timeFrom:
          template.timeFrom,

        timeTo:
          template.timeTo,

        availableFrom:
          template.availableFrom ||
          "",

        availableUntil:
          template.availableUntil ||
          "",

        trainerId:
          template.trainerId ||
          "",

        trainerName:
          template.trainerName ||
          "",

        academicYear:
          template.academicYear ||
          "AY 2026–2027",

        term:
          template.term ||
          "1st Semester",

        name:
          template.name ||
          "Batch 1",

        batchKind:
          template.batchKind ||
          "training",
      };

      applyFormToInputs();
    }

    function validateForm() {
      readFormFromInputs();

      let ok = true;

      if (
        !formState.days.length
      ) {
        if (daysErrorEl) {
          daysErrorEl.textContent =
            "Select at least one day.";

          daysErrorEl.classList.remove(
            "d-none"
          );
        }

        ok = false;
      }

      if (
        !formState.timeFrom ||
        !formState.timeTo
      ) {
        ok = false;
      } else if (
        formState.timeFrom >=
        formState.timeTo
      ) {
        alert(
          "End time must be after start time."
        );

        ok = false;
      }

      if (
        formState.availableFrom &&
        formState.availableUntil &&
        formState.availableUntil <
          formState.availableFrom
      ) {
        alert(
          "Available until must be on or after available from."
        );

        ok = false;
      }

      if (
        !formState.trainerId
      ) {
        alert(
          "Please select a qualified trainer for this schedule."
        );

        ok = false;
      } else {
        const course =
          selectedCourse();

        const trainer =
          qualifiedTrainersForCourse(
            course
          ).find(
            (t) =>
              t.id ===
              formState.trainerId
          );

        const excludeId =
          isPersistedTemplateId(
            editingTemplateId
          )
            ? editingTemplateId
            : null;

        const conflict =
          trainer
            ? findTrainerScheduleConflict(
                trainer,
                excludeId,
                null,
                course.id
              )
            : null;

        if (conflict) {
          alert(
            `Schedule conflict: ${trainer.name} is already assigned to ${formatBatchConflictLabel(
              conflict
            )} on overlapping days, times, or dates.`
          );

          refreshTrainerScheduleUI();

          ok = false;
        }
      }

      return ok;
    }

    function updateActionButtonsState() {
      readFormFromInputs();
      updateScheduleDurationUI();

      const course = selectedCourse();
      const hintEl = document.getElementById(
        "schedule-buttons-requirements-hint"
      );
      const hintTextEl = document.getElementById(
        "schedule-buttons-requirements-text"
      );

      const saveBtn = document.getElementById("schedule-template-save");
      const saveAllBtn = document.getElementById("schedule-template-save-all");

      if (!course) {
        if (hintEl) {
          hintEl.classList.add("d-none");
        }
        if (saveBtn) saveBtn.disabled = true;
        if (saveAllBtn) saveAllBtn.disabled = true;
        return;
      }

      // Check Active Tab requirements
      const activeCheck = checkCourseRequirements(course.id);
      const activeOk = activeCheck.ok;

      if (saveBtn) {
        saveBtn.disabled = !activeOk;
        saveBtn.title = activeOk
          ? `Save schedule for ${course.name}`
          : `Complete required fields (${activeCheck.missing.join(", ")}) to save`;
      }

      // Check ALL selected tabs
      const targetCourses = Array.from(selectedCourseIds)
        .map((id) => getCourse(id))
        .filter(Boolean);

      const multiCount = targetCourses.length;
      let allSchedulesOk = multiCount >= 2;
      const incompleteCourseSummaries = [];

      if (multiCount >= 2) {
        for (const c of targetCourses) {
          const check = checkCourseRequirements(c.id);
          if (!check.ok) {
            allSchedulesOk = false;
            incompleteCourseSummaries.push(`"${c.name}" (needs ${check.missing.join(", ")})`);
          }
        }
      } else {
        allSchedulesOk = false;
      }

      if (saveAllBtn) {
        saveAllBtn.disabled = !allSchedulesOk;
        saveAllBtn.title = allSchedulesOk
          ? `Save schedules for all ${multiCount} selected programs`
          : `All selected tabs must have complete schedules before saving all`;
      }

      // Guidance Hint
      if (hintEl && hintTextEl) {
        hintEl.classList.remove("d-none");

        if (multiCount >= 2 && !allSchedulesOk) {
          hintEl.className = "small text-muted text-end w-100 mt-2";
          hintTextEl.innerHTML = `<span class="text-danger fw-semibold"><i class="bi bi-exclamation-circle me-1"></i>Cannot save for all (${multiCount}):</span> Incomplete tab(s): ${incompleteCourseSummaries.join("; ")}. Click each tab above to set its separate schedule.`;
        } else if (!activeOk) {
          hintEl.className = "small text-muted text-end w-100 mt-2";
          hintTextEl.innerHTML = `<span class="text-danger fw-semibold"><i class="bi bi-exclamation-circle me-1"></i>Current tab requirements missing:</span> Please complete <strong>${activeCheck.missing.join(
            ", "
          )}</strong>.`;
        } else {
          hintEl.className = "small text-success text-end w-100 mt-2";
          hintTextEl.innerHTML = `<i class="bi bi-check-circle me-1"></i>All schedule requirements met. Ready to save schedule.`;
        }
      }

      renderProgramTabs();
    }

    document.getElementById("btn-auto-calc-end-date")?.addEventListener("click", () => {
      const course = selectedCourse();
      if (!course) return;
      const nominalDays = courseDurationDays(course) || 24;

      if (!formState.availableFrom && availableFromEl?.value) {
        formState.availableFrom = availableFromEl.value;
      }

      if (!formState.availableFrom) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        formState.availableFrom = `${yyyy}-${mm}-${dd}`;
        if (availableFromEl) availableFromEl.value = formState.availableFrom;
      }

      const calculatedEnd = computeEndDateForNominalDays(
        formState.availableFrom,
        nominalDays,
        formState.days
      );

      if (calculatedEnd) {
        formState.availableUntil = calculatedEnd;
        if (availableUntilEl) {
          availableUntilEl.value = calculatedEnd;
        }
        saveActiveTabToWorkingDraft();
        refreshTrainerScheduleUI();
        updateScheduleDurationUI();
        updateActionButtonsState();
      }
    });

    /*
     * ==================================================
     * CATEGORY TABS
     * ==================================================
     */

    function renderCategoryTabs() {
      if (!categoryTabsEl) {
        return;
      }

      categoryTabsEl.innerHTML =
        BATCH_CATEGORY_TABS.map(
          (tab) => {
            const count =
              coursesInCategory(
                tab.key
              ).length;

            const active =
              activeCategoryTab ===
              tab.key
                ? " is-active"
                : "";

            return `
              <button
                type="button"
                class="registrar-batch-tab${active}"
                role="tab"
                aria-selected="${
                  activeCategoryTab ===
                  tab.key
                }"
                data-category-tab="${tab.key}"
              >
                ${escapeHtml(
                  tab.label
                )}

                <span class="registrar-batch-tab__count">
                  ${count}
                </span>
              </button>
            `;
          }
        ).join("");
    }

    function setActiveCategoryTab(
      category
    ) {
      if (
        !BATCH_CATEGORY_TABS.some(
          (t) =>
            t.key === category
        )
      ) {
        return;
      }

      activeCategoryTab =
        category;

      if (selectedCourseId) {
        const selected =
          getCourse(
            selectedCourseId
          );

        if (
          selected &&
          batchingCourseCategory(
            selected
          ) !== category
        ) {
          hideDetail();
        }
      }

      renderCategoryTabs();

      renderCourseCards();
    }

    /*
     * ==================================================
     * COURSE CARD RENDERING
     * ==================================================
     */

    function renderCourseCards() {
      renderCategoryTabs();

      const visibleCourses =
        coursesInCategory(
          activeCategoryTab
        );

      if (coursesEmptyEl) {
        coursesEmptyEl.classList.toggle(
          "d-none",
          visibleCourses.length > 0
        );
      }

      coursesEl.classList.toggle(
        "d-none",
        visibleCourses.length === 0
      );

      coursesEl.innerHTML =
        visibleCourses
          .map((course) => {
            const count =
              activeBatchStudentCount(
                course
              );

            const pct = Math.min(
              100,
              (count /
                BATCH_CAPACITY) *
                100
            );

            const status =
              courseStatus(
                course
              );

            const needed =
              studentsNeeded(
                course
              );

            const batchCount =
              course.batches.length;

            const days =
              courseDurationDays(
                course
              );

            const hasDraft =
              Boolean(
                getDraftForCourse(
                  course.id
                )
              );

            const pendingForCourse =
              pendingEnrollments.filter(
                (item) =>
                  pendingMatchesCourse(
                    item,
                    course
                  )
              );

            const locked =
              count <
              MIN_STUDENTS_TO_FINALIZE;

            // Only becomes open when at least 3 students are enrolled!
            const canOpen = !locked;

            const qualifiedTrainers =
              qualifiedTrainersForCourse(course);

            const trainerBadge =
              qualifiedTrainers.length === 0
                ? `
                  <div class="small text-danger fw-semibold">
                    <i class="bi bi-person-x-fill me-1" aria-hidden="true"></i>No trainer assigned
                  </div>
                `
                : `
                  <div class="small text-muted">
                    <i class="bi bi-person-check-fill me-1 text-success" aria-hidden="true"></i>${qualifiedTrainers.length} trainer${qualifiedTrainers.length === 1 ? '' : 's'} qualified
                  </div>
                `;

            const alert =
              needed > 0
                ? `
                  <div class="registrar-batch-card__alert">
                    <i
                      class="bi bi-lock-fill me-1"
                      aria-hidden="true">
                    </i>

                    Need ${needed} more unassigned student${
                      needed === 1
                        ? ""
                        : "s"
                    }
                    before this course can be opened for scheduling.
                  </div>
                `
                : "";

            const barClass =
              count >=
              MIN_STUDENTS_TO_FINALIZE
                ? "registrar-batch-card__bar-fill--ready"
                : "";

            const lockedClass =
              canOpen
                ? ""
                : " is-locked";

            const titleAttr =
              canOpen
                ? ""
                : ` title="At least ${MIN_STUDENTS_TO_FINALIZE} unassigned students are required before opening this course."`;

            const selected =
              selectedCourseIds.has(
                String(course.id)
              );

            return `
              <div class="col-md-6 col-lg-4">
                <div
                  class="registrar-batch-card-wrapper"
                  data-course-id="${escapeHtml(
                    course.id
                  )}"
                >

                  <!-- Individual course selection checkbox -->

                  <div class="registrar-batch-card__select">
                    <input
                      type="checkbox"
                      class="form-check-input batching-course-select"
                      data-course-id="${escapeHtml(
                        course.id
                      )}"
                      aria-label="Select ${escapeHtml(
                        course.name
                      )}"
                      ${
                        selected
                          ? "checked"
                          : ""
                      }
                      ${
                        canOpen
                          ? ""
                          : "disabled"
                      }
                    />
                  </div>

                  <!-- Clickable course card -->

                  <button
                    type="button"
                    class="registrar-batch-card w-100 text-start${lockedClass}${
                      selected
                        ? " is-course-selected"
                        : ""
                    }"
                    data-course-id="${escapeHtml(
                      course.id
                    )}"
                    aria-label="Open ${escapeHtml(
                      course.name
                    )} scheduling"
                    ${
                      canOpen
                        ? ""
                        : " disabled"
                    }
                    ${titleAttr}
                  >

                    <p class="registrar-batch-card__meta mb-1">
                      ${batchCount}
                      Batch${
                        batchCount === 1
                          ? ""
                          : "es"
                      }

                      ·

                      ${days}
                      day${
                        days === 1
                          ? ""
                          : "s"
                      }

                      ·

                      ${
                        hasDraft
                          ? "Schedule saved"
                          : "No schedule yet"
                      }
                    </p>

                    <h3 class="registrar-batch-card__title">
                      ${escapeHtml(
                        course.name
                      )}
                    </h3>

                    <p class="registrar-batch-card__count mb-2">
                      <i
                        class="bi bi-people me-1"
                        aria-hidden="true">
                      </i>

                      Available for batch:

                      <strong>
                        ${count} /
                        ${BATCH_CAPACITY}
                      </strong>
                    </p>

                    <div
                      class="registrar-batch-card__bar"
                      aria-hidden="true"
                    >
                      <span
                        class="registrar-batch-card__bar-fill ${barClass}"
                        style="width:${pct}%"
                      >
                      </span>
                    </div>

                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-1 mb-1">
                      <span
                        class="badge registrar-batch-card__status ${status.class}"
                      >
                        ${escapeHtml(
                          status.label
                        )}
                      </span>
                      ${trainerBadge}
                    </div>

                    ${alert}

                  </button>

                </div>
              </div>
            `;
          })
          .join("");

      /*
       * Synchronize Select All
       * after rendering cards.
       */

      updateCourseSelectionUI();

      updateCourseCardSelectionUI();
    }

    /*
     * ==================================================
     * DETAIL & TAB SWITCHING
     * ==================================================
     */

    function switchActiveProgramTab(targetCourseId) {
      if (!targetCourseId) return;
      const targetIdStr = String(targetCourseId);

      // Save previous tab's inputs to working drafts before switching
      if (selectedCourseId) {
        saveActiveTabToWorkingDraft();
      }

      const course = getCourse(targetIdStr);
      if (!course) {
        return;
      }

      selectedCourseId = targetIdStr;
      selectedCourseIds.add(targetIdStr);

      placeholderEl?.classList.add("d-none");
      detailEl?.classList.remove("d-none");

      if (detailTitleEl) {
        detailTitleEl.textContent = course.name;
      }

      const isNational =
        batchingCourseCategory(course) === "national";

      const count =
        activeBatchStudentCount(course);

      const scheduleLocked =
        count < MIN_STUDENTS_TO_FINALIZE;

      if (templateForm) {
        templateForm.classList.toggle(
          "pe-none",
          scheduleLocked
        );
        templateForm.classList.toggle(
          "opacity-50",
          scheduleLocked
        );
      }

      if (scheduleLocked && detailSubtitleEl) {
        detailSubtitleEl.textContent = isNational
          ? `At least ${MIN_STUDENTS_TO_FINALIZE} enrolled students are needed to schedule national assessment (currently ${count}).`
          : `At least ${MIN_STUDENTS_TO_FINALIZE} enrolled students are needed to schedule this batch (currently ${count}).`;
      } else if (detailSubtitleEl) {
        detailSubtitleEl.textContent = isNational
          ? `${count} enrolled student(s) available. Configure national assessment schedule below.`
          : `${count} enrolled student(s) ready. Configure the class schedule below and save to review in Finalized Batches.`;
      }

      // Load target course into form inputs FIRST
      loadCourseIntoForm(targetIdStr);

      renderProgramTabs();
      renderEnrolledStudentsRoster();
      renderEnrollmentApproval();
      renderCourseCards();
      updateCourseSelectionUI();
      updateCourseCardSelectionUI();
      updateScheduleDurationUI();
      updateActionButtonsState();
    }

    function showDetail(courseId) {
      switchActiveProgramTab(courseId);
    }

    function hideDetail() {
      selectedCourseId =
        null;

      editingTemplateId =
        null;

      clearPendingSelection();

      selectedCourseIds.clear();

      detailEl?.classList.add(
        "d-none"
      );

      placeholderEl?.classList.remove(
        "d-none"
      );

      durationBadgeEl?.classList.add(
        "d-none"
      );

      approvalSectionEl?.classList.add(
        "d-none"
      );

      programTabsContainer?.classList.add(
        "d-none"
      );

      updateCourseSelectionUI();

      updateCourseCardSelectionUI();

      renderCourseCards();
    }

    /*
     * ==================================================
     * CATEGORY TAB EVENTS
     * ==================================================
     */

    categoryTabsEl?.addEventListener(
      "click",
      (e) => {
        const tab =
          e.target.closest(
            "[data-category-tab]"
          );

        if (!tab) {
          return;
        }

        setActiveCategoryTab(
          tab.dataset.categoryTab
        );
      }
    );

    /*
     * ==================================================
     * COURSE CARD SELECT ALL
     * ==================================================
     */

    courseSelectAllEl?.addEventListener(
      "change",
      () => {
        toggleAllVisibleCourses(
          courseSelectAllEl.checked
        );
      }
    );

    /*
     * ==================================================
     * COURSE CARD EVENTS
     * ==================================================
     */

    coursesEl.addEventListener(
      "click",
      (e) => {
        /*
         * If checkbox was clicked,
         * do not open scheduling.
         */

        const checkbox =
          e.target.closest(
            ".batching-course-select"
          );

        if (checkbox) {
          e.stopPropagation();

          return;
        }

        /*
         * Find clickable course card.
         */

        const card =
          e.target.closest(
            "button[data-course-id]"
          );

        if (!card) {
          return;
        }

        if (card.disabled) {
          return;
        }

        const courseId = String(card.dataset.courseId);
        if (selectedCourseIds.has(courseId)) {
          // Already selected: clicking it again unselects it
          toggleCourseSelection(courseId, false);
        } else {
          // Not selected: select and open it
          toggleCourseSelection(courseId, true);
        }
      }
    );

    /*
     * Individual course
     * checkbox change.
     */

    coursesEl.addEventListener(
      "change",
      (e) => {
        const checkbox =
          e.target.closest(
            ".batching-course-select"
          );

        if (!checkbox) {
          return;
        }

        toggleCourseSelection(
          checkbox.dataset
            .courseId,

          checkbox.checked
        );
      }
    );

    /*
     * Selected program tabs click.
     * Switches between selected programs.
     */
    programTabsEl?.addEventListener(
      "click",
      (e) => {
        const tabBtn =
          e.target.closest(
            "button[data-program-tab-id]"
          );

        if (!tabBtn) {
          return;
        }

        const targetCourseId =
          tabBtn.dataset.programTabId;

        if (
          !targetCourseId ||
          targetCourseId === String(selectedCourseId)
        ) {
          return;
        }

        switchActiveProgramTab(targetCourseId);
      }
    );

    /*
     * ==================================================
     * DETAIL EVENTS
     * ==================================================
     */

    closeBtn?.addEventListener(
      "click",
      hideDetail
    );

    cancelBtn?.addEventListener(
      "click",
      loadDraftForSelectedCourse
    );

    /*
     * ==================================================
     * STUDENT SELECT ALL
     * ==================================================
     */

    selectAllEl?.addEventListener(
      "change",
      () => {
        const approvable =
          approvablePendingForSelectedCourse();

        if (selectAllEl.checked) {
          approvable.forEach(
            (item) =>
              selectedPendingKeys.add(
                pendingItemKey(
                  item
                )
              )
          );
        } else {
          approvable.forEach(
            (item) =>
              selectedPendingKeys.delete(
                pendingItemKey(
                  item
                )
              )
          );
        }

        pendingStudentsEl
          ?.querySelectorAll(
            ".batching-pending-check:not(:disabled)"
          )
          .forEach(
            (input) => {
              input.checked =
                selectAllEl.checked;
            }
          );

        updateBulkApproveUI();
      }
    );

    pendingStudentsEl?.addEventListener(
      "change",
      (e) => {
        const input =
          e.target.closest(
            ".batching-pending-check"
          );

        if (
          !input ||
          input.disabled
        ) {
          return;
        }

        const key =
          input.dataset.key;

        if (!key) {
          return;
        }

        if (input.checked) {
          selectedPendingKeys.add(
            key
          );
        } else {
          selectedPendingKeys.delete(
            key
          );
        }

        updateBulkApproveUI();
      }
    );

    bulkApproveBtn?.addEventListener(
      "click",
      () => {
        bulkApproveSelected();
      }
    );

    /*
     * ==================================================
     * SCHEDULE TYPE EVENTS
     * ==================================================
     */

    typePillsEl?.addEventListener(
      "click",
      (e) => {
        const btn =
          e.target.closest(
            "[data-schedule-type]"
          );

        if (!btn) {
          return;
        }

        setScheduleType(
          btn.dataset
            .scheduleType
        );
      }
    );

    dayPillsEl?.addEventListener(
      "click",
      (e) => {
        const btn =
          e.target.closest(
            "[data-day]"
          );

        if (
          !btn ||
          btn.disabled
        ) {
          return;
        }

        toggleDay(
          btn.dataset.day
        );
      }
    );

    const onScheduleFieldInput = () => {
      formState.timeFrom = timeFromEl?.value || "";
      formState.timeTo = timeToEl?.value || "";
      formState.availableFrom = availableFromEl?.value || "";
      formState.availableUntil = availableUntilEl?.value || "";

      updateDailyHoursField();
      refreshTrainerScheduleUI();
      saveActiveTabToWorkingDraft();
      updateScheduleDurationUI();
      updateActionButtonsState();
    };

    timeFromEl?.addEventListener("input", onScheduleFieldInput);
    timeFromEl?.addEventListener("change", onScheduleFieldInput);

    timeToEl?.addEventListener("input", onScheduleFieldInput);
    timeToEl?.addEventListener("change", onScheduleFieldInput);

    availableFromEl?.addEventListener("input", onScheduleFieldInput);
    availableFromEl?.addEventListener("change", onScheduleFieldInput);

    availableUntilEl?.addEventListener("input", onScheduleFieldInput);
    availableUntilEl?.addEventListener("change", onScheduleFieldInput);

    trainerEl?.addEventListener(
      "change",
      () => {
        formState.trainerId =
          trainerEl.value || "";

        const selected =
          qualifiedTrainersForCourse(
            selectedCourse()
          ).find(
            (t) =>
              t.id ===
              formState.trainerId
          );

        formState.trainerName =
          selected?.name || "";

        saveActiveTabToWorkingDraft();
        updateScheduleConflictNotice();
        updateActionButtonsState();
      }
    );

    /*
     * ==================================================
     * SAVE SCHEDULE
     * ==================================================
     */

    function buildTemplateData(course, customState = null) {
      const state = customState || formState;
      const qualified =
        qualifiedTrainersForCourse(course);
      let trainerId =
        state.trainerId;
      let trainerName =
        state.trainerName;

      const isTrainerQualified =
        qualified.some(
          (t) => t.id === trainerId
        );
      if (
        !isTrainerQualified &&
        qualified.length > 0
      ) {
        trainerId = qualified[0].id;
        trainerName = qualified[0].name;
      }

      const template = {
        scheduleType:
          state.scheduleType,

        days: [
          ...(state.days || []),
        ],

        timeFrom:
          state.timeFrom,

        timeTo:
          state.timeTo,

        dailyHours:
          computeDailyHours(
            state.timeFrom,
            state.timeTo
          ),

        availableFrom:
          state.availableFrom,

        availableUntil:
          state.availableUntil,

        trainerId:
          trainerId,

        trainerName:
          trainerName,

        courseId:
          course.id,

        courseName:
          course.name,

        batchKind:
          course.batchKind ||
          "training",

        academicYear:
          state.academicYear ||
          "AY 2026–2027",

        term:
          state.term ||
          "1st Semester",

        name:
          state.name ||
          "Batch 1",

        batchLabel:
          `${state.academicYear || "AY 2026–2027"} · ${state.name || "Batch 1"}`,

        createdAt:
          new Date().toISOString(),
      };

      const draft =
        getDraftForCourse(
          course.id
        );

      const stateEditId =
        state.editingTemplateId ??
        (String(course.id) === String(selectedCourseId)
          ? editingTemplateId
          : null);

      if (isPersistedTemplateId(stateEditId)) {
        template.id = stateEditId;
      } else if (
        draft &&
        isPersistedTemplateId(
          draft.id
        )
      ) {
        template.id =
          draft.id;
      }

      return template;
    }

    async function activateBatchTemplate(
      templateId
    ) {
      const res = await fetch(
        `/registrar/api/batching/template/finalize/${encodeURIComponent(
          templateId
        )}/`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            "X-CSRFToken":
              getCsrfToken(),
          },
        }
      );

      if (!res.ok) {
        const body =
          await res.json().catch(() => ({}));

        throw new Error(
          body.error ||
            "Could not finalize batch."
        );
      }

      const data =
        await res.json();

      return data.batch;
    }

    templateForm?.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();

        const course =
          selectedCourse();

        if (
          !course ||
          !validateForm()
        ) {
          return;
        }

        const template =
          buildTemplateData(course);

        try {
          const saved =
            await upsertTemplateForCourse(
              course.id,
              template
            );

          const list =
            getTemplatesForCourse(
              course.id
            );

          const replaceId =
            template.id ||
            saved.id;

          const idx =
            list.findIndex(
              (t) =>
                t.id ===
                  replaceId ||
                t.id === saved.id
            );

          if (idx >= 0) {
            list[idx] =
              saved;
          } else {
            list.unshift(
              saved
            );
          }

          setTemplatesForCourse(
            course.id,
            list
          );

          loadTemplateIntoForm(
            saved
          );

          refreshTrainerScheduleUI();

          renderCourseCards();

          renderProgramTabs();

          showScheduleSavedConfirm(
            {
              courseName:
                course.name,
            }
          );
        } catch (err) {
          window.alert(
            err.message ||
              "Could not save schedule."
          );
        }
      }
    );

    /*
     * Save schedule for all selected programs at once.
     */
    document.getElementById(
      "schedule-template-save-all"
    )?.addEventListener(
      "click",
      async () => {
        saveActiveTabToWorkingDraft();

        const targetCourses =
          Array.from(selectedCourseIds)
            .map((id) => getCourse(id))
            .filter(Boolean);

        if (!targetCourses.length) {
          return;
        }

        // Validate that each course's requirements are met
        for (const c of targetCourses) {
          const check = checkCourseRequirements(c.id);
          if (!check.ok) {
            window.alert(
              `Cannot save for all: "${c.name}" schedule is incomplete (missing ${check.missing.join(", ")}). Click its tab to set its schedule.`
            );
            return;
          }
        }

        const saveAllBtn =
          document.getElementById(
            "schedule-template-save-all"
          );

        if (saveAllBtn) {
          saveAllBtn.disabled = true;
        }

        try {
          const savedNames = [];

          for (const c of targetCourses) {
            const req = checkCourseRequirements(c.id);
            const tpl =
              buildTemplateData(c, req.state);

            const saved =
              await upsertTemplateForCourse(
                c.id,
                tpl
              );

            const list =
              getTemplatesForCourse(c.id);

            const replaceId =
              tpl.id || saved.id;

            const idx =
              list.findIndex(
                (t) =>
                  t.id === replaceId ||
                  t.id === saved.id
              );

            if (idx >= 0) {
              list[idx] = saved;
            } else {
              list.unshift(saved);
            }

            setTemplatesForCourse(
              c.id,
              list
            );

            workingDraftsByCourse.set(String(c.id), {
              ...saved,
              days: [...saved.days],
              editingTemplateId: saved.id,
              modifiedByUser: true,
            });

            savedNames.push(c.name);
          }

          const activeCourse =
            selectedCourse();

          if (activeCourse) {
            loadCourseIntoForm(activeCourse.id);
          }

          refreshTrainerScheduleUI();

          renderCourseCards();

          renderProgramTabs();

          showScheduleSavedConfirm({
            courseName: `${targetCourses.length} selected programs (${savedNames.join(", ")})`,
          });
        } catch (err) {
          window.alert(
            err.message ||
              "Could not save schedules for selected programs."
          );
        } finally {
          updateActionButtonsState();
        }
      }
    );

    /*
     * ==================================================
     * INITIALIZATION
     * ==================================================
     */

    renderDayPills();

    updateTypePills();

    updateDailyHoursField();

    const urlParams =
      new URLSearchParams(
        window.location.search
      );

    const courseParam =
      urlParams.get("course");

    let categoryParam =
      urlParams.get("category");

    if (
      categoryParam ===
      "assessment"
    ) {
      categoryParam =
        "national";
    }

    if (
      categoryParam &&
      BATCH_CATEGORY_TABS.some(
        (t) =>
          t.key ===
          categoryParam
      )
    ) {
      activeCategoryTab =
        categoryParam;
    } else if (courseParam) {
      const courseForTab =
        getCourse(
          courseParam
        );

      if (courseForTab) {
        activeCategoryTab =
          batchingCourseCategory(
            courseForTab
          );
      }
    }

    renderCourseCards();

    const templateParam =
      urlParams.get(
        "template"
      );

    if (
      courseParam &&
      getCourse(courseParam)
    ) {
      showDetail(
        courseParam,
        {
          loadDraft:
            !templateParam,
        }
      );

      if (templateParam) {
        const tpl =
          getTemplatesForCourse(
            courseParam
          ).find(
            (t) =>
              t.id ===
              templateParam
          );

        if (
          tpl?.status === "finalized" ||
          tpl?.status === "active"
        ) {
          window.alert(
            "This batch is finalized. View it on Finalized Batches."
          );

          loadDraftForSelectedCourse();
        } else if (tpl) {
          loadTemplateIntoForm(
            tpl
          );
        } else {
          loadDraftForSelectedCourse();
        }
      }
    }

    // -------------------------------------------------------------
    // MANUAL STUDENT OVERRIDE MODAL (BATCHING & SCHEDULING)
    // -------------------------------------------------------------
    const overrideModalEl = document.getElementById("batching-override-modal");
    const overrideModal =
      overrideModalEl && window.bootstrap
        ? bootstrap.Modal.getOrCreateInstance(overrideModalEl)
        : null;

    const overrideSearchEl = document.getElementById("batching-override-search");
    const overrideListEl = document.getElementById("batching-override-students-list");
    let overrideCandidates = [];

    async function loadOverrideCandidates(q = "") {
      if (!overrideListEl) return;
      overrideListEl.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-3"><i class="bi bi-hourglass-split me-1"></i>Searching students...</td></tr>';
      try {
        const course = selectedCourse();
        const res = await fetch(
          `/registrar/api/batching/override-candidates/?q=${encodeURIComponent(
            q
          )}&course=${encodeURIComponent(course?.name || "")}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load candidates.");
        overrideCandidates = data.students || [];
        renderOverrideCandidates();
      } catch (err) {
        overrideListEl.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">${escapeHtml(
          err.message
        )}</td></tr>`;
      }
    }

    function renderOverrideCandidates() {
      if (!overrideListEl) return;
      if (!overrideCandidates.length) {
        overrideListEl.innerHTML =
          '<tr><td colspan="5" class="text-center text-muted py-3">No matching students found.</td></tr>';
        return;
      }

      overrideListEl.innerHTML = overrideCandidates
        .map(
          (s) => `
        <tr>
          <td class="fw-bold">${escapeHtml(s.fullName)}</td>
          <td><code class="text-muted">${escapeHtml(s.studentId || "—")}</code></td>
          <td><span class="badge text-bg-light border">${escapeHtml(s.program || "—")}</span></td>
          <td>
            ${
              s.currentBatch
                ? `<span class="badge text-bg-info text-dark">${escapeHtml(
                    s.currentBatch
                  )}</span>`
                : '<span class="badge text-bg-secondary">Unassigned</span>'
            }
          </td>
          <td class="text-end">
            <button type="button" class="btn btn-primary btn-sm px-2 override-insert-btn"
              data-regid="${escapeHtml(s.registrationId || "")}"
              data-profid="${escapeHtml(s.profileId || "")}"
              data-first="${escapeHtml(s.firstName)}"
              data-last="${escapeHtml(s.lastName)}"
              data-prog="${escapeHtml(s.program)}"
              data-progtype="${escapeHtml(s.programType || "training")}">
              <i class="bi bi-plus-circle me-1"></i>Insert into Batch
            </button>
          </td>
        </tr>`
        )
        .join("");
    }

    document
      .getElementById("batching-override-student-btn")
      ?.addEventListener("click", () => {
        if (!selectedCourseId) {
          alert("Please select a course card first.");
          return;
        }
        if (overrideSearchEl) overrideSearchEl.value = "";
        loadOverrideCandidates("");
        overrideModal?.show();
      });

    overrideSearchEl?.addEventListener("input", (e) => {
      loadOverrideCandidates(e.target.value);
    });

    overrideListEl?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".override-insert-btn");
      if (!btn) return;
      btn.disabled = true;

      const student = {
        firstName: btn.dataset.first,
        lastName: btn.dataset.last,
        registrationId: btn.dataset.regid,
        profileId: btn.dataset.profid,
        program: btn.dataset.prog,
        programType: btn.dataset.progtype,
      };

      const course = selectedCourse();
      const draft = course ? getDraftForCourse(course.id) : null;

      if (draft && isPersistedTemplateId(draft.id)) {
        try {
          const res = await fetch("/registrar/api/batching/override-insert/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": getCsrfToken(),
            },
            body: JSON.stringify({
              templateId: draft.id,
              student: student,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed to insert student.");

          overrideModal?.hide();
          alert(data.message || "Student inserted into batch successfully.");
          window.location.reload();
        } catch (err) {
          alert(err.message || "Override insertion failed.");
          btn.disabled = false;
        }
      } else {
        alert("Please save this schedule template first by clicking 'Save schedule', then you can insert override students.");
        btn.disabled = false;
      }
    });

    enrolledSearchEl?.addEventListener("input", () => {
      renderEnrolledStudentsRoster();
    });
  }
);