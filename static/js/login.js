/** Password visibility toggle for login forms (session-based POST login). */
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggle-password");
  const passwordInput = document.getElementById("password");
  if (!toggleBtn || !passwordInput) return;

  toggleBtn.addEventListener("click", () => {
    const isText = passwordInput.type === "text";
    passwordInput.type = isText ? "password" : "text";
    toggleBtn.setAttribute("aria-label", isText ? "Show password" : "Hide password");
  });
});
