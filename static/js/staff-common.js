/** Staff portal UI helpers (session auth — server enforces access). */

export function initStaffHeader(roleLabel, fallbackName) {
  const nameEl = document.getElementById("staff-display-name");
  const initialsEl = document.getElementById("staff-initials");
  const roleEl = document.getElementById("staff-role-label");
  const display = (nameEl?.textContent || "").trim() || fallbackName;
  if (nameEl && !nameEl.textContent.trim()) nameEl.textContent = fallbackName;
  if (roleEl) roleEl.textContent = roleLabel;
  if (initialsEl && initialsEl.textContent.length <= 1) {
    const initials = display
      .split(" ")
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toUpperCase();
    initialsEl.textContent = initials || roleLabel.charAt(0);
  }
}

export function initStaffSidebar() {
  document.querySelectorAll("[data-menu-route]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.menuRoute;
      if (route) window.location.href = route;
    });
  });
}

/** Remove invisible Bootstrap backdrops that block sidebar and page clicks. */
export function removeStaleOffcanvasBackdrops() {
  const menuOpen = document.querySelector(".offcanvas.show, .offcanvas.showing");
  if (menuOpen) return;

  document.querySelectorAll(".offcanvas-backdrop").forEach((backdrop) => {
    backdrop.remove();
  });
  document.body.classList.remove("offcanvas-open");
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
}

function navigateAfterOffcanvas(offcanvasEl, href) {
  if (!href) return;
  if (!offcanvasEl || !window.bootstrap?.Offcanvas) {
    window.location.href = href;
    return;
  }

  const instance = window.bootstrap.Offcanvas.getInstance(offcanvasEl);
  if (!instance || !offcanvasEl.classList.contains("show")) {
    window.location.href = href;
    return;
  }

  offcanvasEl.addEventListener(
    "hidden.bs.offcanvas",
    () => {
      window.location.href = href;
    },
    { once: true }
  );
  instance.hide();
}

/**
 * Mobile drawer: ensure nav links navigate; clear stuck backdrops on close/resize.
 */
export function initPortalOffcanvas(id) {
  const offcanvasEl = document.getElementById(id);
  if (!offcanvasEl) return;

  offcanvasEl.querySelectorAll("a[href]").forEach((link) => {
    if (link.dataset.portalNavBound === "1") return;
    link.dataset.portalNavBound = "1";

    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      if (window.matchMedia("(min-width: 992px)").matches) return;

      if (link.hasAttribute("data-bs-dismiss")) {
        event.preventDefault();
        navigateAfterOffcanvas(offcanvasEl, href);
      }
    });
  });

  offcanvasEl.addEventListener("hidden.bs.offcanvas", removeStaleOffcanvasBackdrops);
  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 992px)").matches) {
      window.bootstrap?.Offcanvas?.getInstance(offcanvasEl)?.hide();
      removeStaleOffcanvasBackdrops();
    }
  });
}

const PORTAL_OFFCANVAS_IDS = [
  "mobileRegistrarSidebar",
  "mobileTrainerSidebar",
  "mobileStudentSidebar",
  "mobileCashierSidebar",
  "mobileAdminSidebar",
];

export function initAllPortalOffcanvases() {
  removeStaleOffcanvasBackdrops();
  PORTAL_OFFCANVAS_IDS.forEach((id) => initPortalOffcanvas(id));
}

export function initLiveClock(dateId, timeId) {
  const dateEl = document.getElementById(dateId);
  const timeEl = document.getElementById(timeId);
  if (!dateEl && !timeEl) return;

  function tick() {
    const now = new Date();
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (timeEl) {
      timeEl.textContent =
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " - Philippine Standard Time";
    }
  }
  tick();
  setInterval(tick, 1000);
}
