import { useEffect, useMemo, useState } from "react";
import { fetchItems } from "../../services/inventoryApi";
import { getProducts } from "../../services/productsStore";
import {
  formatTaxPercentage,
  parseTaxPercentage,
} from "../../utils/taxUtils";
import { formatInrCurrency, roundUnitPrice } from "../../utils/formatters";
import AppIcon from "../layout/AppIcon";

const createEmptyItem = (extraFieldKey = "notes") => {
  const base = {
    id: Date.now() + Math.random(),
    name: "",
    description: "",
    unit: "PCS",
    hsn: "",
    gst: "",
    serialNumber: "",
    itemId: null,
    availableQty: null,
    inventoryQty: null,
    currentStock: null,
    stock: null,
    quantity: "",
    rate: "",
    notes: "",
  };

  if (extraFieldKey && extraFieldKey !== "notes") {
    base[extraFieldKey] = "";
  }

  return base;
};

const sanitizeNumericValue = (value) => String(value ?? "").replace(/\D/g, "");

const normalizeCatalogItem = (item = {}) => {
  const rate = roundUnitPrice(item.rate ?? item.price ?? item.salesPrice ?? item.unitPrice ?? 0);
  const rawStock =
    item.availableQty ??
    item.AvailableQty ??
    item.currentStock ??
    item.CurrentStock ??
    item.stock ??
    item.Stock ??
    null;
  const availableQty = Number.isFinite(Number(rawStock)) ? Number(rawStock) : null;
  const taxPercentage = parseTaxPercentage(
    item.taxPercentage ?? item.gst ?? item.GST ?? 0
  );
  return {
    id: item.id ?? item.ItemId ?? null,
    itemId: item.itemId ?? item.ItemId ?? item.id ?? null,
    name: String(item.name ?? item.Name ?? "").trim(),
    description: item.description ?? item.Description ?? "",
    unit: item.unit ?? item.Unit ?? "PCS",
    hsn: item.hsn ?? item.HSN ?? "",
    gst:
      String(item.gst ?? item.GST ?? "").trim() ||
      formatTaxPercentage(taxPercentage),
    taxPercentage,
    rate,
    availableQty,
    inventoryQty: availableQty,
    currentStock: availableQty,
    stock: availableQty,
    serialRequired:
      item.serialRequired ?? item.SerialRequired ?? item.IsSerialTracked ?? false,
    serialNumber:
      item.serialNumber ?? item.SerialNumber ?? item.SerialNumbe ?? "",
  };
};

const mergeCatalogItems = (primaryItems = [], secondaryItems = []) => {
  const merged = new Map();
  [...primaryItems, ...secondaryItems]
    .map(normalizeCatalogItem)
    .filter((item) => item.name)
    .forEach((item) => {
      const key = String(item.id ?? item.itemId ?? item.name).toLowerCase();
      if (!merged.has(key)) {
        merged.set(key, item);
      }
    });
  return Array.from(merged.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
};

const LineItemsEditor = ({
  items,
  onChange,
  title = "Line Items",
  onPickFromProducts,
  pickLabel = "Add from Products",
  showHsnGst = false,
  hsnLabel = "HSN / SAC",
  gstLabel = "GST",
  hsnPlaceholder = "HSN",
  gstPlaceholder = "GST",
  showSerialNumber = false,
  serialNumberLabel = "Serial Number",
  serialNumberPlaceholder = "Serial number",
  extraFieldKey = "notes",
  extraFieldLabel = "Notes",
  extraFieldPlaceholder = "Notes",
  priceLabel = "Rate",
  readOnly = false,
  hiddenCatalogItemIds = [],
  hiddenCatalogItemNames = [],
  hideSelectedCatalogItems = false,
  unitNumericOnly = false,
  useInventoryQuantityForQuantity = false,
}) => {
  const [catalogItems, setCatalogItems] = useState(() =>
    mergeCatalogItems(getProducts(), [])
  );
  const catalogListId = useMemo(
    () =>
      `line-items-catalog-${String(title)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-") || "default"}`,
    [title]
  );

  const selectedCatalogKeys = useMemo(() => {
    if (!hideSelectedCatalogItems) {
      return new Set();
    }
    return new Set(
      (items || [])
        .map((item) => {
          const numericId = Number.parseInt(item.itemId ?? item.id ?? "", 10);
          if (Number.isFinite(numericId) && numericId > 0) {
            return `id:${numericId}`;
          }
          const normalizedName = String(item.name ?? "").trim().toLowerCase();
          return normalizedName ? `name:${normalizedName}` : null;
        })
        .filter(Boolean)
    );
  }, [hideSelectedCatalogItems, items]);

  const availableCatalogItems = useMemo(() => {
    const blockedIds = new Set(
      (Array.isArray(hiddenCatalogItemIds) ? hiddenCatalogItemIds : [])
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    const blockedNames = new Set(
      (Array.isArray(hiddenCatalogItemNames) ? hiddenCatalogItemNames : [])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean)
    );

    return catalogItems.filter((catalogItem) => {
      const itemId = Number.parseInt(
        catalogItem.itemId ?? catalogItem.id ?? "",
        10
      );
      const normalizedName = String(catalogItem.name ?? "")
        .trim()
        .toLowerCase();
      if (Number.isFinite(itemId) && itemId > 0 && blockedIds.has(itemId)) {
        return false;
      }
      if (normalizedName && blockedNames.has(normalizedName)) {
        return false;
      }
      if (hideSelectedCatalogItems) {
        const selectionKey =
          Number.isFinite(itemId) && itemId > 0
            ? `id:${itemId}`
            : normalizedName
            ? `name:${normalizedName}`
            : null;
        if (selectionKey && selectedCatalogKeys.has(selectionKey)) {
          return false;
        }
      }
      return true;
    });
  }, [
    catalogItems,
    hiddenCatalogItemIds,
    hiddenCatalogItemNames,
    hideSelectedCatalogItems,
    selectedCatalogKeys,
  ]);

  useEffect(() => {
    let active = true;

    const syncCatalog = async () => {
      const storedItems = getProducts();
      if (active) {
        setCatalogItems(mergeCatalogItems(storedItems, []));
      }
      try {
        const apiItems = await fetchItems();
        if (!active) {
          return;
        }
        setCatalogItems(mergeCatalogItems(apiItems, storedItems));
      } catch {
        // Keep the locally cached catalog when the API is unavailable.
      }
    };

    const handleProductsChanged = () => {
      setCatalogItems((current) => mergeCatalogItems(getProducts(), current));
    };

    void syncCatalog();
    if (typeof window !== "undefined") {
      window.addEventListener("products:changed", handleProductsChanged);
    }
    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("products:changed", handleProductsChanged);
      }
    };
  }, []);

  useEffect(() => {
    if (!unitNumericOnly) {
      return;
    }

    const nextItems = (items || []).map((item) => ({
      ...item,
      unit: sanitizeNumericValue(item.unit),
    }));
    const hasChanged = nextItems.some(
      (item, index) => item.unit !== (items || [])[index]?.unit
    );

    if (hasChanged) {
      onChange(nextItems);
    }
  }, [items, onChange, unitNumericOnly]);

  const formatCurrency = formatInrCurrency;

  const handleAdd = () => {
    onChange([...(items || []), createEmptyItem(extraFieldKey)]);
  };

  const handleRemove = (id) => {
    const next = (items || []).filter((item) => item.id !== id);
    if (next.length === 0) {
      onChange([createEmptyItem(extraFieldKey)]);
      return;
    }
    onChange(next);
  };

  const handleUpdate = (id, field, value) => {
    let nextValue = value;
    if (field === "unit" && unitNumericOnly) {
      nextValue = sanitizeNumericValue(value);
    } else if (field === "rate" && value !== "") {
      nextValue = String(roundUnitPrice(value));
    }
    const next = (items || []).map((item) =>
      item.id === id
        ? {
            ...item,
            [field]: nextValue,
            ...(field === "gst"
              ? { taxPercentage: parseTaxPercentage(value) }
              : {}),
          }
        : item
    );
    onChange(next);
  };

  const handleNameChange = (id, value) => {
    const normalizedValue = String(value ?? "").trim().toLowerCase();
    const matchedCatalogItem =
      availableCatalogItems.find(
        (catalogItem) => catalogItem.name.toLowerCase() === normalizedValue
      ) ?? null;

    const next = (items || []).map((item) => {
      if (item.id !== id) {
        return item;
      }
      if (!matchedCatalogItem) {
        return {
          ...item,
          name: value,
        };
      }

      return {
        ...item,
        itemId: matchedCatalogItem.itemId ?? item.itemId ?? null,
        name: matchedCatalogItem.name,
        description: matchedCatalogItem.description || item.description,
        unit: unitNumericOnly
          ? sanitizeNumericValue(matchedCatalogItem.unit || item.unit)
          : matchedCatalogItem.unit || item.unit,
        hsn: matchedCatalogItem.hsn || item.hsn,
        gst: matchedCatalogItem.gst || item.gst,
        taxPercentage:
          matchedCatalogItem.taxPercentage ?? item.taxPercentage ?? 0,
        rate:
          matchedCatalogItem.rate || matchedCatalogItem.rate === 0
            ? roundUnitPrice(matchedCatalogItem.rate)
            : item.rate,
        availableQty: matchedCatalogItem.availableQty ?? item.availableQty ?? null,
        inventoryQty: matchedCatalogItem.inventoryQty ?? item.inventoryQty ?? null,
        currentStock: matchedCatalogItem.currentStock ?? item.currentStock ?? null,
        stock: matchedCatalogItem.stock ?? item.stock ?? null,
        quantity:
          useInventoryQuantityForQuantity &&
          Number.isFinite(Number(matchedCatalogItem.availableQty))
            ? Number(matchedCatalogItem.availableQty)
            : item.quantity,
        serialRequired:
          matchedCatalogItem.serialRequired ?? item.serialRequired ?? false,
        serialNumber: matchedCatalogItem.serialNumber || item.serialNumber,
      };
    });
    onChange(next);
  };

  const total = (items || []).reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const rate = roundUnitPrice(item.rate);
    return sum + qty * rate;
  }, 0);

  return (
    <div className="line-items-editor rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {onPickFromProducts && (
            <button
              type="button"
              onClick={onPickFromProducts}
              disabled={readOnly}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 text-xs font-medium hover:border-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <AppIcon name="package" className="h-4 w-4" />
              {pickLabel}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              Add Item
            </button>
          )}
        </div>
      </div>
      <div className="line-items-scroll overflow-auto">
        <table className="min-w-[1250px] text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left min-w-[180px]">Item</th>
              <th className="p-3 text-left min-w-[160px]">Description</th>
              {showHsnGst && (
                <th className="p-3 text-left min-w-[110px]">{hsnLabel}</th>
              )}
              {showHsnGst && (
                <th className="p-3 text-left min-w-[110px]">{gstLabel}</th>
              )}
              {showSerialNumber && (
                <th className="p-3 text-left min-w-[150px]">{serialNumberLabel}</th>
              )}
              <th className="p-3 text-left min-w-[90px]">Unit</th>
              <th className="p-3 text-left min-w-[90px]">Qty</th>
              <th className="p-3 text-right min-w-[130px]">{priceLabel}</th>
              <th className="p-3 text-right min-w-[140px]">Amount</th>
              <th className="p-3 text-left min-w-[160px]">{extraFieldLabel}</th>
              {!readOnly && (
                <th className="p-3 text-left min-w-[80px]">Action</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(items || []).map((item) => {
              const resolvedExtraFieldValue =
                item[extraFieldKey] ??
                (extraFieldKey !== "notes" ? item.notes ?? "" : "");
              const qty = Number(item.quantity) || 0;
              const rate = roundUnitPrice(item.rate);
              const amount = qty * rate;
              return (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.name}
                      list={catalogListId}
                      disabled={readOnly}
                      onChange={(event) =>
                        handleNameChange(item.id, event.target.value)
                      }
                      placeholder="Item name"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.description}
                      disabled={readOnly}
                      onChange={(event) =>
                        handleUpdate(item.id, "description", event.target.value)
                      }
                      placeholder="Specs or details"
                      className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>
                  {showHsnGst && (
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.hsn ?? ""}
                        disabled={readOnly}
                        onChange={(event) =>
                          handleUpdate(item.id, "hsn", event.target.value)
                        }
                        placeholder={hsnPlaceholder}
                        className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </td>
                  )}
                  {showHsnGst && (
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.gst ?? ""}
                        disabled={readOnly}
                        onChange={(event) =>
                          handleUpdate(item.id, "gst", event.target.value)
                        }
                        placeholder={gstPlaceholder}
                        className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </td>
                  )}
                  {showSerialNumber && (
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.serialNumber ?? ""}
                        disabled={readOnly}
                        onChange={(event) =>
                          handleUpdate(item.id, "serialNumber", event.target.value)
                        }
                        placeholder={serialNumberPlaceholder}
                        className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </td>
                  )}
                  <td className="p-3">
                    <input
                      type="text"
                      inputMode={unitNumericOnly ? "numeric" : undefined}
                      pattern={unitNumericOnly ? "[0-9]*" : undefined}
                      value={unitNumericOnly ? sanitizeNumericValue(item.unit) : item.unit}
                      disabled={readOnly}
                      onBeforeInput={(event) => {
                        if (
                          unitNumericOnly &&
                          event.data &&
                          /\D/.test(event.data)
                        ) {
                          event.preventDefault();
                        }
                      }}
                      onPaste={(event) => {
                        if (!unitNumericOnly) {
                          return;
                        }
                        event.preventDefault();
                        handleUpdate(
                          item.id,
                          "unit",
                          event.clipboardData.getData("text")
                        );
                      }}
                      onChange={(event) =>
                        handleUpdate(item.id, "unit", event.target.value)
                      }
                      placeholder={unitNumericOnly ? "0" : "PCS"}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      disabled={readOnly}
                      onChange={(event) =>
                        handleUpdate(item.id, "quantity", event.target.value)
                      }
                      className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.rate === "" ? "" : roundUnitPrice(item.rate)}
                      disabled={readOnly}
                      onChange={(event) =>
                        handleUpdate(item.id, "rate", event.target.value)
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-right disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>
                  <td className="p-3 text-right font-medium text-slate-700">
                    {formatCurrency(amount)}
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={resolvedExtraFieldValue}
                      disabled={readOnly}
                      onChange={(event) =>
                        handleUpdate(item.id, extraFieldKey, event.target.value)
                      }
                      placeholder={extraFieldPlaceholder}
                      className="w-full border border-slate-200 rounded-md px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </td>
                  {!readOnly && (
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        className="text-red-600 text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <datalist id={catalogListId}>
        {availableCatalogItems.map((catalogItem) => (
          <option key={catalogItem.id ?? catalogItem.name} value={catalogItem.name} />
        ))}
      </datalist>
      <div className="mt-3 flex justify-end text-sm text-slate-600">
        <span className="font-medium text-slate-800 mr-2">Total:</span>
        {formatCurrency(total)}
      </div>
    </div>
  );
};

export default LineItemsEditor;
