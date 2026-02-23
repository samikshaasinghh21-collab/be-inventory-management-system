import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  deleteProduct,
  getProducts,
  setProducts,
  updateProduct,
} from "../../services/productsStore";
 
const initialItems = [
  {
    id: 1,
    name: "MX204-HWBASE-AC-FS",
    description:
      "MX204 Fixed AC System - HW and STD Junos; Feature right to use must be ordered separately",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 568924.43,
  },
  {
    id: 2,
    name: "CBL-EX-PWR-C13-IN",
    description: "AC Power Cable - India (6A/250V, 2.5m)",
    hsn: "854442",
    qty: 0,
    unit: "Nos",
    rate: 1746.77,
  },
  {
    id: 3,
    name: "QSFPP 4X10GE-SR",
    description:
      "QSFP+, 4x10GBASE-SR, MMF OM3 300m and OM4 400m, MPO-12 connector, Std Temp",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 20853.92,
  },
  {
    id: 4,
    name: "SFPP-10G-LR-C",
    description:
      "SFP, 1G, Copper 100m, Standard Temperature, RJ-45 connector",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 2696.76,
  },
  {
    id: 5,
    name: "RJ45 CONNECTOR (SFP-1G-T-C)",
    description:
      "SFP, 1G, Copper 100m, Standard Temperature",
    hsn: "85366990",
    qty: 0,
    unit: "Nos",
    rate: 4208.58,
  },
  {
    id: 6,
    name: "S-MX-4C-A1-C1-P",
    description:
      "SW, MX, 4x100GE ports, Adv1, Class 1, without SW Support, Perpetual",
    hsn: "997331",
    qty: 0,
    unit: "Nos",
    rate: 201567.49,
  },
  {
    id: 7,
    name: "PAR-SUP-MX-4C-A1P",
    description:
      "PSS Basic Support for S-MX-4C-A1-C1-P",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 226849.61,
  },
  {
    id: 8,
    name: "PAR-NDS-MX204-B",
    description:
      "PSS Next Day Ship Support for MX204-HW-BASE",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 206968.67,
  },
  {
    id: 9,
    name: "EX9208-RED3B-AC",
    description:
      "Redundant EX9208 system configuration with chassis, routing engines, switch fabrics, PSUs and blank panels",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 1940647.0,
  },
  {
    id: 10,
    name: "CBL-M-PWR-RA-EU",
    description:
      "M320 AC Power Cable, Europe, Right Angle",
    hsn: "85444299",
    qty: 0,
    unit: "Nos",
    rate: 2083.86,
  },
  {
    id: 11,
    name: "EX9200-40XS",
    description:
      "0-port 10GbE SFP+ line card; MACsec capable; optics sold separately",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 962865.9,
  },
  {
    id: 12,
    name: "SFPP-10G-SR-C",
    description:
      "SFP+, 10GBASE-SR, MMF OM3/OM4, Duplex LC connector, Std Temp",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 2574.18,
  },
  {
    id: 13,
    name: "SFP-1G-SX-C",
    description:
      "SFP, 1G, FDDI/OM1/OM2 MMF, Extended Temp, Duplex LC",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 1866.28,
  },
  {
    id: 14,
    name: "PAR-NDS-EX9208-3B",
    description:
      "PSS Next Day Ship Support for EX9208-BASE3B",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 1198257.8,
  },
  {
    id: 15,
    name: "EX4400-24X",
    description:
      "24x10GbaseX switch with 2x100G uplinks, MACsec AES256",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 303354.86,
  },
  {
    id: 16,
    name: "EX4400-EM-1C",
    description:
      "1x100G MACsec AES256 extension module for EX4400",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 69395.6,
  },
  {
    id: 17,
    name: "S-EX-P-C2-P",
    description:
      "SW, EX, Premium, Class 2 (24 ports), Perpetual",
    hsn: "997311",
    qty: 0,
    unit: "Nos",
    rate: 66627.34,
  },
  {
    id: 18,
    name: "JPSU-550-C-AC-AFO",
    description:
      "550W compact AC AFO power supply for EX4400 switches",
    hsn: "850440",
    qty: 0,
    unit: "Nos",
    rate: 18468.72,
  },
  {
    id: 19,
    name: "CBL-EX-PWR-C13-IN",
    description:
      "AC Power Cable - India (10A/250V, 2.5m)",
    hsn: "854442",
    qty: 0,
    unit: "Nos",
    rate: 4075.79,
  },
  {
    id: 20,
    name: "PAR-NDS-EX44-24X",
    description:
      "PSS Next Day Ship Support for EX4400-24X",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 131467.05,
  },
  {
    id: 21,
    name: "EX4100-24T",
    description:
      "EX4100 24-Port 10/100/1000BaseT, 4x10G SFP+, 4x25G SFP28, Std SW",
    hsn: "85176290",
    qty: 0,
    unit: "Nos",
    rate: 108095.13,
  },
  {
    id: 22,
    name: "JNP-SFP-25G-DAC-1M",
    description:
      "SFP28, 25GE DAC Cable, 1 meter, Std Temp, 30 AWG",
    hsn: "851762",
    qty: 0,
    unit: "Nos",
    rate: 3105.36,
  },
  {
    id: 23,
    name: "PAR-NDS-EX41-24T",
    description:
      "PSS Next Day Ship Support for EX4100-24T",
    hsn: "998313",
    qty: 0,
    unit: "Nos",
    rate: 33556.28,
  },
  {
    id: 24,
    name: "JPSU-150-AC-AFO",
    description:
      "EX4100 / EX3400 150W AC PSU front-to-back airflow",
    hsn: "85044090",
    qty: 0,
    unit: "Nos",
    rate: 24490.46,
  },
];
 
const CATEGORY_OPTIONS = [
  "Networking",
  "Hardware",
  "Software",
  "Electrical",
  "Consumables",
  "Services",
];

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

const normalizeProduct = (product) => {
  const rate = Number(product.rate ?? product.salesPrice ?? 0);
  return {
    ...product,
    name: product.name || "",
    description: product.description || "",
    hsn: product.hsn ? String(product.hsn) : "",
    sku: product.sku || "",
    category: product.category || "",
    brand: product.brand || "",
    unit: product.unit || "Nos",
    qty: Number.isFinite(product.qty) ? product.qty : 0,
    rate: Number.isFinite(rate) ? rate : 0,
  };
};

const normalizeStoredProducts = (stored) =>
  stored.map((product) => normalizeProduct(product));

export default function Product() {
  const [items, setItems] = useState(() => []);
  const [productSearch, setProductSearch] = useState("");
  const [hsnSearch, setHsnSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const [editingProduct, setEditingProduct] = useState(null);
  const [editValues, setEditValues] = useState({
    name: "",
    sku: "",
    category: "",
    brand: "",
    unit: "Nos",
    hsn: "",
    rate: "",
    description: "",
  });
  const [editErrors, setEditErrors] = useState({});

  const seedInitialProducts = () => {
    const existing = getProducts();
    const existingIds = new Set(existing.map((product) => product.id));
    const missing = initialItems
      .filter((product) => !existingIds.has(product.id))
      .map((product) => normalizeProduct(product));

    if (missing.length > 0) {
      setProducts([...existing, ...missing]);
    }
  };

  const loadProducts = () => {
    const stored = normalizeStoredProducts(getProducts());
    setItems(stored);
  };

  useEffect(() => {
    seedInitialProducts();
    loadProducts();

    const handleStorage = (event) => {
      if (event.key === "products") {
        loadProducts();
      }
    };

    const handleProductsChanged = () => {
      loadProducts();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("products:changed", handleProductsChanged);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("products:changed", handleProductsChanged);
    };
  }, []);
 
  const updateQty = (id, nextQty) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, qty: nextQty } : item
      )
    );
    updateProduct(id, { qty: nextQty });
  };

  const increaseQty = (id) => {
    const target = items.find((item) => item.id === id);
    updateQty(id, (target?.qty ?? 0) + 1);
  };
 
  const decreaseQty = (id) => {
    const target = items.find((item) => item.id === id);
    const nextQty = Math.max(0, (target?.qty ?? 0) - 1);
    updateQty(id, nextQty);
  };
 
  const toggleSelected = (id, checked) => {
    updateQty(id, checked ? 1 : 0);
  };

  const startEdit = (product) => {
    setEditingProduct(product);
    setEditValues({
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      brand: product.brand || "",
      unit: product.unit || "Nos",
      hsn: product.hsn || "",
      rate: product.rate ?? "",
      description: product.description || "",
    });
    setEditErrors({});
  };

  const cancelEdit = () => {
    setEditingProduct(null);
  };

  const validateEdit = () => {
    const nextErrors = {};
    if (!editValues.name.trim()) {
      nextErrors.name = "Product name is required.";
    }
    const rate = Number(editValues.rate);
    if (editValues.rate === "" || Number.isNaN(rate) || rate <= 0) {
      nextErrors.rate = "Enter a valid selling price.";
    }
    setEditErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleEditSave = () => {
    if (!editingProduct) {
      return;
    }
    if (!validateEdit()) {
      return;
    }
    const updates = {
      name: editValues.name.trim(),
      sku: editValues.sku.trim(),
      category: editValues.category,
      brand: editValues.brand.trim(),
      unit: editValues.unit,
      hsn: editValues.hsn.trim(),
      rate: Number(editValues.rate),
      description: editValues.description.trim(),
      qty: editingProduct.qty ?? 0,
    };
    updateProduct(editingProduct.id, updates);
    setItems((prev) =>
      prev.map((item) =>
        item.id === editingProduct.id ? { ...item, ...updates } : item
      )
    );
    setEditingProduct(null);
  };

  const handleDelete = (id) => {
    deleteProduct(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  };
 
  const filteredItems = useMemo(
    () =>
      items.filter(
        (i) =>
          i.name.toLowerCase().includes(productSearch.toLowerCase()) &&
          i.hsn.includes(hsnSearch)
      ),
    [items, productSearch, hsnSearch]
  );
 
  const openCart = () => {
    localStorage.setItem(
      "inventoryCart",
      JSON.stringify(items.filter((i) => i.qty > 0))
    );
    navigate("/inventory/cart");
  };
  const goToCreateProduct = () => navigate("/inventory/create-product");

  const isPickingForPo =
    new URLSearchParams(location.search).get("pick") === "po";

  const sendToPurchaseOrder = () => {
    const selected = items
      .filter((item) => item.qty > 0)
      .map((item) => ({
        id: item.id,
        name: item.name || "",
        description: item.description || "",
        unit: item.unit || "PCS",
        rate: item.rate || 0,
        quantity: item.qty || 0,
      }));

    if (selected.length === 0) {
      return;
    }

    localStorage.setItem("po_selected_products", JSON.stringify(selected));
    navigate("/inventory/purchase-order");
  };
 
  return (
    <div className="bg-gray-100 min-h-screen p-6">
      <div className="flex justify-between mb-4">
        <h2 className="text-3xl font-semibold">Products</h2>
        <div className="flex gap-2">
          <button
            onClick={goToCreateProduct}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow hover:bg-blue-700 transition"
          >
            Create Product
          </button>
          {isPickingForPo && (
            <button
              onClick={sendToPurchaseOrder}
              className="bg-indigo-600 text-white px-4 py-2 rounded"
            >
              Add to PO
            </button>
          )}
          <button
            onClick={openCart}
            className="bg-slate-900 text-white px-4 py-2 rounded"
          >
            Add Cart
          </button>
        </div>
      </div>
 
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-lg border-collapse">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-4 border">#</th>
              <th className="p-4 border text-left">Item & Description</th>
              <th className="p-4 border text-left">SKU</th>
              <th className="p-4 border text-left">Category</th>
              <th className="p-4 border text-left">Brand</th>
              <th className="p-4 border">Unit</th>
              <th className="p-4 border">HSN</th>
              <th className="p-4 border">Qty</th>
              <th className="p-4 border">Rate</th>
              <th className="p-4 border">Amount</th>
              <th className="p-4 border">Actions</th>
            </tr>
            <tr>
              <th className="p-2 border"></th>
              <th className="p-2 border">
                <input
                  className="w-full border p-2"
                  placeholder="Search product"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border">
                <input
                  className="w-full border p-2"
                  placeholder="HSN"
                  value={hsnSearch}
                  onChange={(e) => setHsnSearch(e.target.value)}
                />
              </th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
              <th className="p-2 border"></th>
            </tr>
          </thead>
 
          <tbody>
            {filteredItems.map((item, idx) => (
              <tr key={item.id}>
                <td className="border p-4 text-center">{idx + 1}</td>
                <td className="border p-4">
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      checked={item.qty > 0}
                      onChange={(e) =>
                        toggleSelected(item.id, e.target.checked)
                      }
                    />
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-sm text-gray-600">
                        {item.description}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="border p-4">{item.sku || "-"}</td>
                <td className="border p-4">{item.category || "-"}</td>
                <td className="border p-4">{item.brand || "-"}</td>
                <td className="border p-4 text-center">
                  {item.unit || "-"}
                </td>
                <td className="border p-4 text-center">{item.hsn}</td>
                <td className="border p-4 text-center">
                  <button onClick={() => decreaseQty(item.id)}>−</button>
                  <span className="mx-3">{item.qty}</span>
                  <button onClick={() => increaseQty(item.id)}>+</button>
                </td>
                <td className="border p-4 text-right">
                  {item.rate.toLocaleString("en-IN")}
                </td>
                <td className="border p-4 text-right">
                  {(item.qty * item.rate).toLocaleString("en-IN")}
                </td>
                <td className="border p-4 text-center">
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-indigo-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingProduct && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50">
          <div className="bg-white w-[900px] max-w-[96vw] rounded-2xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  Product Catalog
                </p>
                <h2 className="text-xl font-semibold text-slate-900">
                  Edit Product
                </h2>
              </div>
              <button
                onClick={cancelEdit}
                className="h-9 w-9 grid place-items-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 transition"
                aria-label="Close"
                type="button"
              >
                X
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="lg:col-span-2">
                  <label className="text-sm font-medium text-slate-700">
                    Product Name *
                  </label>
                  <input
                    value={editValues.name}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    type="text"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    aria-invalid={Boolean(editErrors.name)}
                  />
                  {editErrors.name && (
                    <p className="mt-1 text-sm text-red-600">
                      {editErrors.name}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    SKU / Part No
                  </label>
                  <input
                    value={editValues.sku}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        sku: event.target.value,
                      }))
                    }
                    type="text"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Category
                  </label>
                  <select
                    value={editValues.category}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        category: event.target.value,
                      }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  >
                    <option value="">Select Category</option>
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Brand
                  </label>
                  <input
                    value={editValues.brand}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        brand: event.target.value,
                      }))
                    }
                    type="text"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Unit
                  </label>
                  <select
                    value={editValues.unit}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        unit: event.target.value,
                      }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    HSN / SAC
                  </label>
                  <input
                    value={editValues.hsn}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        hsn: event.target.value,
                      }))
                    }
                    type="text"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Selling Price *
                  </label>
                  <input
                    value={editValues.rate}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        rate: event.target.value,
                      }))
                    }
                    type="text"
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    aria-invalid={Boolean(editErrors.rate)}
                  />
                  {editErrors.rate && (
                    <p className="mt-1 text-sm text-red-600">
                      {editErrors.rate}
                    </p>
                  )}
                </div>

                <div className="lg:col-span-2">
                  <label className="text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    value={editValues.description}
                    onChange={(event) =>
                      setEditValues((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm min-h-[120px] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t bg-slate-50">
              <p className="text-xs text-slate-500">
                Update catalog details and keep pricing accurate.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 hover:text-slate-900"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
 
