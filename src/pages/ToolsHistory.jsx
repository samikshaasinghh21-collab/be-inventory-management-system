import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsHistory = () => {
  return (
    <ToolsSectionShell
      title="Tool History"
      subtitle="Review the full timeline of assignments and service."
      cards={[
        {
          title: "Assignment Timeline",
          description: "See every checkout and return in order.",
        },
        {
          title: "Maintenance Log",
          description: "Track repairs, costs, and outcomes.",
        },
        {
          title: "Condition Changes",
          description: "Audit how tool condition evolves over time.",
        },
      ]}
      note="Export histories for audits and compliance reports."
    />
  );
};

export default ToolsHistory;
