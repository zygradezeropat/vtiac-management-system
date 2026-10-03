/**
 * Dashboard Calendar Interactive Module
 * Renders dynamic academic, class, and assessment events for all roles.
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

  const eventModalEl = document.getElementById("vtiacEventModal");
  let eventModal = null;
  if (eventModalEl && window.bootstrap && window.bootstrap.Modal) {
    eventModal = window.bootstrap.Modal.getOrCreateInstance(eventModalEl);
  }

  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 9 = Oct)
  let allEvents = [];
  let selectedDateStr = null;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  async function fetchEvents() {
    try {
      const res = await fetch(`/api/calendar/events/?role=${role}`);
      if (!res.ok) throw new Error("Failed to fetch events");
      const data = await res.json();
      if (data.ok && Array.isArray(data.events)) {
        allEvents = data.events;
      }
    } catch (err) {
      console.warn("Calendar events fetch error:", err);
      allEvents = [];
    }
    renderCalendar();
  }

  function getBadgeClass(type) {
    switch (type) {
      case "class_start":
        return "badge-class-start";
      case "class_end":
        return "badge-class-end";
      case "exam":
        return "badge-exam";
      default:
        return "badge-event";
    }
  }

  function formatShortTime(timeStr) {
    if (!timeStr) return "";
    return timeStr;
  }

  function renderCalendar() {
    if (monthYearLabel) {
      monthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }

    if (!daysBody) return;
    daysBody.innerHTML = "";

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    const todayDate = new Date();
    const isCurrentMonth = todayDate.getFullYear() === currentYear && todayDate.getMonth() === currentMonth;
    const todayDayNum = todayDate.getDate();

    let dayCount = 1;
    let nextMonthDayCount = 1;

    // Create up to 6 rows (weeks)
    for (let row = 0; row < 6; row++) {
      const tr = document.createElement("tr");

      for (let col = 0; col < 7; col++) {
        const td = document.createElement("td");
        const cellIndex = row * 7 + col;

        if (cellIndex < firstDayIndex) {
          // Days from previous month
          const prevDay = prevMonthDays - (firstDayIndex - col - 1);
          td.classList.add("other-month");
          td.innerHTML = `<span class="vtiac-day-num">${prevDay}</span>`;
        } else if (dayCount <= totalDaysInMonth) {
          // Current month days
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

          // Find events on this date
          const dayEvents = allEvents.filter((ev) => ev.date === formattedDate);

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
          // Days from next month
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
  }

  function renderAgendaList(filterDate = null) {
    if (!agendaList) return;
    agendaList.innerHTML = "";

    const monthStr = String(currentMonth + 1).padStart(2, "0");
    const currentMonthPrefix = `${currentYear}-${monthStr}`;

    let monthEvents = allEvents.filter((ev) => ev.date.startsWith(currentMonthPrefix));

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
          <span class="badge ${getBadgeClass(ev.type)}">${ev.category || "Event"}</span>
          <span class="small text-secondary fw-semibold">${ev.date}</span>
        </div>
        <h6 class="fw-bold text-dark fs-6 mb-1">${ev.title}</h6>
        <p class="small text-secondary mb-0"><i class="bi bi-clock me-1"></i>${ev.time || "All Day"}</p>
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
    const examinerEl = document.getElementById("vtiacEventModalExaminer");
    const detailsEl = document.getElementById("vtiacEventModalDetails");
    const peopleRowEl = document.getElementById("vtiacEventModalPeopleRow");

    if (titleEl) titleEl.textContent = ev.title;
    if (categoryEl) categoryEl.textContent = ev.category || "General Event";
    if (dateTimeEl) dateTimeEl.textContent = `${ev.date} • ${ev.time || "All Day"}`;
    if (courseNameEl) courseNameEl.textContent = ev.course_name || ev.title;
    if (batchLabelEl) batchLabelEl.textContent = ev.batch_label || "General";
    if (trainerEl) trainerEl.textContent = ev.trainer || "N/A";
    if (examinerEl) examinerEl.textContent = ev.examiner || "N/A";
    if (detailsEl) detailsEl.textContent = ev.details || "No additional description provided.";

    if (headerEl) {
      headerEl.className = "modal-header text-white p-4 ";
      if (ev.type === "exam") headerEl.classList.add("bg-danger");
      else if (ev.type === "class_end") headerEl.classList.add("bg-warning");
      else if (ev.type === "class_start") headerEl.classList.add("bg-success");
      else headerEl.classList.add("bg-primary");
    }

    if (peopleRowEl) {
      peopleRowEl.classList.toggle("d-none", !ev.trainer && !ev.examiner);
    }

    if (eventModal) {
      eventModal.show();
    } else if (eventModalEl && window.bootstrap && window.bootstrap.Modal) {
      const modal = window.bootstrap.Modal.getOrCreateInstance(eventModalEl);
      modal.show();
    }
  }

  // Event Listeners for Navigation
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
