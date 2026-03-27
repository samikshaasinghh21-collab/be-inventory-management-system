import useSettings from "../../hooks/useSettings";

const createEmptyItem = (extraFieldKey = "notes") => {
  const base = {
    id: Date.now() + Math.random(),
    name: "",
    description: "",
    unit: "PCS",
    hsn: "",
    gst: "",
    quantity: "",
    rate: "",
    notes: "",
  };

  if (extraFieldKey && extraFieldKey !== "notes") {
    base[extraFieldKey] = "";
  }

  return base;
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
  extraFieldKey = "notes",
  extraFieldLabel = "Notes",
  extraFieldPlaceholder = "Notes",
  priceLabel = "Rate",
}) => {
  const settings = useSettings();
  const currency = settings?.preferences?.currency || "INR";

  const formatCurrency = (value) => {
    const amount = Number(value) || 0;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  };

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
    const next = (items || []).map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    );
    onChange(next);
  };

  const total = (items || []).reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    return sum + qty * rate;
  }, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {onPickFromProducts && (
            <button
              type="button"
              onClick={onPickFromProducts}
              className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 text-xs font-medium hover:border-slate-300"
            >
              {pickLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
          >
            + Add Item
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
              <th className="p-3 text-left min-w-[90px]">Unit</th>
              <th className="p-3 text-left min-w-[90px]">Qty</th>
              <th className="p-3 text-right min-w-[130px]">{priceLabel}</th>
              <th className="p-3 text-right min-w-[140px]">Amount</th>
              <th className="p-3 text-left min-w-[160px]">{extraFieldLabel}</th>
              <th className="p-3 text-left min-w-[80px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((item) => {
              const resolvedExtraFieldValue =
                item[extraFieldKey] ??
                (extraFieldKey !== "notes" ? item.notes ?? "" : "");
              const qty = Number(item.quantity) || 0;
              const rate = Number(item.rate) || 0;
              const amount = qty * rate;
              return (
                <tr key={item.id} className="border-t">
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(event) =>
                        handleUpdate(item.id, "name", event.target.value)
                      }
                      placeholder="Item name"
                      className="w-full border border-slate-200 rounded-md px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(event) =>
                        handleUpdate(item.id, "description", event.target.value)
                      }
                      placeholder="Specs or details"
                      className="w-full border border-slate-200 rounded-md px-3 py-2"
                    />
                  </td>
                  {showHsnGst && (
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.hsn ?? ""}
                        onChange={(event) =>
                          handleUpdate(item.id, "hsn", event.target.value)
                        }
                        placeholder={hsnPlaceholder}
                        className="w-full border border-slate-200 rounded-md px-3 py-2"
                      />
                    </td>
                  )}
                  {showHsnGst && (
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.gst ?? ""}
                        onChange={(event) =>
                          handleUpdate(item.id, "gst", event.target.value)
                        }
                        placeholder={gstPlaceholder}
                        className="w-full border border-slate-200 rounded-md px-3 py-2"
                      />
                    </td>
                  )}
                  <td className="p-3">
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(event) =>
                        handleUpdate(item.id, "unit", event.target.value)
                      }
                      placeholder="PCS"
                      className="w-full border border-slate-200 rounded-md px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={(event) =>
                        handleUpdate(item.id, "quantity", event.target.value)
                      }
                      className="w-full border border-slate-200 rounded-md px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      min="0"
                      value={item.rate}
                      onChange={(event) =>
                        handleUpdate(item.id, "rate", event.target.value)
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-right"
                    />
                  </td>
                  <td className="p-3 text-right font-medium text-slate-700">
                    {formatCurrency(amount)}
                  </td>
                  <td className="p-3">
                    <input
                      type="text"
                      value={resolvedExtraFieldValue}
                      onChange={(event) =>
                        handleUpdate(item.id, extraFieldKey, event.target.value)
                      }
                      placeholder={extraFieldPlaceholder}
                      className="w-full border border-slate-200 rounded-md px-3 py-2"
                    />
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="text-red-600 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end text-sm text-slate-600">
        <span className="font-medium text-slate-800 mr-2">Total:</span>
        {formatCurrency(total)}
      </div>
    </div>
  );
};

export default LineItemsEditor;
