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
let activeRenderId = 0;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="pdf.js"], script[src*="pdf.min.js"]');
    if (existing) {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      existing.addEventListener("load", () => {
        if (window.pdfjsLib) resolve(window.pdfjsLib);
        else reject(new Error("pdfjsLib not defined"));
      });
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.onload = () => {
      if (window.pdfjsLib) {
        resolve(window.pdfjsLib);
      } else {
        reject(new Error("pdfjsLib not defined"));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function isImageFile(filename, url) {
  const name = (filename || "").toLowerCase();
  const href = (url || "").toLowerCase();
  if (href.startsWith("data:image/")) return true;
  if (href.startsWith("blob:")) {
    return !name.endsWith(".pdf");
  }
  const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico"];
  return imageExtensions.some((ext) => name.endsWith(ext) || href.includes(ext));
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
              <div id="file-preview-loading" class="text-center p-4 d-none">
                <div class="spinner-border spinner-border-sm text-success" role="status"></div>
                <span class="ms-2 small text-muted">Rendering preview...</span>
              </div>
              <img id="file-preview-img" class="file-preview-modal__img d-none" alt="" />
              <div id="file-preview-canvas-container" class="file-preview-canvas-container d-none w-100 d-flex flex-column align-items-center"></div>
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
    activeRenderId++;
    const img = document.getElementById("file-preview-img");
    const frame = document.getElementById("file-preview-frame");
    const canvasContainer = document.getElementById("file-preview-canvas-container");
    const loadingEl = document.getElementById("file-preview-loading");
    if (img) {
      img.src = "";
      img.alt = "";
    }
    if (frame) frame.src = "";
    if (canvasContainer) canvasContainer.innerHTML = "";
    if (loadingEl) loadingEl.classList.add("d-none");
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
  const canvasContainer = document.getElementById("file-preview-canvas-container");
  const loadingEl = document.getElementById("file-preview-loading");
  const previewFrame = document.querySelector(`#${MODAL_ID} .file-preview-modal__frame`);
  const title = document.getElementById("file-preview-modal-label");
  const openTab = document.getElementById("file-preview-open-tab");

  if (revokeOnClose) {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = url.startsWith("blob:") ? url : null;
  }

  const isImg = isImageFile(filename, url);
  const useFrame = !isImg;

  if (previewFrame) {
    previewFrame.classList.toggle("file-preview-modal__frame--pdf", useFrame);
    previewFrame.classList.toggle("file-preview-modal__frame--image", isImg);
    previewFrame.scrollTop = 0;
    previewFrame.scrollLeft = 0;
  }

  if (isImg) {
    if (pdfFrame) {
      pdfFrame.classList.add("d-none");
      pdfFrame.src = "";
    }
    if (canvasContainer) {
      canvasContainer.classList.add("d-none");
      canvasContainer.innerHTML = "";
    }
    if (loadingEl) loadingEl.classList.add("d-none");
    if (img) {
      img.classList.remove("d-none");
      img.src = url;
      img.alt = filename;
    }
  } else {
    // PDF rendering
    if (img) {
      img.classList.add("d-none");
      img.removeAttribute("src");
    }

    const renderId = ++activeRenderId;
    if (loadingEl) loadingEl.classList.remove("d-none");
    if (canvasContainer) {
      canvasContainer.classList.add("d-none");
      canvasContainer.innerHTML = "";
    }
    if (pdfFrame) {
      pdfFrame.classList.add("d-none");
      pdfFrame.src = "";
    }

    loadPdfJs()
      .then(async (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const loadingTask = pdfjs.getDocument(url);
        const pdf = await loadingTask.promise;
        if (renderId !== activeRenderId) return;

        if (canvasContainer) {
          canvasContainer.innerHTML = "";
          const numPages = Math.min(pdf.numPages, 10);
          for (let i = 1; i <= numPages; i++) {
            if (renderId !== activeRenderId) return;
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.className = "file-preview-pdf-page mb-3 shadow-sm border";
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.maxWidth = "100%";
            canvas.style.height = "auto";
            canvas.style.background = "#fff";
            canvas.style.borderRadius = "4px";
            const ctx = canvas.getContext("2d");
            await page.render({ canvasContext: ctx, viewport }).promise;
            canvasContainer.appendChild(canvas);
          }
        }

        if (loadingEl) loadingEl.classList.add("d-none");
        if (canvasContainer) canvasContainer.classList.remove("d-none");
      })
      .catch((err) => {
        console.warn("Could not render with PDF.js, falling back to iframe:", err);
        if (renderId !== activeRenderId) return;
        if (loadingEl) loadingEl.classList.add("d-none");
        if (canvasContainer) canvasContainer.classList.add("d-none");
        if (pdfFrame) {
          pdfFrame.classList.remove("d-none");
          pdfFrame.src = url;
        }
      });
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
