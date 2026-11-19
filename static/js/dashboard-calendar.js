/**
 * Dashboard Calendar Interactive Module
 * Renders role-scoped dynamic academic, class, and assessment events.
 * - Admin & Registrar: Can see all institutional batches, with live qualification & event-type filters.
 * - Trainer: Scoped to their assigned batches/classes and academic events.
 * - Student: Scoped to their enrolled batch/class schedule and academic events.
 */

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("vtiac-dashboard-calendar");
  if (!container) return;

  const role = container.dataset.role || "admin";
  const prevBtn = document.getElementById("cal-prev-btn");
  const nextBtn = document.getElementById("cal-next-btn");
  const todayBtn = document.getElementById("cal-today-btn");
  const monthYearLabel = document.getElementById("cal-month-year-label");
  const daysBody = document.getElementById("vtiac-calendar-days-body");
  const agendaList = document.getElementById("vtiac-agenda-list");
  const agendaTitle = document.getElementById("vtiac-agenda-title");
  const agendaCount = document.getElementById("vtiac-agenda-count");

  // Filter toolbar elements
  const scopeBadge = document.getElementById("cal-scope-badge");
  const filterProgram = document.getElementById("cal-filter-program");
  const filterType = document.getElementById("cal-filter-type");
  const filterResetBtn = document.getElementById("cal-filter-reset-btn");

  const eventModalEl = document.getElementById("vtiacEventModal");
  let eventModal = null;
  if (eventModalEl && window.bootstrap && window.bootstrap.Modal) {
    eventModal = window.bootstrap.Modal.getOrCreateInstance(eventModalEl);
  }

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 9 = Oct)
  let allEvents = [];
  let availablePrograms = [];
  let selectedDateStr = null;
  let selectedProgram = "all";
  let selectedType = "all";

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchEvents() {
    try {
      const res = await fetch(`/api/calendar/events/?role=${encodeURIComponent(role)}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      if (data.ok && Array.isArray(data.events)) {
        allEvents = data.events;
        availablePrograms = Array.isArray(data.programs) ? data.programs : [];
        updateScopeBadge(data);
        populateProgramFilter(availablePrograms, data);
      }
    } catch (err) {
      console.warn("Calendar events fetch error:", err);
      allEvents = [];
      if (scopeBadge) {
        scopeBadge.className = "badge rounded-pill px-3 py-2 small fw-semibold bg-danger-subtle text-danger border border-danger-subtle";
        scopeBadge.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>Unable to load events`;
      }
    }
    renderCalendar();
  }

  function updateScopeBadge(data) {
    if (!scopeBadge) return;
    const canSeeAll = Boolean(data.can_see_all);
    const effectiveRole = data.role || role;
    const userLabel = data.user_label || "";

    if (canSeeAll) {
      scopeBadge.className = "badge rounded-pill px-3 py-2 small fw-semibold bg-primary-subtle text-primary border border-primary-subtle";
      scopeBadge.innerHTML = `<i class="bi bi-shield-check me-1"></i>All Institutional Batches &amp; Events (${effectiveRole.toUpperCase()} VIEW)`;
    } else if (effectiveRole === "trainer") {
      scopeBadge.className = "badge rounded-pill px-3 py-2 small fw-semibold bg-success-subtle text-success border border-success-subtle";
      scopeBadge.innerHTML = `<i class="bi bi-person-badge me-1"></i>${escapeHtml(userLabel || "My Assigned Classes")}`;
    } else if (effectiveRole === "student") {
      scopeBadge.className = "badge rounded-pill px-3 py-2 small fw-semibold bg-info-subtle text-info border border-info-subtle";
      scopeBadge.innerHTML = `<i class="bi bi-mortarboard me-1"></i>${escapeHtml(userLabel || "My Enrolled Schedule")}`;
    } else if (effectiveRole === "candidate") {
      scopeBadge.className = "badge rounded-pill px-3 py-2 small fw-semibold bg-warning-subtle text-warning-emphasis border border-warning-subtle";
      scopeBadge.innerHTML = `<i class="bi bi-award me-1"></i>${escapeHtml(userLabel || "My Assessment Schedule")}`;
    } else {
      scopeBadge.className = "badge rounded-pill px-3 py-2 small fw-semibold bg-secondary-subtle text-secondary border";
      scopeBadge.innerHTML = `<i class="bi bi-calendar3 me-1"></i>${escapeHtml(userLabel || "Academic Calendar")}`;
    }
  }

  function populateProgramFilter(programs, data) {
    if (!filterProgram) return;

    filterProgram.innerHTML = "";

    if ((data.role === "student" || data.role === "candidate") && programs.length <= 1) {
      // For student or candidate with 1 program, show locked/informative program title
      const pName = programs[0] || (data.role === "candidate" ? "My Assessment Program" : "My Enrolled Program");
      const opt = document.createElement("option");
      opt.value = "all";
      opt.textContent = `Qualification: ${pName}`;
      filterProgram.appendChild(opt);
      filterProgram.disabled = true;
      return;
    }

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "all";
    defaultOpt.textContent = programs.length > 0
      ? `All Qualifications / Programs (${programs.length})`
      : "All Qualifications / Programs";
    filterProgram.appendChild(defaultOpt);

    programs.forEach((prog) => {
      const opt = document.createElement("option");
      opt.value = prog;
      opt.textContent = prog;
      filterProgram.appendChild(opt);
    });

    filterProgram.disabled = false;
  }

  function getBadgeClass(type) {
    switch (type) {
      case "class_start":
        return "badge-class-start";
      case "class_end":
        return "badge-class-end";
      case "exam":
        return "badge-exam";
      case "enrollment":
        return "badge-enrollment";
      default:
        return "badge-event";
    }
  }

  function getFilteredEvents() {
    return allEvents.filter((ev) => {
      // 1. Program filter
      if (selectedProgram !== "all") {
        if (ev.course_name !== selectedProgram && ev.course_name !== "Institutional") {
          return false;
        }
      }
      // 2. Type filter
      if (selectedType !== "all") {
        if (selectedType === "institutional") {
          if (ev.type !== "event" && ev.type !== "enrollment") {
            return false;
          }
        } else if (ev.type !== selectedType) {
          return false;
        }
      }
      return true;
    });
  }

  function checkResetButtonVisibility() {
    if (!filterResetBtn) return;
    const hasFilter = selectedProgram !== "all" || selectedType !== "all";
    filterResetBtn.classList.toggle("d-none", !hasFilter);
  }

  function renderCalendar() {
    if (monthYearLabel) {
      monthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }

    if (!daysBody) return;
    daysBody.innerHTML = "";

    const filtered = getFilteredEvents();

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    const todayDate = new Date();
    const isCurrentMonth = todayDate.getFullYear() === currentYear && todayDate.getMonth() === currentMonth;
    const todayDayNum = todayDate.getDate();

    let dayCount = 1;
    let nextMonthDayCount = 1;

    for (let row = 0; row < 6; row++) {
      const tr = document.createElement("tr");

      for (let col = 0; col < 7; col++) {
        const td = document.createElement("td");
        const cellIndex = row * 7 + col;

        if (cellIndex < firstDayIndex) {
          const prevDay = prevMonthDays - (firstDayIndex - col - 1);
          td.classList.add("other-month");
          td.innerHTML = `<span class="vtiac-day-num">${prevDay}</span>`;
        } else if (dayCount <= totalDaysInMonth) {
          const currentDayNum = dayCount;
          const monthStr = String(currentMonth + 1).padStart(2, "0");
          const dayStr = String(currentDayNum).padStart(2, "0");
          const formattedDate = `${currentYear}-${monthStr}-${dayStr}`;

          if (isCurrentMonth && currentDayNum === todayDayNum) {
            td.classList.add("is-today");
          }

          td.dataset.date = formattedDate;

          const dayHeader = document.createElement("div");
          dayHeader.className = "d-flex align-items-center justify-content-between";
          dayHeader.innerHTML = `<span class="vtiac-day-num">${currentDayNum}</span>`;
          td.appendChild(dayHeader);

          // Find events on this date from filtered events
          const dayEvents = filtered.filter((ev) => ev.date === formattedDate);

          if (dayEvents.length > 0) {
            const eventsWrap = document.createElement("div");
            eventsWrap.className = "vtiac-calendar-events-wrap";

            dayEvents.forEach((ev) => {
              const pill = document.createElement("div");
              pill.className = `vtiac-event-pill ${getBadgeClass(ev.type)}`;
              pill.textContent = ev.title;
              pill.title = `${ev.title} (${ev.time || ""})`;
              pill.addEventListener("click", (e) => {
                e.stopPropagation();
                openEventModal(ev);
              });
              eventsWrap.appendChild(pill);
            });

            td.appendChild(eventsWrap);
          }

          td.addEventListener("click", () => {
            selectedDateStr = formattedDate;
            renderAgendaList(formattedDate);
          });

          dayCount++;
        } else {
          td.classList.add("other-month");
          td.innerHTML = `<span class="vtiac-day-num">${nextMonthDayCount}</span>`;
          nextMonthDayCount++;
        }

        tr.appendChild(td);
      }

      daysBody.appendChild(tr);
      if (dayCount > totalDaysInMonth && nextMonthDayCount > 7) break;
    }

    renderAgendaList(selectedDateStr);
    checkResetButtonVisibility();
  }

  function renderAgendaList(filterDate = null) {
    if (!agendaList) return;
    agendaList.innerHTML = "";

    const filtered = getFilteredEvents();
    const monthStr = String(currentMonth + 1).padStart(2, "0");
    const currentMonthPrefix = `${currentYear}-${monthStr}`;

    let monthEvents = filtered.filter((ev) => ev.date.startsWith(currentMonthPrefix));

    if (filterDate) {
      const selectedDayEvents = monthEvents.filter((ev) => ev.date === filterDate);
      if (selectedDayEvents.length > 0) {
        monthEvents = selectedDayEvents;
        if (agendaTitle) agendaTitle.textContent = `Events for ${filterDate}`;
      } else {
        if (agendaTitle) agendaTitle.textContent = `Events (${monthNames[currentMonth]})`;
      }
    } else {
      if (agendaTitle) agendaTitle.textContent = `Events (${monthNames[currentMonth]})`;
    }

    if (agendaCount) agendaCount.textContent = String(monthEvents.length);

    if (monthEvents.length === 0) {
      agendaList.innerHTML = `<p class="text-muted small text-center my-4">No events scheduled for this period.</p>`;
      return;
    }

    monthEvents.forEach((ev) => {
      const item = document.createElement("div");
      item.className = `vtiac-agenda-item type-${ev.type}`;

      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-1">
          <span class="badge ${getBadgeClass(ev.type)}">${escapeHtml(ev.category || "Event")}</span>
          <span class="small text-secondary fw-semibold">${escapeHtml(ev.date)}</span>
        </div>
        <h6 class="fw-bold text-dark fs-6 mb-1">${escapeHtml(ev.title)}</h6>
        <p class="small text-secondary mb-0"><i class="bi bi-clock me-1"></i>${escapeHtml(ev.time || "All Day")}</p>
        ${ev.course_name && ev.course_name !== "Institutional" ? `<span class="badge bg-light text-secondary border mt-1 small" style="font-size: 0.72rem;">${escapeHtml(ev.course_name)}</span>` : ""}
      `;

      item.addEventListener("click", () => openEventModal(ev));
      agendaList.appendChild(item);
    });
  }

  function openEventModal(ev) {
    const headerEl = document.getElementById("vtiacEventModalHeader");
    const titleEl = document.getElementById("vtiacEventModalTitle");
    const categoryEl = document.getElementById("vtiacEventModalCategory");
    const dateTimeEl = document.getElementById("vtiacEventModalDateTime");
    const courseNameEl = document.getElementById("vtiacEventModalCourseName");
    const batchLabelEl = document.getElementById("vtiacEventModalBatchLabel");
    const trainerEl = document.getElementById("vtiacEventModalTrainer");
    const detailsEl = document.getElementById("vtiacEventModalDetails");
    const peopleRowEl = document.getElementById("vtiacEventModalPeopleRow");

    const studentsCardEl = document.getElementById("vtiacEventModalStudentsCard");
    const studentsCountEl = document.getElementById("vtiacEventModalStudentsCount");
    const studentsListEl = document.getElementById("vtiacEventModalStudentsList");

    if (titleEl) titleEl.textContent = ev.title;
    if (categoryEl) categoryEl.textContent = ev.category || "General Event";
    if (dateTimeEl) dateTimeEl.textContent = `${ev.date} • ${ev.time || "All Day"}`;
    if (courseNameEl) courseNameEl.textContent = ev.course_name || ev.title;
    if (batchLabelEl) batchLabelEl.textContent = ev.batch_label || "General";
    if (trainerEl) trainerEl.textContent = ev.trainer || "N/A";
    if (detailsEl) detailsEl.textContent = ev.details || "No additional description provided.";

    if (headerEl) {
      headerEl.className = "modal-header text-white p-4 ";
      if (ev.type === "exam") headerEl.classList.add("bg-danger");
      else if (ev.type === "class_end") headerEl.classList.add("bg-warning");
      else if (ev.type === "class_start") headerEl.classList.add("bg-success");
      else if (ev.type === "enrollment") headerEl.classList.add("bg-purple");
      else headerEl.classList.add("bg-primary");
    }

    if (peopleRowEl) {
      peopleRowEl.classList.toggle("d-none", !ev.trainer && !ev.examiner);
    }

    if (studentsCardEl && studentsListEl) {
      if (Array.isArray(ev.students) && ev.students.length > 0) {
        studentsCardEl.classList.remove("d-none");
        if (studentsCountEl) studentsCountEl.textContent = String(ev.students.length);
        studentsListEl.innerHTML = ev.students.map((s) => {
          const first = s.first_name || s.firstName || "";
          const last = s.last_name || s.lastName || "";
          const fullName = `${first} ${last}`.trim() || s.name || s.fullName || "Student";
          const ref = s.reference_id || s.referenceId || "ENROLLED";
          const phone = s.phone || s.phone_number || s.phoneNumber || "";
          return `
            <div class="list-group-item d-flex align-items-center justify-content-between py-2 px-3">
              <div class="d-flex align-items-center gap-2">
                <div class="rounded-circle bg-success-subtle text-success fw-bold d-flex align-items-center justify-content-center" style="width: 2rem; height: 2rem; font-size: 0.75rem;">
                  ${first[0] || ""}${last[0] || ""}
                </div>
                <div>
                  <h6 class="mb-0 fw-bold small text-dark">${escapeHtml(fullName)}</h6>
                  <span class="text-muted text-xs" style="font-size: 0.75rem;">Ref: ${escapeHtml(ref)} ${phone ? '• ' + escapeHtml(phone) : ''}</span>
                </div>
              </div>
              <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill text-xs">Approved</span>
            </div>
          `;
        }).join("");
      } else {
        studentsCardEl.classList.add("d-none");
        studentsListEl.innerHTML = "";
      }
    }

    if (eventModal) {
      eventModal.show();
    } else if (eventModalEl && window.bootstrap && window.bootstrap.Modal) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(eventModalEl);
      modal.show();
    }
  }

  // Filter change handlers
  filterProgram?.addEventListener("change", (e) => {
    selectedProgram = e.target.value;
    renderCalendar();
  });

  filterType?.addEventListener("change", (e) => {
    selectedType = e.target.value;
    renderCalendar();
  });

  filterResetBtn?.addEventListener("click", () => {
    selectedProgram = "all";
    selectedType = "all";
    if (filterProgram) filterProgram.value = "all";
    if (filterType) filterType.value = "all";
    renderCalendar();
  });

  // Calendar Navigation
  prevBtn?.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    selectedDateStr = null;
    renderCalendar();
  });

  nextBtn?.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    selectedDateStr = null;
    renderCalendar();
  });

  todayBtn?.addEventListener("click", () => {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    const monthStr = String(currentMonth + 1).padStart(2, "0");
    const dayStr = String(today.getDate()).padStart(2, "0");
    selectedDateStr = `${currentYear}-${monthStr}-${dayStr}`;
    renderCalendar();
  });

  fetchEvents();
});
