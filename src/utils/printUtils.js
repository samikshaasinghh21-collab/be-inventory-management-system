import { defaultBrandLogoUrl, resolveBrandLogo } from "./branding";

const commonStyles = `
  @page {
    size: A4;
    margin: 10mm;
  }
  html {
    background: #fff;
  }
  body {
    font-family: "Inter", "Segoe UI", system-ui, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 0;
    background: #fff;
    min-width: 0;
    overflow-x: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  h1, h2, h3 {
    margin: 0;
    font-weight: 600;
  }
  .print-page {
    width: 100%;
    max-width: 100%;
    margin: 0;
    padding: 8mm 6mm;
    transform-origin: top left;
  }
  .print-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
    page-break-after: avoid;
  }
  .print-title {
    font-size: 1.6rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #111827;
  }
  .print-subtitle {
    font-size: 1rem;
    color: #475569;
  }
  .print-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    margin-top: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e2e8f0;
  }
  .print-brand-text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    align-items: center;
    text-align: center;
  }
  .print-brand-logo {
    width: 320px;
    max-width: 100%;
    max-height: 90px;
    height: auto;
    object-fit: contain;
    border-radius: 0;
    border: 0;
    padding: 0;
    background: transparent;
  }
  .print-brand-name {
    font-weight: 600;
    color: #0f172a;
    margin: 0;
  }
  .print-brand-desc {
    margin: 0;
    font-size: 0.85rem;
    color: #475569;
  }
  .print-meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .print-meta-item {
    padding: 0.65rem;
    border: 1px solid #e2e8f0;
    border-radius: 0.5rem;
    background: #f8fafc;
  }
  .print-meta-label {
    display: block;
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .print-meta-value {
    margin-top: 0.25rem;
    font-size: 1rem;
    font-weight: 600;
    color: #0f172a;
  }
  .print-body {
    width: 100%;
    max-width: 100%;
    overflow: visible;
  }
  .print-panel-body,
  .print-panel-body .document-view-panel {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
  }
  .print-panel-body .document-view-panel {
    border: 2px solid #1e293b;
    box-shadow: none !important;
    break-inside: auto;
    overflow: visible;
  }
  .print-panel-body .document-view-panel > div {
    break-inside: auto;
    page-break-inside: auto;
  }
  .print-body *,
  .document-view-panel * {
    max-width: 100%;
  }
  .print-body [class*="shadow"],
  .document-view-panel [class*="shadow"] {
    box-shadow: none !important;
  }
  .print-body .overflow-x-auto,
  .print-body .app-scroll-region {
    overflow: visible !important;
  }
  .print-body [class*="min-w-"] {
    min-width: 0 !important;
  }
  .print-body [class*="max-h-"] {
    max-height: none !important;
  }
  .print-body .sticky,
  .print-body [class*="sticky"] {
    position: static !important;
  }
  .print-body img {
    max-width: 260px;
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .print-body button {
    display: none !important;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border: 1px solid #cbd5e1;
    margin-top: 1rem;
    table-layout: fixed;
    page-break-inside: auto;
  }
  thead {
    display: table-header-group;
  }
  tfoot {
    display: table-footer-group;
  }
  tr {
    page-break-inside: avoid;
  }
  th, td {
    border-right: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
    padding: 0.55rem 0.65rem;
    font-size: 0.9rem;
    text-align: left;
    vertical-align: top;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: break-word;
    background-clip: padding-box;
  }
  table tr > *:last-child {
    border-right: 0;
  }
  table tbody tr:last-child > *,
  table tfoot tr:last-child > * {
    border-bottom: 0;
  }
  .print-panel-body table,
  .print-panel-body .document-view-panel table {
    table-layout: auto;
    margin-top: 0 !important;
  }
  .print-panel-body th,
  .print-panel-body td,
  .print-panel-body .document-view-panel th,
  .print-panel-body .document-view-panel td {
    overflow-wrap: break-word;
    word-break: normal;
  }
  th {
    background: #f8fafc;
  }
  .details-row {
    display: grid;
    grid-template-columns: minmax(110px, 160px) 1fr;
    gap: 0.75rem;
    align-items: baseline;
    margin-bottom: 0.35rem;
    font-size: 0.95rem;
  }
  .details-label {
    font-size: 0.65rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #94a3b8;
  }
  .details-value {
    font-weight: 600;
    color: #0f172a;
  }
  .details-section h3 {
    margin-bottom: 0.35rem;
    font-size: 1rem;
    color: #0f172a;
  }
  .details-section table th,
  .details-section table td {
    font-size: 0.9rem;
  }
  .print-register-body table {
    table-layout: auto;
  }
  .print-register-body th,
  .print-register-body td {
    font-size: 0.8rem;
  }
  .print-register-body .rounded-full,
  .print-register-body [class*="rounded-full"] {
    border-radius: 9999px;
  }
  @media print {
    /* Override app-level print rules (e.g. body * { visibility: hidden }) in popup window */
    body,
    body * {
      visibility: visible !important;
    }
    .print-hidden {
      display: none !important;
    }
    body {
      padding: 0;
      overflow: visible !important;
    }
    .print-page {
      max-width: 100%;
      margin: 0;
      padding: 0;
    }
    .print-title {
      font-size: 1.2rem;
      letter-spacing: 0.12em;
    }
    .print-subtitle {
      font-size: 0.85rem;
    }
    .print-brand {
      margin-top: 0.5rem;
      padding-bottom: 0.5rem;
    }
    .print-brand-logo {
      max-height: 72px;
    }
    .print-meta-grid {
      gap: 0.45rem;
    }
    .print-meta-item {
      padding: 0.45rem;
    }
    table {
      min-width: 0 !important;
      max-width: 100% !important;
      margin-top: 0.65rem;
    }
    .print-register-body table {
      table-layout: auto;
    }
    .print-panel-body,
    .print-panel-body .document-view-panel {
      margin: 0 !important;
    }
    th, td {
      padding: 0.35rem 0.4rem;
      font-size: 0.72rem;
    }
  }
`;

const makePngLogo = (logoUrl = "") => {
  return resolveBrandLogo(logoUrl);
};

const collectHeadStyles = () => {
  if (typeof document === "undefined") {
    return "";
  }
  const styles = Array.from(
    document.querySelectorAll("style, link[rel='stylesheet']")
  );
  return styles.map((node) => node.outerHTML).join("\n");
};

const buildDocument = ({
  title,
  subtitle,
  metaRows,
  body,
  logoUrl,
  brandName,
  brandDescription,
  headStyles = "",
  showHeader = true,
  bodyClass = "",
  pageOrientation = "portrait",
}) => {
  const formattedMeta =
    Array.isArray(metaRows) && metaRows.length
      ? `<div class="print-meta-grid">
          ${metaRows
            .map(
              (row) => `
                <div class="print-meta-item">
                  <span class="print-meta-label">${row.label}</span>
                  <span class="print-meta-value">${row.value ?? "-"}</span>
                </div>
              `
            )
            .join("")}
        </div>`
      : "";

  const normalizedLogo = makePngLogo(logoUrl);
  const normalizedBrandName = brandName || "Bangalore Electronics";
  const normalizedBrandDescription = brandDescription || "Company address";
  const brandHeader =
    normalizedLogo || normalizedBrandName || normalizedBrandDescription
      ? `<div class="print-brand">
          ${
            normalizedLogo
              ? `<img src="${normalizedLogo}" alt="Company logo" class="print-brand-logo" onerror="this.onerror=null;this.src='${defaultBrandLogoUrl}'" />`
              : ""
          }
          <div class="print-brand-text">
            ${normalizedBrandName ? `<p class="print-brand-name">${normalizedBrandName}</p>` : ""}
            ${normalizedBrandDescription ? `<p class="print-brand-desc">${normalizedBrandDescription}</p>` : ""}
          </div>
        </div>`
      : "";

  return `<!doctype html>
    <html>
      <head>
        <title>${title}</title>
        ${headStyles}
        <style>${commonStyles}
          @page { size: A4 ${pageOrientation === "landscape" ? "landscape" : "portrait"}; }
        </style>
      </head>
      <body>
        <main class="print-page">
          ${
            showHeader
              ? `<header class="print-header">
                  <div class="print-title">${title}</div>
                  ${subtitle ? `<p class="print-subtitle">${subtitle}</p>` : ""}
                  ${brandHeader}
                  ${formattedMeta}
                </header>`
              : ""
          }
          <section class="print-body ${bodyClass}">
            ${body}
          </section>
        </main>
      </body>
    </html>`;
};

const safeOpen = () => {
  try {
    return window.open("", "_blank");
  } catch {
    return null;
  }
};

const wait = (ms) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const waitForNode = async (selector, timeoutMs = 900) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const node = document.querySelector(selector);
    if (node) {
      return node;
    }
    // Let React finish rendering async state updates before trying again.
    await wait(30);
  }
  return null;
};

const getDirectChildUnderRoot = (root, node) => {
  let current = node;
  while (current && current.parentElement && current.parentElement !== root) {
    current = current.parentElement;
  }
  return current && current.parentElement === root ? current : null;
};

const removeInteractiveRegisterBlocks = (root) => {
  const containersToRemove = new Set();
  root.querySelectorAll("input, select, textarea").forEach((field) => {
    const directChild = getDirectChildUnderRoot(root, field);
    if (directChild && !directChild.querySelector("table")) {
      containersToRemove.add(directChild);
    }
  });
  containersToRemove.forEach((node) => node.remove());
};

const stripActionColumns = (root) => {
  root.querySelectorAll("table").forEach((table) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (!rows.length) {
      return;
    }

    const candidateIndices = new Set();
    const headerRow =
      table.querySelector("thead tr:last-child") ??
      rows.find((row) => row.querySelector("th")) ??
      null;

    if (headerRow) {
      Array.from(headerRow.children).forEach((cell, index) => {
        const label = String(cell.textContent ?? "").trim().toLowerCase();
        if (["action", "actions", "print"].includes(label)) {
          candidateIndices.add(index);
        }
      });
    }

    if (!candidateIndices.size) {
      const width = Math.max(
        ...rows.map((row) =>
          Array.from(row.children).filter((cell) =>
            /^(TH|TD)$/i.test(cell.tagName)
          ).length
        ),
        0
      );
      for (let index = 0; index < width; index += 1) {
        const columnCells = rows
          .map((row) =>
            Array.from(row.children).filter((cell) =>
              /^(TH|TD)$/i.test(cell.tagName)
            )[index] ?? null
          )
          .filter(Boolean);
        if (!columnCells.length) {
          continue;
        }
        const containsInteractive = columnCells.some(
          (cell) => cell.querySelector("button, a[href], svg") || !String(cell.textContent ?? "").trim()
        );
        const allBodyEmpty = columnCells
          .filter((cell) => cell.tagName === "TD")
          .every((cell) => !String(cell.textContent ?? "").trim());
        if (containsInteractive && allBodyEmpty) {
          candidateIndices.add(index);
        }
      }
    }

    Array.from(candidateIndices)
      .sort((left, right) => right - left)
      .forEach((index) => {
        rows.forEach((row) => {
          const cells = Array.from(row.children).filter((cell) =>
            /^(TH|TD)$/i.test(cell.tagName)
          );
          const target = cells[index];
          if (target) {
            target.remove();
          }
        });
      });
  });
};

const cleanupEmptyNodes = (root) => {
  const candidates = Array.from(
    root.querySelectorAll("div, section, article, aside, header, footer")
  ).reverse();
  candidates.forEach((node) => {
    if (node.querySelector("table, img")) {
      return;
    }
    const text = String(node.textContent ?? "").replace(/\s+/g, " ").trim();
    const hasMeaningfulChild = Array.from(node.children).some((child) =>
      /^(TABLE|IMG|H1|H2|H3|H4|H5|H6|P|SPAN|STRONG|SMALL)$/i.test(child.tagName)
    );
    if (!text && !hasMeaningfulChild) {
      node.remove();
    }
  });
};

const sanitizeCloneForPrint = (clone, { isPanelPrint = false } = {}) => {
  clone.querySelectorAll(".print-hidden, button").forEach((element) => {
    element.remove();
  });

  if (isPanelPrint) {
    return clone;
  }

  removeInteractiveRegisterBlocks(clone);
  clone.querySelectorAll("input, select, textarea").forEach((element) => {
    element.remove();
  });
  stripActionColumns(clone);
  cleanupEmptyNodes(clone);
  return clone;
};

const fitPrintDocument = (printWindow) => {
  try {
    const page = printWindow.document.querySelector(".print-page");
    if (!page) {
      return;
    }
    page.style.removeProperty("zoom");
  } catch {
    // Best-effort print fitting only.
  }
};

const printWhenReady = (printWindow) => {
  let printed = false;
  const run = () => {
    if (printed) {
      return;
    }
    printed = true;
    try {
      fitPrintDocument(printWindow);
      printWindow.focus();
      printWindow.print();
    } catch {
      // no-op
    }
  };

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(run, 120);
  } else {
    printWindow.addEventListener(
      "load",
      () => {
        window.setTimeout(run, 120);
      },
      { once: true }
    );
    // Fallback if load event is delayed.
    window.setTimeout(run, 350);
  }

  printWindow.onafterprint = () => {
    try {
      printWindow.close();
    } catch {
      // no-op
    }
  };
};

export const printSection = async ({
  selector,
  title = "Register",
  subtitle,
  metaRows,
  logoUrl,
  brandName,
  brandDescription,
  pageOrientation = "portrait",
}) => {
  if (typeof document === "undefined") {
    return;
  }
  const node = await waitForNode(selector);
  if (!node) {
    return;
  }
  const isPanelPrint =
    selector.includes("view-panel") || selector.includes("print-panel");
  const clone = sanitizeCloneForPrint(node.cloneNode(true), { isPanelPrint });
  const bodyHtml = isPanelPrint ? clone.outerHTML : clone.innerHTML;
  const printWindow = safeOpen();
  if (!printWindow) {
    return;
  }
  printWindow.document.open();
  printWindow.document.write(
    buildDocument({
      title,
      subtitle,
      metaRows,
      logoUrl,
      brandName,
      brandDescription,
      headStyles: collectHeadStyles(),
      showHeader: !isPanelPrint,
      bodyClass: isPanelPrint ? "print-panel-body" : "print-register-body",
      pageOrientation,
      body: bodyHtml,
    })
  );
  printWindow.document.close();
  printWhenReady(printWindow);
};

const openStyledWindow = ({
  title,
  subtitle,
  metaRows,
  logoUrl,
  brandName,
  brandDescription,
  body = "",
  showHeader = true,
}) => {
  if (typeof document === "undefined") {
    return null;
  }
  const viewWindow = safeOpen();
  if (!viewWindow) {
    return null;
  }
  viewWindow.document.open();
  viewWindow.document.write(
    buildDocument({
      title,
      subtitle,
      metaRows,
      logoUrl,
      brandName,
      brandDescription,
      headStyles: collectHeadStyles(),
      showHeader,
      body,
    })
  );
  viewWindow.document.close();
  viewWindow.focus();
  return viewWindow;
};

export const openStyledView = (options) => openStyledWindow(options);
