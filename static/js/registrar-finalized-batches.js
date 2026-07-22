/**
 * Registrar — batch repository (draft + active)
 * from saved schedule templates.
 *
 * Status flow:
 *   draft  →  active
 *
 * Draft batches:
 *   - Editable
 *   - Can be deleted
 *   - Can be activated
 *
 * Active batches:
 *   - Locked
 *   - Read-only
 *   - Cannot be edited
 *   - Cannot be deleted
 */

import { showFinalizeBatchConfirm } from "./registrar-batch-finalize-modal.js";
import { escapeHtml, scheduleLabel } from "./registrar-batch-store.js";

const BATCHING_URL = "/registrar/batching-scheduling/";

/**
 * Get Django CSRF token.
 */
function getCsrfToken() {
  const input = document.querySelector("[name=csrfmiddlewaretoken]");

  if (input?.value) {
    return input.value;
  }

  const match = document.cookie.match(/csrftoken=([^;]+)/);

  return match
    ? decodeURIComponent(match[1])
    : "";
}

/**
 * Format date for display.
 */
function formatDate(iso) {
  if (!iso) {
    return "—";
  }

  return new Date(`${iso}T12:00:00`).toLocaleDateString(
    "en-PH",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );
}

/**
 * Format date and time for display.
 */
function formatDateTime(iso) {
  if (!iso) {
    return "—";
  }

  return new Date(iso).toLocaleString(
    "en-PH",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

/**
 * Fetch all saved batches from Django.
 *
 * Backend returns:
 * {
 *   batches: [...]
 * }
 */
async function fetchBatches() {
  const res = await fetch(
    "/registrar/api/batching/batches/",
    {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const data = await res.json().catch(
    () => ({})
  );

  if (!res.ok) {
    throw new Error(
      data.error ||
      "Could not load batches."
    );
  }

  return Array.isArray(data.batches)
    ? data.batches
    : [];
}

/**
 * Activate a draft batch.
 *
 * NOTE:
 * The backend URL is still named "finalize"
 * because your current Django urls.py uses:
 *
 * /registrar/api/batching/template/finalize/<id>/
 *
 * The UI terminology is now "Activate".
 */
async function activateBatch(id) {
  const res = await fetch(
    `/registrar/api/batching/template/finalize/${encodeURIComponent(id)}/`,
    {
      method: "POST",

      headers: {
        "X-CSRFToken": getCsrfToken(),
        Accept: "application/json",
      },

      credentials: "same-origin",
    }
  );

  const data = await res.json().catch(
    () => ({})
  );

  if (!res.ok) {
    throw new Error(
      data.error ||
      "Could not activate batch."
    );
  }

  return data.batch;
}


document.addEventListener(
  "DOMContentLoaded",
  () => {

    /*
    |--------------------------------------------------------------------------
    | DOM ELEMENTS
    |--------------------------------------------------------------------------
    */

    const statsEl =
      document.getElementById(
        "finalized-stats"
      );

    const listEl =
      document.getElementById(
        "finalized-list"
      );

    const emptyEl =
      document.getElementById(
        "finalized-empty"
      );

    const searchEl =
      document.getElementById(
        "finalized-search"
      );

    const courseFilterEl =
      document.getElementById(
        "finalized-course-filter"
      );

    const statusFilterEl =
      document.getElementById(
        "finalized-status-filter"
      );

    const countEl =
      document.getElementById(
        "finalized-count"
      );

    const modalEl =
      document.getElementById(
        "finalized-detail-modal"
      );

    const modalBodyEl =
      document.getElementById(
        "finalized-detail-body"
      );

    const modalTitleEl =
      document.getElementById(
        "finalized-detail-title"
      );

    const modalMetaEl =
      document.getElementById(
        "finalized-detail-meta"
      );

    const modalFooterEl =
      document.getElementById(
        "finalized-detail-footer"
      );


    /*
    |--------------------------------------------------------------------------
    | BOOTSTRAP MODAL
    |--------------------------------------------------------------------------
    */

    const modal =
      modalEl
        ? bootstrap.Modal.getOrCreateInstance(
            modalEl
          )
        : null;


    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    let allBatches = [];

    let searchQuery = "";

    let courseFilter = "";

    /*
     * IMPORTANT:
     * The backend now returns:
     *
     * "draft"
     * "active"
     *
     * Therefore the default tab must be "active".
     */
    let activeTab = "active";

    /*
     * Fixed:
     * Your previous JS used statusFilter
     * without declaring it.
     */
    let statusFilter = "";


    /*
    |--------------------------------------------------------------------------
    | FILTER BATCHES
    |--------------------------------------------------------------------------
    */

    function filteredBatches() {

      const q =
        searchQuery
          .trim()
          .toLowerCase();

      return allBatches.filter(
        (b) => {

          /*
           * Filter by active tab.
           *
           * Expected values:
           * "active"
           * "draft"
           */
          if (
            activeTab &&
            b.status !== activeTab
          ) {
            return false;
          }


          /*
           * Filter by course.
           */
          if (
            courseFilter &&
            b.courseName !== courseFilter
          ) {
            return false;
          }


          /*
           * Optional status filter.
           *
           * This is only applied if
           * your HTML has a status filter.
           */
          if (
            statusFilter &&
            b.status !== statusFilter
          ) {
            return false;
          }


          /*
           * No search query.
           */
          if (!q) {
            return true;
          }


          /*
           * Search course.
           */
          const courseName =
            (
              b.courseName ||
              ""
            ).toLowerCase();


          /*
           * Search batch label.
           */
          const batchLabel =
            (
              b.batchLabel ||
              ""
            ).toLowerCase();


          /*
           * Search trainer.
           */
          const trainer =
            (
              b.trainer ||
              ""
            ).toLowerCase();


          /*
           * Search batch name.
           */
          const batchName =
            (
              b.name ||
              ""
            ).toLowerCase();


          /*
           * Search students safely.
           */
          const students =
            Array.isArray(
              b.students
            )
              ? b.students
              : [];


          const studentMatch =
            students.some(
              (s) => {

                const lastName =
                  (
                    s.lastName ||
                    ""
                  ).toLowerCase();

                const firstName =
                  (
                    s.firstName ||
                    ""
                  ).toLowerCase();

                return (
                  lastName.includes(q) ||
                  firstName.includes(q)
                );
              }
            );


          return (
            courseName.includes(q) ||
            batchLabel.includes(q) ||
            trainer.includes(q) ||
            batchName.includes(q) ||
            studentMatch
          );
        }
      );
    }


    /*
    |--------------------------------------------------------------------------
    | POPULATE COURSE FILTER
    |--------------------------------------------------------------------------
    */

    function populateCourseFilter() {

      if (!courseFilterEl) {
        return;
      }

      const courses =
        [
          ...new Set(
            allBatches
              .map(
                (b) =>
                  b.courseName
              )
              .filter(Boolean)
          ),
        ].sort();


      courseFilterEl.innerHTML =
        '<option value="">All courses</option>' +
        courses
          .map(
            (c) =>
              `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
          )
          .join("");


      courseFilterEl.value =
        courseFilter;
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER STATISTICS
    |--------------------------------------------------------------------------
    */

    function renderStats(batches) {

      if (!statsEl) {
        return;
      }


      /*
       * Backend statuses:
       *
       * active
       * draft
       */

      const activeBatches =
        batches.filter(
          (b) =>
            b.status === "active"
        );


      const drafts =
        batches.filter(
          (b) =>
            b.status === "draft"
        );


      const students =
        batches.reduce(
          (
            total,
            b
          ) =>
            total +
            Number(
              b.studentCount || 0
            ),
          0
        );


      statsEl.innerHTML = `

        <div class="col-sm-3">
          <div class="registrar-finalized-stat">
            <span class="registrar-finalized-stat__value">
              ${batches.length}
            </span>

            <span class="registrar-finalized-stat__label">
              Total batches
            </span>
          </div>
        </div>


        <div class="col-sm-3">
          <div class="registrar-finalized-stat">
            <span class="registrar-finalized-stat__value">
              ${drafts.length}
            </span>

            <span class="registrar-finalized-stat__label">
              Draft (editable)
            </span>
          </div>
        </div>


        <div class="col-sm-3">
          <div class="registrar-finalized-stat">
            <span class="registrar-finalized-stat__value">
              ${activeBatches.length}
            </span>

            <span class="registrar-finalized-stat__label">
              Active (locked)
            </span>
          </div>
        </div>


        <div class="col-sm-3">
          <div class="registrar-finalized-stat">
            <span class="registrar-finalized-stat__value">
              ${students}
            </span>

            <span class="registrar-finalized-stat__label">
              Students
            </span>
          </div>
        </div>

      `;
    }


    /*
    |--------------------------------------------------------------------------
    | EDIT URL
    |--------------------------------------------------------------------------
    */

    function editUrl(batch) {

      const params =
        new URLSearchParams(
          {
            course:
              batch.courseId,

            template:
              batch.id,
          }
        );


      return (
        `${BATCHING_URL}?` +
        params.toString()
      );
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER BATCH CARD
    |--------------------------------------------------------------------------
    */

    function renderCard(batch) {

      /*
       * IMPORTANT:
       * Backend now uses "active".
       */
      const isActive =
        batch.status === "active";


      /*
       * Status badge.
       */
      const badge =
        isActive

          ? `
            <div class="registrar-finalized-card__badge">

              <i
                class="bi bi-check-circle-fill"
                aria-hidden="true"
              ></i>

              Active

            </div>
          `

          : `
            <div class="registrar-finalized-card__badge registrar-finalized-card__badge--draft">

              <i
                class="bi bi-pencil-square"
                aria-hidden="true"
              ></i>

              Draft

            </div>
          `;


      /*
       * Saved / activated information.
       */
      const when =
        isActive

          ? `
            <p class="registrar-finalized-card__when small text-muted mb-3">

              Activated
              ${escapeHtml(
                formatDateTime(
                  batch.finalizedAt
                )
              )}

            </p>
          `

          : `
            <p class="registrar-finalized-card__when small text-muted mb-3">

              Saved
              ${escapeHtml(
                formatDateTime(
                  batch.finalizedAt ||
                  batch.updatedAt ||
                  ""
                )
              )}

              · not active yet

            </p>
          `;


      /*
       * Actions.
       *
       * Active:
       *   View details only
       *
       * Draft:
       *   View
       *   Edit
       *   Activate
       */
      const actions =
        isActive

          ? `
            <button
              type="button"
              class="btn btn-outline-primary btn-sm finalized-view-btn"
              data-id="${escapeHtml(batch.id)}"
            >

              <i
                class="bi bi-eye me-1"
                aria-hidden="true"
              ></i>

              View details

            </button>
          `

          : `
            <div class="d-flex flex-wrap gap-2">

              <button
                type="button"
                class="btn btn-outline-primary btn-sm finalized-view-btn"
                data-id="${escapeHtml(batch.id)}"
              >
                View
              </button>


              <a
                href="${editUrl(batch)}"
                class="btn btn-outline-secondary btn-sm"
              >
                Edit
              </a>


              <button
                type="button"
                class="btn btn-success btn-sm finalized-finalize-btn"
                data-id="${escapeHtml(batch.id)}"
              >

                Activate

              </button>

            </div>
          `;


      return `

        <article
          class="registrar-finalized-card${
            isActive
              ? ""
              : " registrar-finalized-card--draft"
          }"
        >

          ${badge}


          <h3 class="registrar-finalized-card__course">

            ${escapeHtml(
              batch.courseName
            )}

          </h3>


          <p class="registrar-finalized-card__batch mb-1">

            ${escapeHtml(
              batch.batchLabel
            )}

          </p>


          ${
            batch.name

              ? `
                <p class="small text-muted mb-2">

                  ${escapeHtml(
                    batch.name
                  )}

                </p>
              `

              : ""
          }


          <ul class="registrar-finalized-card__meta list-unstyled mb-3">

            <li>

              <i
                class="bi bi-calendar-range me-2"
                aria-hidden="true"
              ></i>

              ${formatDate(
                batch.startDate
              )}

              –

              ${formatDate(
                batch.endDate
              )}

            </li>


            <li>

              <i
                class="bi bi-clock me-2"
                aria-hidden="true"
              ></i>

              ${escapeHtml(
                scheduleLabel(
                  batch.schedule
                )
              )}

            </li>


            <li>

              <i
                class="bi bi-person-badge me-2"
                aria-hidden="true"
              ></i>

              ${escapeHtml(
                batch.trainer ||
                "—"
              )}

            </li>


            <li>

              <i
                class="bi bi-people me-2"
                aria-hidden="true"
              ></i>

              ${batch.studentCount}

              student${
                batch.studentCount === 1
                  ? ""
                  : "s"
              }

              ·

              ${batch.durationDays}

              training days

            </li>

          </ul>


          ${when}


          ${actions}

        </article>

      `;
    }


    /*
    |--------------------------------------------------------------------------
    | OPEN BATCH DETAILS MODAL
    |--------------------------------------------------------------------------
    */

    function openDetail(id) {

      const batch =
        allBatches.find(
          (b) =>
            b.id === id
        );


      if (
        !batch ||
        !modal
      ) {
        return;
      }


      /*
       * Backend status:
       * active / draft
       */
      const isActive =
        batch.status === "active";


      /*
       * Modal title.
       */
      if (modalTitleEl) {

        modalTitleEl.textContent =
          `${batch.courseName} — ${batch.batchLabel}`;

      }


      /*
       * Modal status text.
       */
      if (modalMetaEl) {

        modalMetaEl.textContent =
          isActive

            ? `Activated ${formatDateTime(
                batch.finalizedAt
              )} · read-only`

            : "Draft · you can edit or activate from this page";

      }


      /*
       * Build student table.
       */
      const students =
        Array.isArray(
          batch.students
        )
          ? batch.students
          : [];


      const studentRows =
        students
          .map(
            (
              s,
              i
            ) => `

              <tr>

                <td>
                  ${i + 1}
                </td>

                <td>
                  ${escapeHtml(
                    s.lastName ||
                    ""
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    s.firstName ||
                    ""
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    s.program ||
                    ""
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    s.competencyStatus ||
                    "Not Yet Competent"
                  )}
                </td>

              </tr>

            `
          )
          .join("");


      /*
       * Modal body.
       */
      if (modalBodyEl) {

        modalBodyEl.innerHTML = `

          <section
            class="registrar-student-detail__section"
          >

            <h4
              class="registrar-student-detail__heading"
            >

              <i
                class="bi bi-journal-check"
                aria-hidden="true"
              ></i>

              Batch summary

            </h4>


            <div
              class="registrar-student-detail__grid"
            >


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Status
                </label>

                <p>
                  ${
                    isActive
                      ? "Active (locked)"
                      : "Draft (editable)"
                  }
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Program
                </label>

                <p>
                  ${escapeHtml(
                    batch.courseName
                  )}
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Batch
                </label>

                <p>
                  ${escapeHtml(
                    batch.batchLabel
                  )}
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Class duration
                </label>

                <p>
                  ${batch.durationDays}

                  training day${
                    batch.durationDays === 1
                      ? ""
                      : "s"
                  }
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Trainer
                </label>

                <p>
                  ${escapeHtml(
                    batch.trainer ||
                    "—"
                  )}
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Start date
                </label>

                <p>
                  ${formatDate(
                    batch.startDate
                  )}
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  End date
                </label>

                <p>
                  ${formatDate(
                    batch.endDate
                  )}
                </p>

              </div>


              <div
                class="registrar-student-detail__field"
              >

                <label>
                  Schedule
                </label>

                <p>
                  ${escapeHtml(
                    scheduleLabel(
                      batch.schedule
                    )
                  )}
                </p>

              </div>


              ${
                isActive

                  ? `
                    <div
                      class="registrar-student-detail__field"
                    >

                      <label>
                        Activated on
                      </label>

                      <p>
                        ${formatDateTime(
                          batch.finalizedAt
                        )}
                      </p>

                    </div>
                  `

                  : ""
              }


            </div>

          </section>


          <section
            class="registrar-student-detail__section mb-0"
          >

            <h4
              class="registrar-student-detail__heading"
            >

              <i
                class="bi bi-people-fill"
                aria-hidden="true"
              ></i>

              Students
              (${batch.studentCount})

            </h4>


            <div
              class="table-responsive"
            >

              <table
                class="table registrar-table registrar-batching-table mb-0"
              >

                <thead>

                  <tr>

                    <th>
                      #
                    </th>

                    <th>
                      Last Name
                    </th>

                    <th>
                      First Name
                    </th>

                    <th>
                      Program
                    </th>

                    <th>
                      Status
                    </th>

                  </tr>

                </thead>


                <tbody>

                  ${
                    studentRows ||

                    `
                      <tr>

                        <td
                          colspan="5"
                          class="text-muted"
                        >
                          No students
                        </td>

                      </tr>
                    `
                  }

                </tbody>

              </table>

            </div>

          </section>

        `;
      }


      /*
       * Modal footer.
       */
      if (modalFooterEl) {

        modalFooterEl.innerHTML =

          isActive

            ? `
              <button
                type="button"
                class="btn btn-outline-secondary px-4"
                data-bs-dismiss="modal"
              >
                Close
              </button>
            `

            : `

              <button
                type="button"
                class="btn btn-outline-secondary px-4"
                data-bs-dismiss="modal"
              >
                Close
              </button>


              <a
                href="${editUrl(batch)}"
                class="btn btn-outline-dark px-4"
              >
                Edit schedule
              </a>


              <button
                type="button"
                class="btn btn-success px-4 finalized-finalize-btn"
                data-id="${escapeHtml(batch.id)}"
              >
                Activate batch
              </button>

            `;
      }


      modal.show();
    }


    /*
    |--------------------------------------------------------------------------
    | HANDLE BATCH ACTIVATION
    |--------------------------------------------------------------------------
    */

    function handleActivate(id) {

      const batch =
        allBatches.find(
          (b) =>
            b.id === id
        );


      /*
       * Do nothing if:
       * - batch does not exist
       * - batch is already active
       */
      if (
        !batch ||
        batch.status === "active"
      ) {
        return;
      }


      /*
       * Reuse your existing confirmation modal.
       *
       * The modal file may still use "Finalize"
       * terminology internally, but the actual
       * backend action is now activation.
       */
      showFinalizeBatchConfirm(
        batch,

        async () => {

          try {

            /*
             * Activate through backend.
             */
            const saved =
              await activateBatch(
                id
              );


            /*
             * Update local batch list.
             */
            const idx =
              allBatches.findIndex(
                (b) =>
                  b.id === id
              );


            if (idx >= 0) {

              allBatches[idx] =
                saved;

            } else {

              allBatches.unshift(
                saved
              );

            }


            /*
             * Close modal.
             */
            modal?.hide();


            /*
             * Re-render UI.
             */
            render();

          } catch (err) {

            /*
             * Show activation error.
             */
            alert(
              err.message ||
              "Could not activate batch."
            );

          }

        }
      );
    }


    /*
    |--------------------------------------------------------------------------
    | RENDER PAGE
    |--------------------------------------------------------------------------
    */

    function render() {

      const batches =
        filteredBatches();


      /*
       * Count ACTIVE batches.
       */
      const activeCount =
        allBatches.filter(
          (b) =>
            b.status === "active"
        ).length;


      if (countEl) {

        countEl.textContent =
          String(
            activeCount
          );

      }


      /*
       * Render statistics
       * based on currently filtered batches.
       */
      renderStats(
        filteredBatches()
      );


      /*
       * Populate course dropdown.
       */
      populateCourseFilter();


      /*
       * Empty state.
       */
      if (
        batches.length === 0
      ) {

        if (listEl) {

          listEl.innerHTML =
            "";

          listEl.classList.add(
            "d-none"
          );

        }


        emptyEl?.classList.remove(
          "d-none"
        );

        return;
      }


      /*
       * Display cards.
       */
      listEl?.classList.remove(
        "d-none"
      );


      emptyEl?.classList.add(
        "d-none"
      );


      if (listEl) {

        listEl.innerHTML = `

          <div
            class="row g-3"
          >

            ${batches
              .map(
                (b) =>
                  `
                    <div
                      class="col-md-6 col-xl-4"
                    >
                      ${renderCard(b)}
                    </div>
                  `
              )
              .join("")}

          </div>

        `;

      }
    }


    /*
    |--------------------------------------------------------------------------
    | LOAD DATA
    |--------------------------------------------------------------------------
    */

    async function load() {

      try {

        allBatches =
          await fetchBatches();


        render();

      } catch (err) {

        if (emptyEl) {

          emptyEl.classList.remove(
            "d-none"
          );


          const errorText =
            emptyEl.querySelector(
              "p.text-muted"
            );


          if (errorText) {

            errorText.textContent =
              err.message;

          }

        }


        listEl?.classList.add(
          "d-none"
        );

      }
    }


    /*
    |--------------------------------------------------------------------------
    | BATCH LIST CLICK EVENTS
    |--------------------------------------------------------------------------
    */

    listEl?.addEventListener(
      "click",
      (e) => {

        /*
         * View details.
         */
        const viewBtn =
          e.target.closest(
            ".finalized-view-btn"
          );


        if (viewBtn) {

          openDetail(
            viewBtn.dataset.id
          );

          return;
        }


        /*
         * Activate batch.
         */
        const activateBtn =
          e.target.closest(
            ".finalized-finalize-btn"
          );


        if (activateBtn) {

          handleActivate(
            activateBtn.dataset.id
          );

        }

      }
    );


    /*
    |--------------------------------------------------------------------------
    | MODAL FOOTER CLICK EVENTS
    |--------------------------------------------------------------------------
    */

    modalFooterEl?.addEventListener(
      "click",
      (e) => {

        const activateBtn =
          e.target.closest(
            ".finalized-finalize-btn"
          );


        if (activateBtn) {

          handleActivate(
            activateBtn.dataset.id
          );

        }

      }
    );


    /*
    |--------------------------------------------------------------------------
    | SEARCH
    |--------------------------------------------------------------------------
    */

    searchEl?.addEventListener(
      "input",
      (e) => {

        searchQuery =
          e.target.value;

        render();

      }
    );


    /*
    |--------------------------------------------------------------------------
    | COURSE FILTER
    |--------------------------------------------------------------------------
    */

    courseFilterEl?.addEventListener(
      "change",
      (e) => {

        courseFilter =
          e.target.value;

        render();

      }
    );


    /*
    |--------------------------------------------------------------------------
    | STATUS TABS
    |--------------------------------------------------------------------------
    */

    const statusTabEls =
      document.querySelectorAll(
        ".registrar-status-tab"
      );


    statusTabEls.forEach(
      (tab) => {

        tab.addEventListener(
          "click",
          () => {

            /*
             * Expected values:
             *
             * data-status="active"
             * data-status="draft"
             */
            activeTab =
              tab.dataset.status;


            /*
             * Update active tab styling.
             */
            statusTabEls.forEach(
              (item) => {

                const isActive =
                  item === tab;


                item.classList.toggle(
                  "active",
                  isActive
                );


                item.setAttribute(
                  "aria-selected",
                  String(
                    isActive
                  )
                );

              }
            );


            /*
             * Reset course filter
             * when switching tabs.
             */
            courseFilter =
              "";


            if (courseFilterEl) {

              courseFilterEl.value =
                "";

            }


            /*
             * Re-render.
             */
            render();

          }
        );

      }
    );


    /*
    |--------------------------------------------------------------------------
    | STATUS FILTER
    |--------------------------------------------------------------------------
    */

    statusFilterEl?.addEventListener(
      "change",
      (e) => {

        statusFilter =
          e.target.value;

        render();

      }
    );


    /*
    |--------------------------------------------------------------------------
    | INITIAL LOAD
    |--------------------------------------------------------------------------
    */

    load();

  }
);