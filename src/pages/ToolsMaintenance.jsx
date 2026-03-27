import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsMaintenance = () => {
  return (
    <ToolsSectionShell
      title="Maintenance Management"
      subtitle="Schedule, track, and resolve maintenance work orders."
      cards={[
        {
          title: "Open Requests",
          description: "Review incoming maintenance issues and priorities.",
        },
        {
          title: "Scheduled Work",
          description: "Plan upcoming service windows for critical tools.",
        },
        {
          title: "Technician Assignments",
          description: "Balance workload across technicians and vendors.",
        },
      ]}
      note="Integrate service logs to keep a full maintenance history."
    />
  );
};

export default ToolsMaintenance;
