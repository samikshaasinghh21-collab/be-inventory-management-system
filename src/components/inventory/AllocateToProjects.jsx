import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchItems } from "../../services/inventoryApi";
import { getProducts } from "../../services/productsStore";
import { getProjects } from "../../services/projectsStore";
import { formatDateTime } from "../../utils/dateFormat";
import {
  deleteAllocation,
  getAllocations,
  saveAllocation,
  updateAllocation,
} from "../../services/allocationsStore";

const normalizeInventoryItem = (item) => ({
  id: `inv:${item.id}`,
  rawId: item.id,
  name: item.name || "",
  source: "Inventory",
});

const normalizeProductItem = (product) => ({
  id: `prod:${product.id}`,
  rawId: product.id,
  name: product.name || "",
  source: "Product",
});

const AllocateToProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [lastDeleted, setLastDeleted] = useState(null);

  const loadProjects = () => {
    setProjects(getProjects());
  };

  const loadAllocations = () => {
    setAllocations(getAllocations());
  };

  const loadItems = async () => {
    setLoadError("");
    try {
      const [inventoryItems, products] = await Promise.all([
        fetchItems(),
        Promise.resolve(getProducts()),
      ]);
      const normalizedInventory = Array.isArray(inventoryItems)
        ? inventoryItems.map(normalizeInventoryItem)
        : [];
      const normalizedProducts = Array.isArray(products)
        ? products.map(normalizeProductItem)
        : [];
      setItems([...normalizedProducts, ...normalizedInventory]);
    } catch (error) {
      console.error("Failed to load items:", error);
      setItems([]);
      setLoadError("Unable to load items from the API.");
    }
  };

  useEffect(() => {
    loadProjects();
    loadAllocations();
    loadItems();
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (
        event.key === "project_allocations" ||
        event.key === "projects" ||
        event.key === "items" ||
        event.key === "products"
      ) {
        loadProjects();
        loadAllocations();
        loadItems();
      }
    };

    const handleAllocationChange = () => {
      loadAllocations();
    };

    const handleProjectChange = () => {
      loadProjects();
    };

    const handleProductsChange = () => {
      loadItems();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("allocations:changed", handleAllocationChange);
    window.addEventListener("projects:changed", handleProjectChange);
    window.addEventListener("products:changed", handleProductsChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("allocations:changed", handleAllocationChange);
      window.removeEventListener("projects:changed", handleProjectChange);
      window.removeEventListener("products:changed", handleProductsChange);
    };
  }, []);

  const projectMap = useMemo(() => {
    return projects.reduce((acc, project) => {
      acc[String(project.id)] = project;
      return acc;
    }, {});
  }, [projects]);

  const itemMap = useMemo(() => {
    return items.reduce((acc, item) => {
      acc[String(item.id)] = item;
      if (item.rawId !== undefined && item.rawId !== null) {
        acc[String(item.rawId)] = item;
      }
      return acc;
    }, {});
  }, [items]);

  const clearError = (key) => {
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (!projectId) {
      nextErrors.projectId = "Select a project.";
    }
    if (!itemId) {
      nextErrors.itemId = "Select an item.";
    }
    const qty = Number(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      nextErrors.quantity = "Enter a valid quantity.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const project = projectMap[projectId];
    const item = itemMap[itemId];
    const basePayload = {
      projectId: project?.id ?? projectId,
      projectName: project?.name || "",
      itemId: item?.id ?? itemId,
      itemName: item?.name || "",
      quantity: Number(quantity),
      notes: notes.trim(),
    };

    if (editingId) {
      const existing = allocations.find((allocation) => allocation.id === editingId);
      updateAllocation(editingId, {
        ...basePayload,
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
      setEditingId(null);
    } else {
      const payload = {
        id: Date.now(),
        ...basePayload,
        createdAt: new Date().toISOString(),
      };
      saveAllocation(payload);
    }

    loadAllocations();
    setProjectId("");
    setItemId("");
    setQuantity("");
    setNotes("");
    setLastDeleted(null);
  };

  const handleDelete = (id) => {
    const existing = allocations.find((allocation) => allocation.id === id);
    deleteAllocation(id);
    loadAllocations();
    setLastDeleted(existing || null);
  };

  const handleEdit = (allocation) => {
    const matchedItem = itemMap[String(allocation.itemId)];
    setProjectId(String(allocation.projectId || ""));
    setItemId(String(matchedItem?.id || allocation.itemId || ""));
    setQuantity(String(allocation.quantity || ""));
    setNotes(allocation.notes || "");
    setEditingId(allocation.id);
  };

  const handleCancelEdit = () => {
    setProjectId("");
    setItemId("");
    setQuantity("");
    setNotes("");
    setEditingId(null);
  };

  const handleUndo = () => {
    if (!lastDeleted) {
      return;
    }
    saveAllocation({ ...lastDeleted, id: Date.now() });
    loadAllocations();
    setLastDeleted(null);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Projects
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Allocate Items
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/inventory/projects")}
            className="px-4 py-2 border rounded-md bg-white text-slate-700"
          >
            View Projects
          </button>
          <button
            onClick={() => navigate("/inventory/create-project")}
            className="bg-indigo-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            + Create Project
          </button>
        </div>
      </div>

      {/* Allocation Form */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            {editingId ? "Edit Allocation" : "New Allocation"}
          </h2>
          <button
            onClick={loadItems}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            Refresh Items
          </button>
        </div>

        {projects.length === 0 && (
          <p className="text-sm text-slate-500 mb-4">
            No projects available. Create a project first.
          </p>
        )}
        {loadError && (
          <p className="text-sm text-red-600 mb-4">{loadError}</p>
        )}
        {!loadError && items.length === 0 && (
          <p className="text-sm text-slate-500 mb-4">
            No items available. Create a product or inventory item first.
          </p>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Project *
            </label>
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                clearError("projectId");
              }}
              className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              aria-invalid={Boolean(errors.projectId)}
            >
              <option value="">Select Project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {errors.projectId && (
              <p className="mt-1 text-sm text-red-600">
                {errors.projectId}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Item *
            </label>
            <select
              value={itemId}
              onChange={(event) => {
                setItemId(event.target.value);
                clearError("itemId");
              }}
              className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              aria-invalid={Boolean(errors.itemId)}
            >
              <option value="">Select Item</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {errors.itemId && (
              <p className="mt-1 text-sm text-red-600">
                {errors.itemId}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Quantity *
            </label>
            <input
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                clearError("quantity");
              }}
              type="number"
              min="1"
              placeholder="Ex: 10"
              className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
              aria-invalid={Boolean(errors.quantity)}
            />
            {errors.quantity && (
              <p className="mt-1 text-sm text-red-600">
                {errors.quantity}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Notes
            </label>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              type="text"
              placeholder="Optional note"
              className="w-full mt-1 border border-slate-200 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
            />
          </div>

          <div className="lg:col-span-2 flex justify-end gap-3">
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-5 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:border-slate-300"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              {editingId ? "Update Allocation" : "Allocate"}
            </button>
          </div>
        </form>
      </div>

      {lastDeleted && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <span className="text-sm">Allocation deleted.</span>
          <button
            onClick={handleUndo}
            className="text-sm font-medium text-amber-900 hover:text-amber-950"
          >
            Undo
          </button>
        </div>
      )}

      {/* Allocation List */}
      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4 text-left min-w-[200px]">Project</th>
              <th className="p-4 text-left min-w-[200px]">Item</th>
              <th className="p-4 text-left min-w-[120px]">Quantity</th>
              <th className="p-4 text-left min-w-[200px]">Notes</th>
              <th className="p-4 text-left min-w-[180px]">Date</th>
              <th className="p-4 text-left min-w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allocations.length === 0 && (
              <tr>
                <td
                  colSpan="6"
                  className="text-center p-6 text-slate-500"
                >
                  No allocations yet
                </td>
              </tr>
            )}

            {allocations.map((allocation) => {
              const project =
                allocation.projectName ||
                projectMap[String(allocation.projectId)]?.name ||
                "-";
              const item =
                allocation.itemName ||
                itemMap[String(allocation.itemId)]?.name ||
                "-";
              return (
                <tr key={allocation.id} className="border-t hover:bg-slate-50">
                  <td className="p-4 font-medium text-slate-800">
                    {project}
                  </td>
                  <td className="p-4">{item}</td>
                  <td className="p-4">{allocation.quantity}</td>
                  <td className="p-4 text-slate-600">
                    {allocation.notes || "-"}
                  </td>
                  <td className="p-4 text-slate-600">
                    {formatDateTime(allocation.createdAt)}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleEdit(allocation)}
                        className="text-indigo-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(allocation.id)}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AllocateToProjects;
