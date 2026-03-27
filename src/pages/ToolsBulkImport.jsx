import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsBulkImport = () => {
  return (
    <ToolsSectionShell
      title="Bulk Upload"
      subtitle="Import tools quickly and edit at scale."
      cards={[
        {
          title: "CSV Import",
          description: "Upload a spreadsheet to create tools in minutes.",
        },
        {
          title: "Bulk Edit",
          description: "Update locations, status, and types in batches.",
        },
        {
          title: "Validation Rules",
          description: "Catch duplicates and missing fields early.",
        },
      ]}
      note="Download a template to keep imports consistent."
    />
  );
};

export default ToolsBulkImport;
