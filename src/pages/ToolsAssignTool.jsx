import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DateInput from "../components/common/DateInput";
import { getToolEmployees } from "../services/toolEmployeesStore";
import {
  getToolAssignments,
  getToolMaintenance,
  getTools,
  setToolAssignments,
} from "../services/toolsStore";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const createId = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

const ToolsAssignTool = () => {
  const navigate = useNavigate();
  const [tools] = useState(() => getTools());
  const [employees] = useState(() => getToolEmployees());
  const [assignments, setAssignmentsState] = useState(() => getToolAssignments());
  const [maintenance] = useState(() => getToolMaintenance());
  const [form, setForm] = useState({
    toolId: "",
    employeeId: "",
    assignmentDate: todayIso(),
    expectedReturnDate: "",
    conditionCheck: "Good",
    notes: "",
  });
  const [error, setError] = useState("");

  const availableToolIds = useMemo(() => {
    const checkedOut = new Set(
      assignments
        .filter((assignment) => !assignment.actualReturnDate)
        .map((assignment) => assignment.toolId)
    );
    const inMaintenance = new Set(
      maintenance
        .filter(
          (record) => String(record.status || "").toLowerCase() !== "completed"
        )
        .map((record) => record.toolId)
    );
    return tools
      .filter((tool) => !checkedOut.has(tool.id) && !inMaintenance.has(tool.id))
      .map((tool) => tool.id);
  }, [assignments, maintenance, tools]);

  const availableTools = useMemo(
    () => tools.filter((tool) => availableToolIds.includes(tool.id)),
    [availableToolIds, tools]
  );

  const assignableEmployees = useMemo(
    () =>
      employees.filter(
        (employee) => String(employee.status || "").toLowerCase() !== "inactive"
      ),
    [employees]
  );

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.id === form.toolId) ?? null,
    [form.toolId, tools]
  );

  useEffect(() => {
    setForm((current) => ({
      ...current,
      toolId:
        current.toolId && availableToolIds.includes(current.toolId)
          ? current.toolId
          : availableTools[0]?.id || "",
      employeeId:
        current.employeeId &&
        assignableEmployees.some((employee) => employee.id === current.employeeId)
          ? current.employeeId
          : assignableEmployees[0]?.id || "",
    }));
  }, [assignableEmployees, availableToolIds, availableTools]);

  const updateField = (field, value) =>
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.toolId) {
      setError("Please select a tool.");
      return;
    }
    if (!form.employeeId) {
      setError("Please select an employee.");
      return;
    }
    if (!form.assignmentDate) {
      setError("Assignment date is required.");
      return;
    }
    if (!String(selectedTool?.serialNumber || "").trim()) {
      setError("Serial number is required before issuing this tool.");
      return;
    }

    const employee = assignableEmployees.find(
      (record) => record.id === form.employeeId
    );
    if (!employee) {
      setError("Selected employee is not available.");
      return;
    }

    const updatedAssignments = [
      {
        id: createId("TA"),
        toolId: form.toolId,
        employeeId: employee.id,
        assignedTo: employee.name,
        toolSerialNumber: selectedTool.serialNumber,
        checkoutDate: form.assignmentDate,
        expectedReturnDate: form.expectedReturnDate || null,
        actualReturnDate: null,
        conditionCheck: form.conditionCheck,
        notes: form.notes.trim(),
      },
      ...assignments,
    ];

    setAssignmentsState(updatedAssignments);
    setToolAssignments(updatedAssignments);
    navigate("/inventory/tools/list");
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Tools
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          Assign Tool to Employee
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign an available tool to an eligible employee and set the return plan.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Select Tool</label>
            <select
              value={form.toolId}
              onChange={(event) => updateField("toolId", event.target.value)}
              className={inputClass}
              disabled={!availableTools.length}
            >
              {availableTools.length === 0 && <option value="">No tools available</option>}
              {availableTools.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.name} ({tool.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Select Employee
            </label>
            <select
              value={form.employeeId}
              onChange={(event) => updateField("employeeId", event.target.value)}
              className={inputClass}
              disabled={!assignableEmployees.length}
            >
              {assignableEmployees.length === 0 && (
                <option value="">No eligible employees available</option>
              )}
              {assignableEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Assignment Date
            </label>
            <DateInput
              value={form.assignmentDate}
              onChange={(value) => updateField("assignmentDate", value || "")}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Expected Return Date
            </label>
            <DateInput
              value={form.expectedReturnDate}
              onChange={(value) => updateField("expectedReturnDate", value || "")}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional for open-ended laptop or tool issue records.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Condition Check
            </label>
            <select
              value={form.conditionCheck}
              onChange={(event) => updateField("conditionCheck", event.target.value)}
              className={inputClass}
            >
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Damaged">Damaged</option>
              <option value="Needs Inspection">Needs Inspection</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Tool Location</label>
            <input
              value={selectedTool?.baseLocation || ""}
              readOnly
              className={`${inputClass} bg-slate-50`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Serial Number</label>
            <input
              value={selectedTool?.serialNumber || ""}
              readOnly
              className={`${inputClass} bg-slate-50`}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              className={`${inputClass} min-h-[100px]`}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/inventory/tools/list")}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Assign Tool
          </button>
        </div>
      </form>
    </div>
  );
};

export default ToolsAssignTool;
