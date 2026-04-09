import { useEffect, useMemo, useState } from "react";
import { defaultBrandLogoUrl, resolveBrandLogo } from "../../utils/branding";
import { printSection } from "../../utils/printUtils";

const toDisplay = (value) => {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  return String(value);
};

const DocumentViewPanel = ({
  id,
  title = "DOCUMENT",
  onClose,
  companyName = "Bangalore Electronics",
  companyAddress = "Company address",
  companyGstin = "",
  companyPhone = "",
  companyEmail = "",
  hideCompanyEmail = false,
  logoUrl = "",
  primaryPairs = [],
  leftBlockTitle = "",
  leftBlockLines = [],
  rightBlockTitle = "",
  rightBlockLines = [],
  tableColumns = [],
  tableRows = [],
  bottomLeftTitle = "",
  bottomLeftValue = "",
  bottomRightTitle = "",
  bottomRightValue = "",
  bottomLeftContent = null,
  bottomRightContent = null,
  footerNote = "Any changes in GST & taxes are acceptable to you.",
  footerCompanyName = "Bangalore Electronics",
  hideFooterNote = false,
}) => {
  const normalizedLogo = useMemo(() => resolveBrandLogo(logoUrl), [logoUrl]);
  const [resolvedLogo, setResolvedLogo] = useState(normalizedLogo);
  const canPrint = Boolean(id);
  const normalizedCompanyEmail = String(companyEmail ?? "").trim();
  const shouldShowCompanyEmail =
    !hideCompanyEmail &&
    normalizedCompanyEmail &&
    normalizedCompanyEmail.toLowerCase() !== "admin@example.com";
  const hasBottomLeft = Boolean(
    bottomLeftContent || bottomLeftTitle || bottomLeftValue
  );
  const hasBottomRight = Boolean(
    bottomRightContent || bottomRightTitle || bottomRightValue
  );

  useEffect(() => {
    setResolvedLogo(normalizedLogo);
  }, [normalizedLogo]);

  const handlePrint = () => {
    if (!id) {
      return;
    }
    void printSection({
      selector: `#${id}`,
      title,
    });
  };

  return (
    <div
      id={id}
      className="document-view-panel mt-4 border border-slate-800 text-xs text-slate-900 bg-white"
    >
      <div className="border-b border-slate-800 p-2">
        <div className="flex items-center justify-between text-[11px] font-semibold tracking-wide">
          <span>{title}</span>
          <div className="print-hidden flex items-center gap-2">
            {canPrint && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-600 border border-slate-300 rounded-full"
              >
                Print
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-600 border border-slate-300 rounded-full"
              >
                Close view
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
        <div className="p-3 border-r border-slate-800">
          <div className="mb-2">
            <img
              src={resolvedLogo}
              alt={`${companyName || "Company"} logo`}
              className="h-14 w-auto object-contain max-w-[260px]"
              style={{ height: 56, width: "auto", maxWidth: 260, objectFit: "contain" }}
              onError={() => setResolvedLogo(defaultBrandLogoUrl)}
            />
          </div>
          <p className="font-semibold">{toDisplay(companyName)}</p>
          <p className="text-[11px] whitespace-pre-line">
            {toDisplay(companyAddress)}
          </p>
          <p className="text-[11px] mt-1">GST No: {toDisplay(companyGstin)}</p>
          <p className="text-[11px]">Phone: {toDisplay(companyPhone)}</p>
          {shouldShowCompanyEmail ? (
            <p className="text-[11px]">Email: {toDisplay(companyEmail)}</p>
          ) : null}
        </div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {primaryPairs.map((row) => (
              <div key={row.label} className="contents">
                <p className="text-slate-600">{row.label}:</p>
                <p className="font-semibold">{toDisplay(row.value)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(leftBlockTitle || rightBlockTitle) && (
        <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
          <div className="p-3 border-r border-slate-800">
            <p className="font-semibold">{toDisplay(leftBlockTitle)}</p>
            {leftBlockLines.map((line, index) => (
              <p key={`${leftBlockTitle}-${index}`} className="mt-1">
                {toDisplay(line)}
              </p>
            ))}
          </div>
          <div className="p-3">
            <p className="font-semibold">{toDisplay(rightBlockTitle)}</p>
            {rightBlockLines.map((line, index) => (
              <p key={`${rightBlockTitle}-${index}`} className="mt-1">
                {toDisplay(line)}
              </p>
            ))}
          </div>
        </div>
      )}

      <table className="w-full text-[11px] border-b border-slate-800">
        <thead>
          <tr className="border-b border-slate-800">
            {tableColumns.map((column) => (
              <th
                key={column.key}
                className={`p-2 ${column.align === "right" ? "text-right" : "text-left"} ${column.widthClass || ""}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.length === 0 && (
            <tr>
              <td
                className="p-2 text-slate-500 text-center"
                colSpan={Math.max(tableColumns.length, 1)}
              >
                No records to display.
              </td>
            </tr>
          )}
          {tableRows.map((row, index) => (
            <tr
              key={row.id || index}
              className="border-b border-slate-200"
            >
              {tableColumns.map((column) => (
                <td
                  key={`${row.id || index}-${column.key}`}
                  className={`p-2 ${column.align === "right" ? "text-right" : "text-left"}`}
                >
                  {toDisplay(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {(hasBottomLeft || hasBottomRight) && (
        <div className="border-b border-slate-800 text-[11px]">
          {hasBottomLeft && hasBottomRight && (
            <div className="grid grid-cols-2">
              <div className="p-3 border-r border-slate-800">
                {bottomLeftContent ?? (
                  <>
                    <p className="font-semibold">{toDisplay(bottomLeftTitle)}</p>
                    <p>{toDisplay(bottomLeftValue)}</p>
                  </>
                )}
              </div>
              <div className="p-3 text-right">
                {bottomRightContent ?? (
                  <>
                    <p className="font-semibold">{toDisplay(bottomRightTitle)}</p>
                    <p>{toDisplay(bottomRightValue)}</p>
                  </>
                )}
              </div>
            </div>
          )}
          {hasBottomLeft && !hasBottomRight && (
            <div className="p-3">
              {bottomLeftContent ?? (
                <>
                  <p className="font-semibold">{toDisplay(bottomLeftTitle)}</p>
                  <p>{toDisplay(bottomLeftValue)}</p>
                </>
              )}
            </div>
          )}
          {!hasBottomLeft && hasBottomRight && (
            <div className="p-3 text-right">
              {bottomRightContent ?? (
                <>
                  <p className="font-semibold">{toDisplay(bottomRightTitle)}</p>
                  <p>{toDisplay(bottomRightValue)}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between p-3 text-[11px]">
        <p>{hideFooterNote ? "" : toDisplay(footerNote)}</p>
        <div className="text-right">
          <p className="font-semibold">For {toDisplay(footerCompanyName)}</p>
          <div className="mt-8 border-t border-slate-700 pt-2">
            Authorised Signatory
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewPanel;
