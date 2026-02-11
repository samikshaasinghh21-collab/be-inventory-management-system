import React from "react";

const Locations = () => {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Locations
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Select / Manage Location
          </h1>
        </div>
        <button className="bg-indigo-600 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-indigo-700">
          + Add Location
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total Locations
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">Active: 0 • Inactive: 0</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Stock Value
          </p>
          <p className="text-2xl font-semibold text-slate-800">₹ 0</p>
          <p className="text-xs text-slate-500 mt-1">All locations</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Pending Actions
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">Awaiting updates</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4 text-left min-w-[200px]">Location</th>
              <th className="p-4 text-left min-w-[200px]">Address</th>
              <th className="p-4 text-left min-w-[140px]">Type</th>
              <th className="p-4 text-left min-w-[140px]">Status</th>
              <th className="p-4 text-left min-w-[140px]">Stock Qty</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan="5"
                className="text-center p-6 text-slate-500"
              >
                No locations added yet
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Locations;
