import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ToolsSectionShell from "./tools/ToolsSectionShell";
import {
  getToolEmployees,
  setToolEmployees,
} from "../services/toolEmployeesStore";

const statusClass = (status) =>
  String(status || "").toLowerCase() === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-600";

const ToolsEmployees = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [employees, setEmployees] = useState(() => getToolEmployees());

  const handleDeleteEmployee = (employee) => {
    if (!employee) return;
    const confirmed = window.confirm(
      `Delete employee ${employee.name || employee.id}?`
    );
    if (!confirmed) return;

    const updatedEmployees = employees.filter(
      (record) => record.id !== employee.id
    );
    setEmployees(updatedEmployees);
    setToolEmployees(updatedEmployees);
  };

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return employees.filter((employee) => {
      if (statusFilter !== "all" && employee.status !== statusFilter) return false;
      if (!query) return true;
      return [
        employee.id,
        employee.name,
        employee.role,
        employee.department,
        employee.location,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [employees, searchQuery, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 md:p-6 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Tools
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">
              Employee List
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage employees available for tool assignment and coordination.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/inventory/tools/employees/new")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + Add New Employee
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search employee, role, department..."
            className="w-full max-w-xl rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Employee ID</th>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Department</th>
                <th className="px-4 py-3 text-left font-semibold">Location</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No employees found.
                  </td>
                </tr>
              )}
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="transition hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{employee.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{employee.name}</div>
                    <div className="text-xs text-slate-500">{employee.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{employee.role}</td>
                  <td className="px-4 py-3 text-slate-700">{employee.department}</td>
                  <td className="px-4 py-3 text-slate-700">{employee.location}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(employee.status)}`}
                    >
                      {employee.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate("/inventory/tools/employees/new", {
                            state: { employee },
                          })
                        }
                        className="text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEmployee(employee)}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
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
      </section>

      <ToolsSectionShell
        title="Employee Details"
        subtitle="Add and review employees used in tool workflows."
        cards={[
          {
            title: "Total Employees",
            description: `${employees.length} employee records available.`,
          },
          {
            title: "Active Employees",
            description: `${employees.filter((employee) => employee.status === "Active").length} employees ready for assignment.`,
          },
          {
            title: "Inactive Employees",
            description: `${employees.filter((employee) => employee.status === "Inactive").length} employees currently inactive.`,
          },
        ]}
        note="Use this section only for employees related to the tools workflow."
      />
    </div>
  );
};

export default ToolsEmployees;
