import React from "react";

const PurchaseOrders = () => {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Procurement
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Purchase Orders (PO)
          </h1>
        </div>
        <button className="bg-indigo-600 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-indigo-700">
          + Create PO
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total POs
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">Draft: 0 • Open: 0</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total Value
          </p>
          <p className="text-2xl font-semibold text-slate-800">₹ 0</p>
          <p className="text-xs text-slate-500 mt-1">Approved POs</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Pending Actions
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">Awaiting approval</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4 text-left min-w-[140px]">PO Number</th>
              <th className="p-4 text-left min-w-[200px]">Vendor</th>
              <th className="p-4 text-left min-w-[140px]">Status</th>
              <th className="p-4 text-left min-w-[160px]">Total Value</th>
              <th className="p-4 text-left min-w-[160px]">Created</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan="5"
                className="text-center p-6 text-slate-500"
              >
                No purchase orders created yet
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PurchaseOrders;
