import { NavLink, useLocation } from "react-router-dom";
import { ArrowRight, Boxes, ClipboardList, PackageCheck, Truck, Wrench } from "lucide-react";
import { PageHeader } from "../ui";
import "../../styles/inventory.css";

const inventoryLinks = [
  ["/inventory", "Overview", Boxes],
  ["/inventory/boq", "BOQ", ClipboardList],
  ["/inventory/purchase-order", "Purchase orders", ClipboardList],
  ["/inventory/receive-goods", "Receiving", PackageCheck],
  ["/inventory/delivery-challan", "Dispatch", Truck],
  ["/inventory/consumption", "Consumption", Boxes],
  ["/inventory/reports", "Reports", ClipboardList],
];
const toolLinks = [
  ["/inventory/tools", "Tool register", Wrench],
  ["/inventory/tools/assignments", "Assignments", ClipboardList],
  ["/inventory/tools/maintenance", "Maintenance", Wrench],
  ["/inventory/tools/analytics", "Analytics", Boxes],
  ["/inventory/tools/history", "History", ClipboardList],
  ["/inventory/tools/categories", "Categories", Boxes],
];

export default function InventoryPageHeader({ title, description, actions, children, navigation = true }) {
  const { pathname } = useLocation();
  const isTools = pathname.startsWith("/inventory/tools");
  return (
    <div className="inventory-page-heading">
      <PageHeader eyebrow={isTools ? "Inventory / Tools & equipment" : "Inventory workspace"} title={title} description={description} actions={actions}>
        {children}
      </PageHeader>
      {navigation && <nav className="inventory-workflow-nav print:hidden" aria-label={isTools ? "Tools workspace" : "Inventory workflow"}>
        {(isTools ? toolLinks : inventoryLinks).map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/inventory" || to === "/inventory/tools"} className={({ isActive }) => `inventory-workflow-link${isActive ? " is-active" : ""}`}>
            <Icon size={14} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
      </nav>}
    </div>
  );
}

export function InventoryWorkflowContext({ steps, current = 0, detail }) {
  return <div className="inventory-workflow-context print:hidden">
    <ol aria-label="Workflow stages">{steps.map((step, index) => <li key={step} className={index === current ? "is-current" : index < current ? "is-complete" : ""} aria-current={index === current ? "step" : undefined}>
      <span className="inventory-step-number">{index + 1}</span><span>{step}</span>{index < steps.length - 1 && <ArrowRight size={13} aria-hidden="true" />}
    </li>)}</ol>{detail && <p>{detail}</p>}
  </div>;
}
