import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createItem } from "../../services/inventoryApi";

const GST_OPTIONS = [
  "None",
  "Exempted",
  "GST @ 0%",
  "GST @ 0.1%",
  "GST @ 0.25%",
  "GST @ 1.5%",
  "GST @ 3%",
  "GST @ 5%",
  "GST @ 6%",
  "GST @ 8.9%",
  "GST @ 12%",
  "GST @ 13.8%",
  "GST @ 14% + cess @ 12%",
  "GST @ 18%",
  "GST @ 28%",
  "GST @ 28% + Cess @ 5%",
  "GST @ 28% + Cess @ 36%",
  "GST @ 28% + Cess @ 60%",
  "GST @ 40%",
];

const CATEGORIES = [
  "Snack",
  "Beverages",
  "Electronics",
  "Stationery",
  "Construction",
];

const CreateItems = () => {
  const navigate = useNavigate();

  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [gst, setGst] = useState("None");
  const [category, setCategory] = useState("");
  const [hsn, setHsn] = useState("");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    try {
      await createItem({
        name: itemName,
        category,
        hsn,
        stock: Number(stock),
        price: Number(price),
        gst,
        description,
      });

      navigate("/inventory");
    } catch (error) {
      console.error("Create item failed:", error);
      setSubmitError(error?.message || "Failed to save item.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
      <div className="bg-white w-[1100px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Inventory
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Item
            </h2>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
            aria-label="Close"
            type="button"
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left Sidebar */}
          <aside className="w-64 border-r bg-slate-50 p-5 shrink-0">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-4">
              Sections
            </p>
            <div className="space-y-2 text-sm">
              <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-900 shadow-sm">
                Basic Information
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Pricing and Tax
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Stock and Unit
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Optional Details
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6">
              Fields marked with * are required.
            </p>
          </aside>

          {/* Right Form */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <form id="create-item-form" className="space-y-6" onSubmit={handleSubmit}>
              {/* Basic Info */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800">
                    Basic Information
                  </h3>
                  <span className="text-xs text-slate-500">Required</span>
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      Item Type *
                    </p>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 border border-slate-200 px-4 py-2.5 rounded-lg cursor-pointer text-sm text-slate-700 hover:border-slate-300">
                        <input type="radio" name="type" defaultChecked />
                        Product
                      </label>
                      <label className="flex items-center gap-2 border border-slate-200 px-4 py-2.5 rounded-lg cursor-pointer text-sm text-slate-700 hover:border-slate-300">
                        <input type="radio" name="type" />
                        Service
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Category
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      >
                        <option value="">Select Category</option>
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Item Name *
                      </label>
                      <input
                        value={itemName}
                        onChange={(e) => setItemName(e.target.value)}
                        type="text"
                        placeholder="Ex: Maggie 20gm"
                        className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Online Store
                      </p>
                      <p className="text-xs text-slate-500">
                        Show this item in your online catalog
                      </p>
                    </div>
                    <input type="checkbox" className="h-4 w-4" />
                  </div>
                </div>
              </section>

              {/* Compliance and Description */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Optional Details
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      HSN Code
                    </label>
                    <input
                      value={hsn}
                      onChange={(e) => setHsn(e.target.value)}
                      type="text"
                      placeholder="Ex: 190590"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Description
                    </label>
                    <input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      type="text"
                      placeholder="Optional description"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Pricing */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Pricing and Tax
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Sales Price
                    </label>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      type="text"
                      placeholder="INR ex: 200"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      GST Tax Rate (%)
                    </label>
                    <select
                      value={gst}
                      onChange={(e) => setGst(e.target.value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      {GST_OPTIONS.map((gstOption) => (
                        <option key={gstOption} value={gstOption}>
                          {gstOption}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Stock */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Stock and Unit
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Measuring Unit
                    </label>
                    <select className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none">
                      <optgroup label="Quantity">
                        <option>Pieces (PCS)</option>
                        <option>Nos (NOS)</option>
                        <option>Units (UNT)</option>
                        <option>Dozen (DOZ)</option>
                        <option>Box (BOX)</option>
                        <option>Packet (PKT)</option>
                        <option>Bundle (BDL)</option>
                      </optgroup>
                      <optgroup label="Weight">
                        <option>Gram (GM)</option>
                        <option>Kilogram (KG)</option>
                        <option>Milligram (MG)</option>
                        <option>Quintal (QTL)</option>
                        <option>Tonne (TON)</option>
                      </optgroup>
                      <optgroup label="Volume">
                        <option>Millilitre (ML)</option>
                        <option>Litre (LTR)</option>
                        <option>Cubic Meter (CBM)</option>
                      </optgroup>
                      <optgroup label="Length">
                        <option>Centimeter (CM)</option>
                        <option>Meter (MTR)</option>
                        <option>Inch (IN)</option>
                        <option>Foot (FT)</option>
                      </optgroup>
                      <optgroup label="Area">
                        <option>Square Feet (SQFT)</option>
                        <option>Square Meter (SQM)</option>
                      </optgroup>
                      <optgroup label="Time">
                        <option>Hour (HR)</option>
                        <option>Day (DAY)</option>
                        <option>Month (MON)</option>
                        <option>Year (YR)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Opening Stocks       
                    </label>
                    <input
                      value={stock}
                      onChange={(e) => setStock(e.target.value)}
                      type="text"
                      placeholder="Ex: 150 PCS"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                </div>
              </section>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          {submitError ? (
            <p className="text-xs text-red-600">{submitError}</p>
          ) : (
            <p className="text-xs text-slate-500">
              Saved items will appear in the Inventory list.
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              Cancel
            </button>
            <button
              form="create-item-form"
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Save Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateItems;
