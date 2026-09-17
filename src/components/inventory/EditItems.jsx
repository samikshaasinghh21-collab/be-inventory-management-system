import InventoryPageHeader from "./InventoryPageHeader";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useInventory } from "../../context/InventoryContext";
import { roundUnitPrice } from "../../utils/formatters";
import { toSafeUppercase } from "../../utils/inputTransform";

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

const EditItems = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { items, updateItem } = useInventory();

  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [gst, setGst] = useState("None");
  const [category, setCategory] = useState("");
  const [hsn, setHsn] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const item = items.find((item) => item.id === parseInt(id));
    if (item) {
      setItemName(item.name || "");
      setPrice(item.price || item.price === 0 ? String(roundUnitPrice(item.price)) : "");
      setStock(item.stock || "");
      setGst(item.gst || "None");
      setCategory(item.category || "");
      setHsn(item.hsn || "");
      setDescription(item.description || "");
    }
  }, [id, items]);

  const handleSave = () => {
    const updatedItem = {
      id: parseInt(id),
      name: itemName,
      category,
      price: roundUnitPrice(price),
      stock: Number(stock),
      gst,
      hsn,
      description,
    };

    updateItem(updatedItem);
    navigate("/inventory");
  };

  return (
    <div className="inventory-full-page-form">
      {/* Modal */}
      <div className="bg-white w-full rounded-xl border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b"><InventoryPageHeader title="Edit material" description="Update product details, stock and pricing in one place." navigation={false} actions={<button type="button" onClick={() => navigate(-1)} className="app-btn app-btn-secondary">Back</button>} /></div>

        {/* Body */}
        <div className="flex">

          {/* RIGHT FORM */}
          <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Item Type */}
            <div>
              <p className="text-sm font-medium mb-2">Item Type *</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 border px-4 py-2 rounded cursor-pointer">
                  <input type="radio" name="type" defaultChecked />
                  Product
                </label>
                <label className="flex items-center gap-2 border px-4 py-2 rounded cursor-pointer">
                  <input type="radio" name="type" />
                  Service
                </label>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-sm font-medium">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 border rounded px-3 py-2"
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
                <label className="text-sm font-medium">Item Name *</label>
                <input
                  value={itemName}
                  onChange={(e) => setItemName(toSafeUppercase(e.target.value))}
                  type="text"
                  placeholder="ex: Maggie 20gm"
                  className="w-full mt-1 border rounded px-3 py-2"
                />
              </div>

              <div className="flex items-center gap-2 mt-6">
                <span className="text-sm text-slate-600">
                  Show Item in Online Store
                </span>
                <input type="checkbox" />
              </div>
            </div>

            {/* HSN Code & Description */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">HSN Code</label>
                <input
                  value={hsn}
                  onChange={(e) => setHsn(toSafeUppercase(e.target.value))}
                  type="text"
                  placeholder="ex: 190590"
                  className="w-full mt-1 border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(toSafeUppercase(e.target.value))}
                  type="text"
                  placeholder="Optional description"
                  className="w-full mt-1 border rounded px-3 py-2"
                />
              </div>
            </div>

            {/* Price & Tax */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Sales Price</label>
                <input
                  value={price}
                  onChange={(e) =>
                    setPrice(e.target.value === "" ? "" : String(roundUnitPrice(e.target.value)))
                  }
                  type="number"
                  min="0"
                  step="1"
                  placeholder="₹ ex: 200"
                  className="w-full mt-1 border rounded px-3 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium">GST Tax Rate (%)</label>
                <select
                  value={gst}
                  onChange={(e) => setGst(e.target.value)}
                  className="w-full mt-1 border rounded px-3 py-2"
                >
                  {GST_OPTIONS.map((gstOption) => (
                    <option key={gstOption} value={gstOption}>
                      {gstOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Unit & Stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Measuring Unit</label>
                <select className="w-full mt-1 border rounded px-3 py-2">
                  <option>Pieces (PCS)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Opening Stock</label>
                <input
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  type="text"
                  placeholder="ex: 150 PCS"
                  className="w-full mt-1 border rounded px-3 py-2"
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
            onClick={handleSave}
            className="px-5 py-2 bg-[var(--primary)] text-white rounded"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditItems;
