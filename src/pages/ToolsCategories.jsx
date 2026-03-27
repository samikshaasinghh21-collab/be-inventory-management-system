import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsCategories = () => {
  return (
    <ToolsSectionShell
      title="Tool Categories"
      subtitle="Standardize types, default attributes, and cycles."
      cards={[
        {
          title: "Category Library",
          description: "Create categories for drills, meters, and more.",
        },
        {
          title: "Default Attributes",
          description: "Set required fields for each tool type.",
        },
        {
          title: "Maintenance Cadence",
          description: "Define service intervals per category.",
        },
      ]}
      note="Tie categories to inspection checklists and SOPs."
    />
  );
};

export default ToolsCategories;
