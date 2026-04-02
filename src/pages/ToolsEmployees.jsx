import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ToolsSectionShell from "./tools/ToolsSectionShell";
import useSettings from "../hooks/useSettings";
import { getToolEmployees, setToolEmployees } from "../services/toolEmployeesStore";
import { getToolAssignments, setToolAssignments } from "../services/toolsStore";
import { printSection } from "../utils/printUtils";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const statusClass = (status) =>
  String(status || "").toLowerCase() === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : String(status || "").toLowerCase().includes("rto")
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : "border-slate-200 bg-slate-100 text-slate-600";

const createEmployeeForm = (employee = {}) => ({
  id: employee.id || "",
  name: employee.name || "",
  role: employee.role || "",
  department: employee.department || "",
  location: employee.location || "",
  email: employee.email || "",
  phone: employee.phone || "",
  status: employee.status || "RTO (Return to Office)",
  notes: employee.notes || "",
});

const ToolsEmployees = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const company = settings?.company || {};
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [employees, setEmployees] = useState(() => getToolEmployees());
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(() => createEmployeeForm());
  const [formErrors, setFormErrors] = useState({});

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

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) => String(employee.id) === String(selectedEmployeeId)
      ) || null,
    [employees, selectedEmployeeId]
  );

  useEffect(() => {
    if (!selectedEmployeeId) {
      return;
    }
    if (selectedEmployee) {
      return;
    }
    setSelectedEmployeeId("");
    setIsEditing(false);
    setEmployeeForm(createEmployeeForm());
    setFormErrors({});
  }, [selectedEmployee, selectedEmployeeId]);

  const openEmployeeView = (employee) => {
    setSelectedEmployeeId(employee.id);
    setEmployeeForm(createEmployeeForm(employee));
    setIsEditing(false);
    setFormErrors({});
  };

  const closeEmployeeView = () => {
    setSelectedEmployeeId("");
    setIsEditing(false);
    setEmployeeForm(createEmployeeForm());
    setFormErrors({});
  };

  const startEditingEmployee = () => {
    if (!selectedEmployee) {
      return;
    }
    setEmployeeForm(createEmployeeForm(selectedEmployee));
    setIsEditing(true);
    setFormErrors({});
  };

  const cancelEditingEmployee = () => {
    if (selectedEmployee) {
      setEmployeeForm(createEmployeeForm(selectedEmployee));
    } else {
      setEmployeeForm(createEmployeeForm());
    }
    setIsEditing(false);
    setFormErrors({});
  };

  const updateEmployeeField = (field, value) =>
    setEmployeeForm((current) => ({
      ...current,
      [field]: value,
    }));

  const handleUpdateEmployee = (event) => {
    event.preventDefault();
    if (!selectedEmployee) {
      return;
    }

    const nextErrors = {};
    if (!employeeForm.name.trim()) {
      nextErrors.name = "Employee name is required.";
    }
    if (!employeeForm.role.trim()) {
      nextErrors.role = "Role is required.";
    }
    if (!employeeForm.department.trim()) {
      nextErrors.department = "Department is required.";
    }

    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    const updatedEmployee = {
      ...selectedEmployee,
      id: selectedEmployee.id,
      name: employeeForm.name.trim(),
      role: employeeForm.role.trim(),
      department: employeeForm.department.trim(),
      location: employeeForm.location.trim(),
      email: employeeForm.email.trim(),
      phone: employeeForm.phone.trim(),
      status: employeeForm.status,
      notes: employeeForm.notes.trim(),
    };

    const updatedEmployees = employees.map((record) =>
      record.id === selectedEmployee.id ? updatedEmployee : record
    );
    setEmployees(updatedEmployees);
    setToolEmployees(updatedEmployees);

    const previousName = String(selectedEmployee.name || "").trim().toLowerCase();
    const nextAssignments = getToolAssignments().map((assignment) => {
      const matchesEmployeeId =
        String(assignment.employeeId || "") === String(selectedEmployee.id);
      const matchesEmployeeName =
        String(assignment.assignedTo || "").trim().toLowerCase() === previousName;
      if (!matchesEmployeeId && !matchesEmployeeName) {
        return assignment;
      }
      return {
        ...assignment,
        employeeId: selectedEmployee.id,
        assignedTo: updatedEmployee.name,
      };
    });
    setToolAssignments(nextAssignments);

    setSelectedEmployeeId(updatedEmployee.id);
    setEmployeeForm(createEmployeeForm(updatedEmployee));
    setIsEditing(false);
    setFormErrors({});
  };

  const handlePrintEmployee = () => {
    if (!selectedEmployee) {
      return;
    }
    void printSection({
      selector: "#employee-detail-sheet",
      title: "Employee Details",
      subtitle: selectedEmployee.name || selectedEmployee.id || "Employee",
      logoUrl: company.logo || settings?.profile?.avatar || "",
      brandName: company.name || "Bangalore Electronics",
      brandDescription: company.address || "Company address",
      metaRows: [
        { label: "Employee ID", value: selectedEmployee.id || "-" },
        { label: "Department", value: selectedEmployee.department || "-" },
        { label: "Status", value: selectedEmployee.status || "-" },
      ],
    });
  };

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
            <option value="RTO (Return to Office)">RTO (Return to Office)</option>
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
                <tr
                  key={employee.id}
                  className={`transition hover:bg-slate-50 ${
                    String(selectedEmployeeId) === String(employee.id)
                      ? "bg-blue-50/60"
                      : ""
                  }`}
                >
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
                        onClick={() => openEmployeeView(employee)}
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

      {selectedEmployee && (
        <section
          id="employee-detail-sheet"
          className="rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                Employee Record
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                {isEditing ? "Update Employee" : selectedEmployee.name || "-"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEditing
                  ? "Update employee details here and save without leaving the employee list."
                  : "Complete employee details in a print-friendly format."}
              </p>
            </div>
            <div className="print-hidden flex flex-wrap items-center gap-2">
              {!isEditing && (
                <button
                  type="button"
                  onClick={handlePrintEmployee}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
                >
                  Print
                </button>
              )}
              {!isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={startEditingEmployee}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={closeEmployeeView}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={cancelEditingEmployee}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    form="employee-update-form"
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    Update
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-6">
            {isEditing ? (
              <form
                id="employee-update-form"
                onSubmit={handleUpdateEmployee}
                className="grid gap-5 md:grid-cols-2"
              >
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Employee Name
                  </label>
                  <input
                    value={employeeForm.name}
                    onChange={(event) => updateEmployeeField("name", event.target.value)}
                    className={inputClass}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Employee ID
                  </label>
                  <input
                    value={employeeForm.id}
                    readOnly
                    className={`${inputClass} bg-slate-50 text-slate-500`}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Employee ID is locked after creation to keep tool records aligned.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Role</label>
                  <input
                    value={employeeForm.role}
                    onChange={(event) => updateEmployeeField("role", event.target.value)}
                    className={inputClass}
                  />
                  {formErrors.role && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.role}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Department
                  </label>
                  <input
                    value={employeeForm.department}
                    onChange={(event) =>
                      updateEmployeeField("department", event.target.value)
                    }
                    className={inputClass}
                  />
                  {formErrors.department && (
                    <p className="mt-1 text-xs text-red-600">
                      {formErrors.department}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Location</label>
                  <input
                    value={employeeForm.location}
                    onChange={(event) =>
                      updateEmployeeField("location", event.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(event) => updateEmployeeField("email", event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Phone Number
                  </label>
                  <input
                    value={employeeForm.phone}
                    onChange={(event) => updateEmployeeField("phone", event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={employeeForm.status}
                    onChange={(event) => updateEmployeeField("status", event.target.value)}
                    className={inputClass}
                  >
                    <option value="Active">Active</option>
                    <option value="RTO (Return to Office)">
                      RTO (Return to Office)
                    </option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Notes</label>
                  <textarea
                    value={employeeForm.notes}
                    onChange={(event) => updateEmployeeField("notes", event.target.value)}
                    className={`${inputClass} min-h-[120px]`}
                  />
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Employee
                    </p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Name
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedEmployee.name || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Employee ID
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedEmployee.id || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Status
                        </p>
                        <div className="mt-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(
                              selectedEmployee.status
                            )}`}
                          >
                            {selectedEmployee.status || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Work Details
                    </p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Role
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedEmployee.role || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Department
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedEmployee.department || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Location
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedEmployee.location || "-"}
                        </p>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Contact
                    </p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Email
                        </p>
                        <p className="mt-1 font-semibold text-slate-900 break-words">
                          {selectedEmployee.email || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Phone
                        </p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {selectedEmployee.phone || "-"}
                        </p>
                      </div>
                    </div>
                  </article>
                </div>

                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Notes
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">
                    {selectedEmployee.notes || "No notes added for this employee."}
                  </p>
                </article>
              </div>
            )}
          </div>
        </section>
      )}

      <ToolsSectionShell
        title="Employee Details"
        subtitle="Add and review employees used in tool workflows."
        cards={[
          {
            title: "Total Employees",
            description: `${employees.length} employee records available.`,
          },
          {
            title: "Ready Employees",
            description: `${employees.filter((employee) => String(employee.status || "").toLowerCase() !== "inactive").length} employees ready for assignment.`,
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
