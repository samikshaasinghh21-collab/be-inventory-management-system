import ToolsSectionShell from "./tools/ToolsSectionShell";

const ToolsAnalytics = () => {
  return (
    <ToolsSectionShell
      title="Tool Analytics"
      subtitle="Usage trends, utilization, and maintenance signals."
      cards={[
        {
          title: "Usage Trends",
          description: "Track weekly checkouts and peak demand windows.",
        },
        {
          title: "Most Used Tools",
          description: "See which assets are checked out the most.",
        },
        {
          title: "Idle Alerts",
          description: "Highlight tools that sit unused for too long.",
        },{
        title: "Maintainance Signals",
        description: "Receive notifications for tools requiring maintenance."
        }
      ]}
      note="Connect live checkout data to unlock real time analytics."
    />
  );
};

export default ToolsAnalytics;
