export const isRelievedEmployee = (employee) =>
  String(employee?.status ?? "").trim().toLowerCase() === "relieved";

export const currentHrmsEmployees = (employees) =>
  employees.filter((employee) => !isRelievedEmployee(employee));

export const recordsForHrmsEmployees = (records, employees) => {
  const employeeIds = new Set(employees.map((employee) => String(employee.id)));
  return records.filter((record) =>
    employeeIds.has(String(record.employeeId ?? record.id))
  );
};
