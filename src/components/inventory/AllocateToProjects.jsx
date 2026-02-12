import { useState } from "react";

const AllocateToProjects = () => {
  const [notes, setNotes] = useState("");

  return (
    <div className="p-6">
      <h1 className="text-3xl font-semibold text-slate-800 mb-2">
        Allocate Inventory
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        This screen was reset to remove merge-conflict errors. Add allocation logic here.
      </p>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 min-h-[120px]"
          placeholder="Enter allocation details..."
        />
      </div>
    </div>
  );
};

export default AllocateToProjects;
