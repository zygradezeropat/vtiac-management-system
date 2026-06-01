/**
 * Staff Login drawer — navigate to /login/<role>/ when a role is chosen.
 * (data-bs-dismiss on <a> tags prevents navigation in Bootstrap 5.)
 */
function navigateAfterOffcanvas(offcanvasEl, href) {
  const go = () => window.location.assign(href);

  if (!offcanvasEl || !window.bootstrap?.Offcanvas) {
    go();
    return;
  }

  const instance = window.bootstrap.Offcanvas.getInstance(offcanvasEl);
  if (!instance) {
    go();
    return;
  }

  const fallback = window.setTimeout(go, 450);
  offcanvasEl.addEventListener(
    "hidden.bs.offcanvas",
    () => {
      window.clearTimeout(fallback);
      go();
    },
    { once: true },
  );
  instance.hide();
}

export function initStaffLoginDrawer() {
  const offcanvasEl = document.getElementById("staffMenuOffcanvas");
  if (!offcanvasEl) return;

  offcanvasEl.querySelectorAll("a.staff-role-item[href]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") return;

      event.preventDefault();
      navigateAfterOffcanvas(offcanvasEl, href);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initStaffLoginDrawer());
} else {
  initStaffLoginDrawer();
}
