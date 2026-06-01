/**
 * Confirm before navigating to logout (all portals).
 */
(function () {
  const MODAL_ID = "logoutConfirmModal";
  const CONFIRM_BTN_ID = "logoutConfirmBtn";

  let pendingLogoutHref = null;

  function getModal() {
    const el = document.getElementById(MODAL_ID);
    if (!el || typeof bootstrap === "undefined") return null;
    return bootstrap.Modal.getOrCreateInstance(el);
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-logout-confirm]");
    if (!trigger) return;

    e.preventDefault();
    pendingLogoutHref = trigger.getAttribute("href");
    if (!pendingLogoutHref) return;

    const offcanvasEl = trigger.closest(".offcanvas.show, .offcanvas");
    if (offcanvasEl && typeof bootstrap !== "undefined") {
      const instance = bootstrap.Offcanvas.getInstance(offcanvasEl);
      instance?.hide();
    }

    const modal = getModal();
    if (modal) {
      modal.show();
    } else {
      window.location.href = pendingLogoutHref;
    }
  });

  document.getElementById(CONFIRM_BTN_ID)?.addEventListener("click", () => {
    if (pendingLogoutHref) {
      window.location.href = pendingLogoutHref;
    }
  });

  document.getElementById(MODAL_ID)?.addEventListener("hidden.bs.modal", () => {
    pendingLogoutHref = null;
  });
})();
