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
    max-width: 190mm;
    margin: 0 auto;
    padding: 16px;
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
  .print-body *,
  .document-view-panel * {
    max-width: 100%;
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
    border-collapse: collapse;
    margin-top: 1rem;
    table-layout: fixed;
    page-break-inside: auto;
  }
  tr {
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #e2e8f0;
    padding: 0.55rem 0.65rem;
    font-size: 0.9rem;
    text-align: left;
    vertical-align: top;
    white-space: normal !important;
    overflow-wrap: anywhere;
    word-break: break-word;
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
        <style>${commonStyles}</style>
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
          <section class="print-body">
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

const fitPrintDocument = (printWindow) => {
  try {
    const page = printWindow.document.querySelector(".print-page");
    if (!page) {
      return;
    }
    page.style.removeProperty("zoom");
    const availableWidth =
      printWindow.document.documentElement.clientWidth ||
      printWindow.innerWidth ||
      page.clientWidth;
    const contentWidth = page.scrollWidth;
    if (!availableWidth || !contentWidth || contentWidth <= availableWidth) {
      return;
    }
    const scale = Math.max(0.72, Math.min(1, availableWidth / contentWidth));
    page.style.zoom = String(scale);
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
}) => {
  if (typeof document === "undefined") {
    return;
  }
  const node = await waitForNode(selector);
  if (!node) {
    return;
  }
  const isPanelPrint = selector.includes("view-panel");
  const clone = node.cloneNode(true);
  clone.querySelectorAll(".print-hidden, button").forEach((element) => {
    element.remove();
  });
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
