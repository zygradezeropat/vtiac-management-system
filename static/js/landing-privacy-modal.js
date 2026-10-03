document.addEventListener("DOMContentLoaded", () => {
  const modalEl = document.getElementById("dataPrivacyModal");
  const agreeBtn = document.getElementById("dataPrivacyAgreeBtn");
  if (!modalEl || !agreeBtn) return;

  let pendingTargetUrl = "";

  // Select all links navigating to registration
  const registerLinks = document.querySelectorAll('a[href*="register"]');

  registerLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const rawHref = link.getAttribute("href");
      if (!rawHref) return;

      try {
        const url = new URL(rawHref, window.location.origin);
        url.searchParams.set("consent", "1");
        pendingTargetUrl = url.toString();
      } catch {
        pendingTargetUrl = rawHref;
      }

      if (window.bootstrap && window.bootstrap.Modal) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
      }
    });
  });

  agreeBtn.addEventListener("click", () => {
    if (pendingTargetUrl) {
      window.location.href = pendingTargetUrl;
    }
  });
});
