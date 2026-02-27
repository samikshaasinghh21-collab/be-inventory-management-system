import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveProduct } from "../../services/productsStore";
import { addCategory, getCategories } from "../../services/categoryStore";

const UNIT_OPTIONS = [
  "Nos",
  "PCS",
  "Set",
  "Box",
  "Bundle",
  "Meter",
  "Foot",
  "Kilogram",
  "Litre",
];

const GST_OPTIONS = [
  "None",
  "Exempted",
  "GST @ 0%",
  "GST @ 1.5%",
  "GST @ 3%",
  "GST @ 5%",
  "GST @ 12%",
  "GST @ 18%",
  "GST @ 28%",
];

const CreateProduct = () => {
  const navigate = useNavigate();
  const [productName, setProductName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState(() => getCategories());
  const [newCategory, setNewCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [hsn, setHsn] = useState("");
  const [unit, setUnit] = useState("Nos");
  const [salesPrice, setSalesPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [gst, setGst] = useState("None");
  const [openingStock, setOpeningStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const handleCategoriesChanged = () => setCategories(getCategories());
    setCategories(getCategories());
    window.addEventListener("categories:changed", handleCategoriesChanged);
    return () => {
      window.removeEventListener("categories:changed", handleCategoriesChanged);
    };
  }, []);

  const validate = () => {
    const nextErrors = {};
    if (!productName.trim()) {
      nextErrors.productName = "Product name is required.";
    }
    const rate = Number(salesPrice);
    if (!salesPrice || Number.isNaN(rate) || rate <= 0) {
      nextErrors.salesPrice = "Enter a valid selling price.";
    }
    const cost = Number(costPrice);
    if (costPrice && (Number.isNaN(cost) || cost < 0)) {
      nextErrors.costPrice = "Enter a valid cost price.";
    }
    const stock = Number(openingStock);
    if (openingStock && (Number.isNaN(stock) || stock < 0)) {
      nextErrors.openingStock = "Enter a valid opening stock.";
    }
    const reorder = Number(reorderLevel);
    if (reorderLevel && (Number.isNaN(reorder) || reorder < 0)) {
      nextErrors.reorderLevel = "Enter a valid reorder level.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const payload = {
      id: Date.now(),
      name: productName.trim(),
      sku: sku.trim(),
      category: category.trim(),
      brand: brand.trim(),
      hsn: hsn.trim(),
      unit,
      rate: Number(salesPrice),
      costPrice: costPrice ? Number(costPrice) : 0,
      gst,
      qty: 0,
      openingStock: openingStock ? Number(openingStock) : 0,
      reorderLevel: reorderLevel ? Number(reorderLevel) : 0,
      description: description.trim(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    saveProduct(payload);
    navigate("/inventory/products");
  };

  const handleAddCategory = () => {
    const cleaned = newCategory.trim();
    if (!cleaned) return;
    const updated = addCategory(cleaned);
    setCategories(updated);
    setCategory(cleaned);
    setNewCategory("");
  };

  const clearError = (key) => {
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
      <div className="bg-white w-[1100px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Product Catalog
            </p>
            <h2 className="text-xl font-semibold text-slate-900">
              Create Product
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
                Basic Details
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Pricing & Tax
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Inventory Rules
              </div>
              <div className="px-3 py-2 rounded-lg text-slate-600">
                Notes
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6">
              Fields marked with * are required.
            </p>
          </aside>

          {/* Right Form */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            <form
              id="create-product-form"
              className="space-y-6"
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Basic Details */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800">
                    Basic Details
                  </h3>
                  <span className="text-xs text-slate-500">Required</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Product Name *
                    </label>
                    <input
                      value={productName}
                      onChange={(event) => {
                        setProductName(event.target.value);
                        clearError("productName");
                      }}
                      type="text"
                      placeholder="Ex: MX204-HWBASE-AC-FS"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.productName)}
                    />
                    {errors.productName && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.productName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      SKU / Part No
                    </label>
                    <input
                      value={sku}
                      onChange={(event) => setSku(event.target.value)}
                      type="text"
                      placeholder="Ex: MX204-AC"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Category
                    </label>
                    <div className="space-y-2 mt-1">
                      <select
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      >
                        <option value="">Select Category</option>
                        {categories.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <input
                          value={newCategory}
                          onChange={(event) => setNewCategory(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddCategory();
                            }
                          }}
                          type="text"
                          placeholder="Add new category"
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddCategory}
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-indigo-500 hover:text-indigo-700"
                        >
                          Add
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Add it once and it will stay in the dropdown.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Brand
                    </label>
                    <input
                      value={brand}
                      onChange={(event) => setBrand(event.target.value)}
                      type="text"
                      placeholder="Ex: Juniper"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      HSN / SAC
                    </label>
                    <input
                      value={hsn}
                      onChange={(event) => setHsn(event.target.value)}
                      type="text"
                      placeholder="Ex: 85176290"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Unit
                    </label>
                    <select
                      value={unit}
                      onChange={(event) => setUnit(event.target.value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Pricing & Tax */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Pricing & Tax
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Selling Price *
                    </label>
                    <input
                      value={salesPrice}
                      onChange={(event) => {
                        setSalesPrice(event.target.value);
                        clearError("salesPrice");
                      }}
                      type="text"
                      placeholder="Ex: 568924.43"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.salesPrice)}
                    />
                    {errors.salesPrice && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.salesPrice}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Cost Price
                    </label>
                    <input
                      value={costPrice}
                      onChange={(event) => {
                        setCostPrice(event.target.value);
                        clearError("costPrice");
                      }}
                      type="text"
                      placeholder="Ex: 540000.00"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.costPrice)}
                    />
                    {errors.costPrice && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.costPrice}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      GST Tax Rate
                    </label>
                    <select
                      value={gst}
                      onChange={(event) => setGst(event.target.value)}
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    >
                      {GST_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Inventory Rules */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Inventory Rules
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Opening Stock
                    </label>
                    <input
                      value={openingStock}
                      onChange={(event) => {
                        setOpeningStock(event.target.value);
                        clearError("openingStock");
                      }}
                      type="text"
                      placeholder="Ex: 10"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.openingStock)}
                    />
                    {errors.openingStock && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.openingStock}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Reorder Level
                    </label>
                    <input
                      value={reorderLevel}
                      onChange={(event) => {
                        setReorderLevel(event.target.value);
                        clearError("reorderLevel");
                      }}
                      type="text"
                      placeholder="Ex: 5"
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                      aria-invalid={Boolean(errors.reorderLevel)}
                    />
                    {errors.reorderLevel && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.reorderLevel}
                      </p>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <label className="text-sm font-medium text-slate-700">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Add a detailed description for internal use."
                      className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* Notes */}
              <section className="border border-slate-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-base font-semibold text-slate-800 mb-4">
                  Notes
                </h3>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Internal notes, procurement guidance, or warranty terms."
                  className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                />
              </section>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
          <p className="text-xs text-slate-500">
            Products appear in the catalog for allocation and sales.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              Cancel
            </button>
            <button
              form="create-product-form"
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              Save Product
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProduct;
