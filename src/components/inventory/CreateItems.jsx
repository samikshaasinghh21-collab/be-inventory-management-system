import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInventory } from "../../context/InventoryContext";

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
  const { addItem } = useInventory();

  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [gst, setGst] = useState("None");
  const [category, setCategory] = useState("");
  const [hsn, setHsn] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      {/* Modal */}
      <div className="bg-white w-[1000px] rounded-xl shadow-xl overflow-hidden border">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Create New Item</h2>
          <button
            onClick={() => navigate(-1)}
            className="text-xl text-slate-500 hover:text-black"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex">

          {/* LEFT SIDEBAR */}
          <div className="w-60 border-r p-4 text-base">
            <div className="mb-4 font-medium text-indigo-600 bg-indigo-50 px-3 py-2 rounded flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/></svg>
              Basic Details *
            </div>

            <p className="text-slate-600 mb-3">Advance Details</p>

            <ul className="space-y-3 text-slate-600">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
                Stock Details
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/></svg>
                Pricing Details
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
                Party Wise Prices
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg>
                Custom Fields
              </li>
            </ul>
          </div>

          {/* RIGHT FORM */}
          <div className="flex-1 p-6 space-y-6">

            {/* Item Type */}
            <div>
              <p className="text-base font-medium mb-2">Item Type *</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 border px-4 py-3 rounded cursor-pointer text-base">
                  <input type="radio" name="type" defaultChecked />
                  Product
                </label>
                <label className="flex items-center gap-2 border px-4 py-3 rounded cursor-pointer text-base">
                  <input type="radio" name="type" />
                  Service
                </label>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-base font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 border rounded px-4 py-3 text-base"
              >
                <option value="">Select Category</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Item Name */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-base font-medium">Item Name *</label>
                <input
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  type="text"
                  placeholder="ex: Maggie 20gm"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                />
              </div>

              <div className="flex items-center gap-2 mt-6">
                <span className="text-base text-slate-600">
                  Show Item in Online Store
                </span>
                <input type="checkbox" />
              </div>
            </div>

            {/* HSN Code & Description */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-base font-medium">HSN Code</label>
                <input
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  type="text"
                  placeholder="ex: 190590"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                />
              </div>

              <div>
                <label className="text-base font-medium">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  type="text"
                  placeholder="Optional description"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                />
              </div>
            </div>

            {/* Price & Tax */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-base font-medium">Sales Price</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  type="text"
                  placeholder="₹ ex: 200"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                />
              </div>

              <div>
                <label className="text-base font-medium">GST Tax Rate (%)</label>
                <select
                  value={gst}
                  onChange={(e) => setGst(e.target.value)}
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                >
                  {GST_OPTIONS.map((gst) => (
                    <option key={gst} value={gst}>
                      {gst}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Unit & Stock */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-base font-medium">Measuring Unit</label>
                
                  <option>Pieces (PCS)</option>
                  <label className="text-base font-medium">Measuring Unit</label>
<select className="w-full mt-1 border rounded px-4 py-3 text-base">
  {/* Quantity */}
  <optgroup label="Quantity">
    <option>Pieces (PCS)</option>
    <option>Nos (NOS)</option>
    <option>Units (UNT)</option>
    <option>Dozen (DOZ)</option>
    <option>Box (BOX)</option>
    <option>Packet (PKT)</option>
    <option>Bundle (BDL)</option>
  </optgroup>

  {/* Weight */}
  <optgroup label="Weight">
    <option>Gram (GM)</option>
    <option>Kilogram (KG)</option>
    <option>Milligram (MG)</option>
    <option>Quintal (QTL)</option>
    <option>Tonne (TON)</option>
  </optgroup>

  {/* Volume */}
  <optgroup label="Volume">
    <option>Millilitre (ML)</option>
    <option>Litre (LTR)</option>
    <option>Cubic Meter (CBM)</option>
  </optgroup>

  {/* Length */}
  <optgroup label="Length">
    <option>Centimeter (CM)</option>
    <option>Meter (MTR)</option>
    <option>Inch (IN)</option>
    <option>Foot (FT)</option>
  </optgroup>

  {/* Area */}
  <optgroup label="Area">
    <option>Square Feet (SQFT)</option>
    <option>Square Meter (SQM)</option>
  </optgroup>

  {/* Time */}
  <optgroup label="Time">
    <option>Hour (HR)</option>
    <option>Day (DAY)</option>
    <option>Month (MON)</option>
    <option>Year (YR)</option>
  </optgroup>
</select>

               
              </div>

              <div>
                <label className="text-base font-medium">Opening Stock</label>
                <input
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  type="text"
                  placeholder="ex: 150 PCS"
                  className="w-full mt-1 border rounded px-4 py-3 text-base"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 border rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              addItem({
                id: Date.now(),
                name: itemName,
                category,
                price: Number(price),
                stock: Number(stock),
                gst,
                hsn,
                description,
              });

              navigate("/inventory");
            }}
            className="px-5 py-2 bg-indigo-600 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateItems;
