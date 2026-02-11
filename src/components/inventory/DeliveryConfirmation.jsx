import React from "react";

const DeliveryConfirmation = () => {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Logistics
          </p>
          <h1 className="text-3xl font-semibold text-slate-800">
            Goods Delivered (Confirmation)
          </h1>
        </div>
        <button className="bg-indigo-600 text-white px-6 py-3 rounded-md text-base font-medium hover:bg-indigo-700">
          + Confirm Delivery
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Total Confirmations
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">
            Pending: 0 • Approved: 0
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Delivered Qty
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">
            This month
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Pending Actions
          </p>
          <p className="text-2xl font-semibold text-slate-800">0</p>
          <p className="text-xs text-slate-500 mt-1">
            Awaiting confirmation
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-slate-100">
            <tr className="text-slate-700">
              <th className="p-4 text-left min-w-[160px]">DC Number</th>
              <th className="p-4 text-left min-w-[200px]">Location</th>
              <th className="p-4 text-left min-w-[140px]">Status</th>
              <th className="p-4 text-left min-w-[160px]">Delivered Qty</th>
              <th className="p-4 text-left min-w-[160px]">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                colSpan="5"
                className="text-center p-6 text-slate-500"
              >
                No deliveries confirmed yet
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DeliveryConfirmation;
