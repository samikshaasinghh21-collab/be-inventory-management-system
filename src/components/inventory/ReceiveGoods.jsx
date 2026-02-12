import { useState } from "react";

const ReceiveGoods = () => {
  const [reference, setReference] = useState("");

  return (
    <div className="p-6">
      <h1 className="text-3xl font-semibold text-slate-800 mb-2">Receive Goods</h1>
      <p className="text-sm text-slate-500 mb-6">
        This page was reset to remove merge-conflict syntax errors.
      </p>
      <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-xl">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Reference
        </label>
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2"
          placeholder="GRN-2026-001"
        />
      </div>
    </div>
  );
};

export default ReceiveGoods;
