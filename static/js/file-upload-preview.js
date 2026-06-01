/**
 * Preview uploaded or selected files (images and PDFs) in a modal.
 */

/** Modern preview control (SVG + shared button class). */
export const FILE_PREVIEW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="file-preview-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.25 12s3.75-7.25 9.75-7.25S21.75 12 21.75 12s-3.75 7.25-9.75 7.25S2.25 12 2.25 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;

export function filePreviewButtonHtml({ extraClass = "", ariaLabel = "Preview file" } = {}) {
  return `<button type="button" class="file-preview-btn${extraClass ? ` ${extraClass}` : ""}" aria-label="${ariaLabel.replace(/"/g, "&quot;")}">${FILE_PREVIEW_ICON}</button>`;
}

const MODAL_ID = "file-preview-modal";
let activeObjectUrl = null;

function isPdfFile(filename, url) {
  const name = (filename || "").toLowerCase();
  const href = (url || "").toLowerCase();
  return name.endsWith(".pdf") || href.includes(".pdf") || href.includes("application/pdf");
}

export function ensureFilePreviewModal() {
  const existing = document.getElementById(MODAL_ID);
  if (existing && !existing.querySelector(".file-preview-modal__dialog")) {
    existing.remove();
  }
  if (document.getElementById(MODAL_ID)) return;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-labelledby="file-preview-modal-label" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl file-preview-modal__dialog">
        <div class="modal-content student-confirm-modal file-preview-modal__content">
          <div class="modal-header border-0 pb-2">
            <h3 class="modal-title h5 fw-bold text-truncate pe-3" id="file-preview-modal-label">Document preview</h3>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body file-preview-modal__body">
            <div class="file-preview-modal__frame">
              <img id="file-preview-img" class="file-preview-modal__img d-none" alt="" />
              <iframe id="file-preview-frame" class="file-preview-modal__pdf d-none" title="PDF preview"></iframe>
            </div>
          </div>
          <div class="modal-footer border-0 pt-0">
            <a id="file-preview-open-tab" class="btn btn-outline-secondary btn-sm" href="#" target="_blank" rel="noopener noreferrer">Open in new tab</a>
            <button type="button" class="btn btn-success btn-sm fw-semibold" data-bs-dismiss="modal" style="background:#00a859;border-color:#00a859">Close</button>
          </div>
        </div>
      </div>
    </div>`
  );

  document.getElementById(MODAL_ID)?.addEventListener("hidden.bs.modal", () => {
    const img = document.getElementById("file-preview-img");
    const frame = document.getElementById("file-preview-frame");
    if (img) {
      img.src = "";
      img.alt = "";
    }
    if (frame) frame.src = "";
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  });
}

export function openFilePreview({ url, filename = "Document", revokeOnClose = false }) {
  if (!url) return;
  ensureFilePreviewModal();

  const modalEl = document.getElementById(MODAL_ID);
  const img = document.getElementById("file-preview-img");
  const pdfFrame = document.getElementById("file-preview-frame");
  const previewFrame = document.querySelector(`#${MODAL_ID} .file-preview-modal__frame`);
  const title = document.getElementById("file-preview-modal-label");
  const openTab = document.getElementById("file-preview-open-tab");

  if (revokeOnClose) {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = url.startsWith("blob:") ? url : null;
  }

  const pdf = isPdfFile(filename, url);
  if (previewFrame) {
    previewFrame.classList.toggle("file-preview-modal__frame--pdf", pdf);
    previewFrame.classList.toggle("file-preview-modal__frame--image", !pdf);
    previewFrame.scrollTop = 0;
    previewFrame.scrollLeft = 0;
  }
  if (img && pdfFrame) {
    if (pdf) {
      img.classList.add("d-none");
      img.removeAttribute("src");
      pdfFrame.classList.remove("d-none");
      pdfFrame.src = url;
    } else {
      pdfFrame.classList.add("d-none");
      pdfFrame.src = "";
      img.classList.remove("d-none");
      img.src = url;
      img.alt = filename;
    }
  }

  if (title) title.textContent = filename;
  if (openTab) {
    openTab.href = url;
    openTab.setAttribute("aria-label", `Open ${filename} in new tab`);
  }

  if (typeof bootstrap !== "undefined" && modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function ensurePreviewControlsInWrap(wrap, input) {
  wrap.querySelector(".student-file-upload-row__meta")?.remove();

  let inputWrap = wrap.querySelector(".student-file-upload-row__input-wrap");
  if (!inputWrap) {
    inputWrap = document.createElement("div");
    inputWrap.className = "student-file-upload-row__input-wrap";
    if (input.parentElement === wrap) {
      wrap.insertBefore(inputWrap, input);
      inputWrap.appendChild(input);
    }
    inputWrap.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="file-preview-btn file-preview-btn--attached" data-file-preview-view hidden aria-label="Preview file">${FILE_PREVIEW_ICON}</button>`
    );
  }

  return { viewBtn: inputWrap.querySelector("[data-file-preview-view]") };
}

export function createFilePreviewControls(input, options = {}) {
  const existingUrl =
    options.existingUrl || input.dataset.previewExistingUrl || "";
  const existingName =
    options.existingName || input.dataset.previewExistingName || "Uploaded file";

  let wrap = input.closest("[data-file-preview-root]");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "student-file-upload-row";
    wrap.dataset.filePreviewRoot = "1";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  const { viewBtn } = ensurePreviewControlsInWrap(wrap, input);
  let localObjectUrl = null;

  function revokeLocal() {
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
      localObjectUrl = null;
    }
  }

  function bindView(url, filename, revoke = false) {
    if (!viewBtn) return;
    if (!url) {
      viewBtn.hidden = true;
      viewBtn.onclick = null;
      return;
    }
    viewBtn.hidden = false;
    viewBtn.onclick = () => openFilePreview({ url, filename, revokeOnClose: revoke });
  }

  function showExisting() {
    if (!existingUrl) return;
    bindView(existingUrl, existingName || "Current file");
  }

  function clearSelection() {
    if (existingUrl) {
      showExisting();
      return;
    }
    bindView(null);
  }

  showExisting();

  input.addEventListener("change", () => {
    revokeLocal();
    const file = input.files?.[0];
    if (!file) {
      clearSelection();
      return;
    }

    localObjectUrl = URL.createObjectURL(file);
    bindView(localObjectUrl, file.name, true);
  });

  if (input.files?.[0]) {
    input.dispatchEvent(new Event("change"));
  }

  return wrap;
}

export function initFilePreviewTriggers(root = document) {
  ensureFilePreviewModal();
  root.querySelectorAll("[data-preview-url]").forEach((btn) => {
    if (btn.dataset.previewBound === "1") return;
    btn.dataset.previewBound = "1";
    btn.addEventListener("click", () => {
      openFilePreview({
        url: btn.dataset.previewUrl,
        filename: btn.dataset.previewName || "Document",
      });
    });
  });
}
