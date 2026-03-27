import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsMap = () => {
  return (
    <ToolsSectionShell
      title="Inventory Map"
      subtitle="Visualize tool locations across sites and zones."
      cards={[
        {
          title: "Location Heatmap",
          description: "Spot concentration by warehouse or job site.",
        },
        {
          title: "Site Overview",
          description: "Drill into each facility for tool breakdowns.",
        },
        {
          title: "Zone Visibility",
          description: "Track movement between rooms and storage bays.",
        },
      ]}
      note="Pair with QR scans to keep locations updated."
    />
  );
};

export default ToolsMap;
