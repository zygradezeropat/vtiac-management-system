/**
 * Trainer Evaluations UI Enhancements
 * Provides instant client-side filtering for feedback comments and micro-animations.
 */
document.addEventListener("DOMContentLoaded", function () {
  const container = document.querySelector(".evaluation-feedback-scroll-container");
  if (!container) return;

  const header = container.closest(".card")?.querySelector(".card-header");
  const feedbackCards = Array.from(container.querySelectorAll(".p-3.bg-light.rounded-4"));

  // Only add filter search if there are feedback items to search
  if (header && feedbackCards.length > 2) {
    const searchWrapper = document.createElement("div");
    searchWrapper.className = "mt-2 w-100";
    searchWrapper.innerHTML = `
      <div class="input-group input-group-sm">
        <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-search"></i></span>
        <input type="text" id="feedbackFilterInput" class="form-control border-start-0" placeholder="Filter feedback comments by keyword or program...">
      </div>
    `;
    header.appendChild(searchWrapper);

    const filterInput = document.getElementById("feedbackFilterInput");
    if (filterInput) {
      filterInput.addEventListener("input", function (e) {
        const query = e.target.value.toLowerCase().trim();
        feedbackCards.forEach(function (card) {
          const text = card.textContent.toLowerCase();
          if (!query || text.includes(query)) {
            card.style.display = "";
          } else {
            card.style.display = "none";
          }
        });
      });
    }
  }

  // Smooth hover effects on feedback items
  feedbackCards.forEach(function (card) {
    card.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
    card.addEventListener("mouseenter", function () {
      card.style.transform = "translateY(-2px)";
      card.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";
    });
    card.addEventListener("mouseleave", function () {
      card.style.transform = "none";
      card.style.boxShadow = "none";
    });
  });
});
