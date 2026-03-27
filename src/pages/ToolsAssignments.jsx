import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsAssignments = () => {
  return (
    <ToolsSectionShell
      title="Assignments and Checkout"
      subtitle="Assign tools, manage due dates, and track returns."
      cards={[
        {
          title: "Checkout Queue",
          description: "Process new tool requests and approvals.",
        },
        {
          title: "Due Date Alerts",
          description: "See upcoming returns and overdue items.",
        },
        {
          title: "Return Processing",
          description: "Log returns and update conditions fast.",
        },
      ]}
      note="Automate reminders so teams return tools on time."
    />
  );
};

export default ToolsAssignments;
