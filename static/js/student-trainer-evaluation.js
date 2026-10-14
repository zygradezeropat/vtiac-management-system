/**
 * Student Trainer Evaluation Script
 * Handles real-time score calculation, validation, and submission feedback.
 */
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("studentEvaluationForm");
  const submitBtn = document.getElementById("submitEvaluationBtn");

  if (!form) return;

  const questions = ["q1", "q2", "q3"];

  // Create a live score indicator above the submit button
  const footerContainer = form.querySelector(".card-footer");
  let scoreBadge = null;
  if (footerContainer) {
    const wrapper = document.createElement("div");
    wrapper.className = "d-flex align-items-center justify-content-between flex-wrap gap-2 w-100";

    scoreBadge = document.createElement("div");
    scoreBadge.className = "fs-7 text-secondary fw-medium d-flex align-items-center gap-2";
    scoreBadge.innerHTML = `
      <span>Calculated Score:</span>
      <span class="badge bg-success fs-7 px-3 py-1.5 rounded-pill" id="liveScoreValue">5.0 / 5.0</span>
      <span class="text-muted fs-8" id="liveScoreDesc">(Excellent)</span>
    `;

    // Move submit button inside wrapper
    if (submitBtn) {
      footerContainer.appendChild(wrapper);
      wrapper.appendChild(scoreBadge);
      wrapper.appendChild(submitBtn);
    }
  }

  function getRatingDescription(avg) {
    if (avg >= 4.5) return "(Excellent)";
    if (avg >= 3.5) return "(Very Good)";
    if (avg >= 2.5) return "(Good)";
    if (avg >= 1.5) return "(Fair)";
    return "(Needs Improvement)";
  }

  function updateLiveScore() {
    let sum = 0;
    let count = 0;

    questions.forEach(function (qName) {
      const selected = form.querySelector(`input[name="${qName}"]:checked`);
      if (selected) {
        sum += parseInt(selected.value, 10);
        count++;
      }
    });

    if (count > 0 && scoreBadge) {
      const avg = (sum / count).toFixed(1);
      const valEl = document.getElementById("liveScoreValue");
      const descEl = document.getElementById("liveScoreDesc");
      if (valEl) {
        valEl.textContent = `${avg} / 5.0`;
        valEl.className = `badge fs-7 px-3 py-1.5 rounded-pill ${
          avg >= 4.0 ? "bg-success" : avg >= 3.0 ? "bg-primary" : avg >= 2.0 ? "bg-warning text-dark" : "bg-danger"
        }`;
      }
      if (descEl) {
        descEl.textContent = getRatingDescription(parseFloat(avg));
      }
    }
  }

  // Attach change listener to all radio inputs
  questions.forEach(function (qName) {
    const radios = form.querySelectorAll(`input[name="${qName}"]`);
    radios.forEach(function (r) {
      r.addEventListener("change", updateLiveScore);
    });
  });

  // Initial calculation
  updateLiveScore();

  // Form submit handler with validation & loading state
  form.addEventListener("submit", function (e) {
    let allAnswered = true;
    questions.forEach(function (qName) {
      const checked = form.querySelector(`input[name="${qName}"]:checked`);
      if (!checked) {
        allAnswered = false;
      }
    });

    if (!allAnswered) {
      e.preventDefault();
      alert("Please provide a rating (1 to 5) for all 3 evaluation criteria before submitting.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Submitting...`;
    }
  });
});
