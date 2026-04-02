import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DateInput from "../components/common/DateInput";
import { getToolEmployees } from "../services/toolEmployeesStore";
import {
  getToolAssignments,
  getTools,
  setToolAssignments,
} from "../services/toolsStore";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const createId = (prefix) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const todayIso = () => new Date().toISOString().slice(0, 10);

const ToolsHandoverTool = () => {
  const navigate = useNavigate();
  const [tools] = useState(() => getTools());
  const [employees] = useState(() => getToolEmployees());
  const [assignments, setAssignmentsState] = useState(() => getToolAssignments());
  const [form, setForm] = useState({
    toolId: "",
    newEmployeeId: "",
    handoverDate: todayIso(),
    switchHandover: true,
    conditionCheck: "Good",
    notes: "",
  });
  const [error, setError] = useState("");

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => !assignment.actualReturnDate),
    [assignments]
  );

  const toolOptions = useMemo(
    () =>
      activeAssignments
        .map((assignment) => ({
          assignment,
          tool: tools.find((tool) => tool.id === assignment.toolId),
        }))
        .filter((record) => record.tool),
    [activeAssignments, tools]
  );

  const selectedRecord = useMemo(
    () =>
      toolOptions.find((record) => record.assignment.toolId === form.toolId) ??
      null,
    [form.toolId, toolOptions]
  );

  const selectableEmployees = useMemo(() => {
    const currentEmployeeName = selectedRecord?.assignment.assignedTo || "";
    return employees.filter(
      (employee) =>
        String(employee.status || "").toLowerCase() !== "inactive" &&
        employee.name !== currentEmployeeName
    );
  }, [employees, selectedRecord]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      toolId:
        current.toolId &&
        toolOptions.some((record) => record.assignment.toolId === current.toolId)
          ? current.toolId
          : toolOptions[0]?.assignment.toolId || "",
    }));
  }, [toolOptions]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      newEmployeeId:
        current.newEmployeeId &&
        selectableEmployees.some(
          (employee) => employee.id === current.newEmployeeId
        )
          ? current.newEmployeeId
          : selectableEmployees[0]?.id || "",
    }));
  }, [selectableEmployees]);

  const updateField = (field, value) =>
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!selectedRecord) {
      setError("Please select a tool currently assigned to an employee.");
      return;
    }
    if (!form.newEmployeeId) {
      setError("Please select the new employee.");
      return;
    }
    if (!form.handoverDate) {
      setError("Handover date is required.");
      return;
    }
    if (!String(selectedRecord?.tool?.serialNumber || "").trim()) {
      setError("Serial number is required before handing over this laptop or tool.");
      return;
    }

    const newEmployee = employees.find(
      (employee) => employee.id === form.newEmployeeId
    );
    if (!newEmployee) {
      setError("Selected employee is not available.");
      return;
    }

    const updatedAssignments = assignments.map((assignment) =>
      assignment.id === selectedRecord.assignment.id
        ? {
            ...assignment,
            actualReturnDate: form.handoverDate,
            switchHandover: form.switchHandover,
            handoverCondition: form.conditionCheck,
            handoverNotes: form.notes.trim(),
          }
        : assignment
    );

    const nextAssignments = [
      {
        id: createId("TA"),
        toolId: selectedRecord.assignment.toolId,
        employeeId: newEmployee.id,
        assignedTo: newEmployee.name,
        toolSerialNumber: selectedRecord.tool.serialNumber,
        checkoutDate: form.handoverDate,
        expectedReturnDate: selectedRecord.assignment.expectedReturnDate || null,
        actualReturnDate: null,
        switchHandover: form.switchHandover,
        conditionCheck: form.conditionCheck,
        notes: form.notes.trim(),
        previousAssignee: selectedRecord.assignment.assignedTo,
      },
      ...updatedAssignments,
    ];

    setAssignmentsState(nextAssignments);
    setToolAssignments(nextAssignments);
    navigate("/inventory/tools/list");
  };

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          Tools
        </p>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
          Switch / Handover Tool
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Transfer a checked-out tool from one employee to another.
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
              disabled={!toolOptions.length}
            >
              {toolOptions.length === 0 && (
                <option value="">No active tool assignments</option>
              )}
              {toolOptions.map((record) => (
                <option key={record.assignment.id} value={record.assignment.toolId}>
                  {record.tool.name} ({record.tool.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Current Employee
            </label>
            <input
              value={selectedRecord?.assignment.assignedTo || ""}
              readOnly
              className={`${inputClass} bg-slate-50`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Select Employee</label>
            <select
              value={form.newEmployeeId}
              onChange={(event) =>
                updateField("newEmployeeId", event.target.value)
              }
              className={inputClass}
              disabled={!selectableEmployees.length}
            >
              {selectableEmployees.length === 0 && (
                <option value="">No alternate eligible employee available</option>
              )}
              {selectableEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} ({employee.id})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Handover Date
            </label>
            <DateInput
              value={form.handoverDate}
              onChange={(value) => updateField("handoverDate", value || "")}
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.switchHandover}
                onChange={(event) =>
                  updateField("switchHandover", event.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Switch Handover
            </label>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Serial Number</label>
            <input
              value={selectedRecord?.tool.serialNumber || ""}
              readOnly
              className={`${inputClass} bg-slate-50`}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Tool Condition
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
              value={selectedRecord?.tool.baseLocation || ""}
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
            Confirm Handover
          </button>
        </div>
      </form>
    </div>
  );
};

export default ToolsHandoverTool;
