import { createElement } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  Drill,
  FileDown,
  Fullscreen,
  Hammer,
  History,
  Layers,
  LayoutGrid,
  List,
  LocateFixed,
  MapPin,
  MapPinned,
  Minus,
  Plus,
  QrCode,
  Radio,
  Route,
  Search,
  Settings,
  Sparkles,
  Target,
  Upload,
  User,
  Users,
  Wifi,
  Wrench,
  X,
  Zap,
} from "lucide-react";

const navigation = [
  { label: "Employees", icon: Users },
  { label: "Analytics", icon: BarChart3 },
  { label: "Maintenance", icon: Wrench },
  { label: "Assignments", icon: LayoutGrid },
  { label: "Categories", icon: Boxes },
  { label: "History", icon: History },
  { label: "Bulk Import", icon: Upload },
  { label: "Map", icon: MapPin, active: true },
];

const kpis = [
  { label: "Total Tools", value: "1,248", helper: "All locations", icon: BriefcaseBusiness, tone: "bg-purple-100 text-[#5B1467]" },
  { label: "Active Today", value: "982", helper: "78.7% of total", icon: Activity, tone: "bg-green-100 text-green-700" },
  { label: "Missing", value: "23", helper: "1.8% of total", icon: AlertTriangle, tone: "bg-red-100 text-red-600" },
  { label: "Under Maintenance", value: "56", helper: "4.5% of total", icon: Wrench, tone: "bg-orange-100 text-orange-600" },
  { label: "Zones Online", value: "12 / 14", helper: "85.7% online", icon: Wifi, tone: "bg-blue-100 text-blue-700" },
];

const statusFilters = [
  ["All", "bg-[#5B1467]"],
  ["Available", "bg-green-500"],
  ["In Use", "bg-amber-400"],
  ["Reserved", "bg-blue-500"],
  ["Missing", "bg-red-500"],
  ["Maintenance", "bg-orange-500"],
];

const zones = [
  { name: "Storage Bay A", count: "98 Tools", style: "left-[8%] top-[3%] h-[42%] w-[31%] border-green-500 bg-green-100/55", label: "left-[20%] top-[10%] border-green-500 bg-green-50" },
  { name: "Storage Bay B", count: "76 Tools", style: "left-[52%] top-[10%] h-[36%] w-[17%] border-amber-400 bg-amber-100/55", label: "left-[54%] top-[17%] border-amber-400 bg-amber-50" },
  { name: "Repair Area", count: "12 Tools", style: "left-[72%] top-[10%] h-[32%] w-[16%] border-purple-500 bg-purple-100/55", label: "left-[74%] top-[19%] border-purple-500 bg-purple-50" },
  { name: "Dispatch Zone", count: "34 Tools", style: "left-[8%] top-[49%] h-[36%] w-[24%] border-blue-500 bg-blue-100/55", label: "left-[13%] top-[59%] border-blue-500 bg-blue-50" },
  { name: "Receiving Area", count: "21 Tools", style: "left-[37%] top-[69%] h-[22%] w-[31%] border-cyan-500 bg-cyan-100/55", label: "left-[43%] top-[75%] border-cyan-500 bg-cyan-50" },
  { name: "Maintenance Bay", count: "8 Tools", style: "left-[48%] top-[47%] h-[24%] w-[22%] border-red-500 bg-red-100/45", label: "left-[52%] top-[52%] border-red-500 bg-red-50" },
  { name: "Hazardous Area", count: "Restricted", style: "left-[76%] top-[47%] h-[31%] w-[18%] border-red-500 bg-[repeating-linear-gradient(135deg,rgba(239,68,68,0.12)_0,rgba(239,68,68,0.12)_6px,rgba(255,255,255,0.55)_6px,rgba(255,255,255,0.55)_13px)]", label: "left-[78%] top-[60%] border-red-500 bg-red-50" },
];

const markers = [
  ["16%", "19%", "bg-green-500", "D"], ["23%", "28%", "bg-red-500", "H"], ["31%", "36%", "bg-green-500", "S"],
  ["18%", "63%", "bg-blue-500", "W"], ["26%", "55%", "bg-blue-500", "S"], ["18%", "82%", "bg-green-500", "D"],
  ["26%", "80%", "bg-red-500", "H"], ["41%", "18%", "bg-green-500", "T"], ["43%", "36%", "bg-green-500", "T"],
  ["52%", "20%", "bg-amber-500", "S"], ["57%", "35%", "bg-green-500", "T"], ["61%", "64%", "bg-red-500", "D"],
  ["66%", "77%", "bg-amber-500", "W"], ["74%", "26%", "bg-purple-600", "R"], ["83%", "36%", "bg-green-500", "T"],
  ["84%", "82%", "bg-green-500", "D"], ["88%", "73%", "bg-slate-400", "O"], ["72%", "82%", "bg-cyan-400", "S"],
  ["35%", "25%", "bg-slate-400", "O"], ["11%", "26%", "bg-amber-500", "H"], ["46%", "52%", "bg-red-500", "M"],
  ["25%", "63%", "bg-slate-300", "O"], ["30%", "71%", "bg-slate-300", "O"], ["13%", "36%", "bg-green-500", "D"],
];

const zoneProgress = [
  ["Storage Bay A", "98 / 120", "82%", "bg-green-500", "w-[82%]"],
  ["Storage Bay B", "76 / 120", "63%", "bg-amber-400", "w-[63%]"],
  ["Dispatch Zone", "34 / 60", "57%", "bg-blue-500", "w-[57%]"],
  ["Repair Area", "12 / 30", "40%", "bg-purple-600", "w-[40%]"],
  ["Maintenance Bay", "8 / 20", "40%", "bg-red-500", "w-[40%]"],
];

const timeline = [
  ["10:32 AM", "Drill D-12", "Storage Bay A", "Job Site 4", "John Smith"],
  ["10:21 AM", "Hammer H-22", "Dispatch Zone", "Job Site 2", "Mike Johnson"],
  ["10:15 AM", "Wrench W-15", "Storage Bay B", "Repair Area", "Sarah Wilson"],
  ["10:02 AM", "Scanner SC-4", "Receiving Area", "Storage Bay A", "Tom Brown"],
  ["09:48 AM", "Saw S-16", "Maintenance Bay", "Repair Area", "David Lee"],
];

const alerts = [
  ["Missing Tool: Hammer H-22", "Not seen for 26 hours", "2m ago", AlertTriangle, "text-red-500 bg-red-50"],
  ["Left Geofence: Drill D-8", "Exited Storage Bay B", "10m ago", Route, "text-orange-500 bg-orange-50"],
  ["Maintenance Due: Saw S-16", "Due in 2 days", "1h ago", Wrench, "text-amber-500 bg-amber-50"],
  ["Low Battery: Scanner SC-4", "Battery at 12%", "2h ago", Zap, "text-blue-500 bg-blue-50"],
];

const recentActivity = [
  ["John Smith", "checked out Drill D-12", "Storage Bay A -> Job Site 4", "2 mins ago", CheckCircle2],
  ["Mike Johnson", "returned Hammer H-22", "Job Site 2 -> Dispatch Zone", "15 mins ago", Hammer],
  ["Sarah Wilson", "moved Wrench W-15", "Storage Bay B -> Repair Area", "25 mins ago", Wrench],
  ["Tom Brown", "scanned Scanner SC-4", "Receiving Area", "32 mins ago", QrCode],
];

const features = [
  [MapPinned, "Zone Management", "Create & edit zones on map", "bg-purple-100 text-purple-700"],
  [QrCode, "QR / RFID Scan", "Scan tools to update location", "bg-violet-100 text-violet-700"],
  [Radio, "Real-time Tracking", "Live updates every 10 sec", "bg-blue-100 text-blue-700"],
  [MapPin, "Geofencing Alerts", "Get notified on boundary breach", "bg-fuchsia-100 text-fuchsia-700"],
  [Route, "Route Replay", "Replay tool movement history", "bg-purple-100 text-purple-700"],
  [FileDown, "Reports & Export", "Export map & movement data", "bg-green-100 text-green-700"],
];

const renderIcon = (IconComponent, props) => createElement(IconComponent, props);

function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-[#07111f] px-3 py-4 text-white shadow-2xl">
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 shadow-inner">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#193e66] to-[#5B1467] text-sm font-black">DA</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Demo Account</p>
          <p className="truncate text-xs text-slate-300">demo@mybillbook.in</p>
        </div>
      </div>

      <nav className="mt-9 space-y-2 border-l border-white/10 pl-1">
        {navigation.map(({ label, icon, active }) => (
          <a
            href={label === "Map" ? "/inventory/tools/map" : "#"}
            key={label}
            className={`group flex items-center gap-3 rounded-r-xl px-3 py-3 text-sm font-semibold transition ${
              active
                ? "border-l-4 border-cyan-400 bg-gradient-to-r from-[#5B1467] to-[#6B1E78] text-white shadow-lg shadow-purple-950/40"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06]">
              {renderIcon(icon, { size: 16 })}
            </span>
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-7">
        <p className="px-3 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Administration</p>
        <div className="mt-4 space-y-2">
          {[[User, "Profile", "Personal profile, workspac..."], [Settings, "Settings", "Application settings, prefer..."]].map(([icon, title, sub]) => (
            <div key={title} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06]">{renderIcon(icon, { size: 15 })}</span>
              <span><span className="block font-semibold text-white">{title}</span><span className="text-xs">{sub}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.05] p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#193e66] to-[#5B1467]"><Sparkles size={17} /></span>
          <span><span className="block text-sm font-bold">Workspace settings</span><span className="text-xs text-slate-300">Manage theme, company info, and policies</span></span>
        </div>
      </div>
    </aside>
  );
}

function Header() {
  return (
    <header className="flex items-center gap-4">
      <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm"><ArrowLeft size={18} /></button>
      <div className="mr-auto">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-700">Tools & Assets</p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black leading-7 text-slate-950">Map</h1>
          <span className="rounded-full bg-[#5B1467]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#5B1467]">admin@example.com</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Real-time visibility and tracking of tools across sites and zones.</p>
      </div>
      <div className="flex h-12 w-[525px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <Search size={17} className="text-slate-500" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search tools, zones, employees, or scan QR..." />
        <kbd className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500">Ctrl /</kbd>
        <button className="rounded-xl bg-gradient-to-br from-[#5B1467] to-[#6B1E78] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-900/20">Go</button>
      </div>
      {["New Project", "New Product"].map((label) => (
        <button key={label} className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black leading-4 shadow-sm"><Plus size={16} />{label}</button>
      ))}
      <button className="grid h-12 w-12 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm"><Bell size={17} /></button>
      <button className="flex h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-blue-700 to-[#5B1467] text-xs font-black text-white">DA</span>
        <span className="text-left"><span className="block text-sm font-black">Demo Account</span><span className="block text-xs text-slate-500">Admin</span></span>
        <ChevronDown size={16} />
      </button>
    </header>
  );
}

function KPICards() {
  return (
    <section className="grid grid-cols-5 gap-4">
      {kpis.map(({ label, value, helper, icon, tone }) => (
        <div key={label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
          <div>
            <p className="text-xs font-bold text-slate-600">{label}</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</p>
            <p className="mt-2 text-xs text-slate-500">{helper}</p>
          </div>
          <span className={`grid h-12 w-12 place-items-center rounded-full ${tone}`}>{renderIcon(icon, { size: 24 })}</span>
        </div>
      ))}
    </section>
  );
}

function FiltersPanel() {
  const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none";
  return (
    <aside className="w-[230px] shrink-0">
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">Filters</h2>
          <button className="text-xs font-bold text-[#5B1467]">Clear all</button>
        </div>
        <div className="space-y-3">
          {["Search Tools", "Site", "Zone", "Category"].map((label, index) => (
            <label key={label} className="block">
              <span className="mb-1 block text-[11px] font-bold text-slate-700">{label}</span>
              {index === 0 ? <input className={selectClass} placeholder="Tool ID, name or serial..." /> : <select className={selectClass}><option>{index === 1 ? "All Sites" : index === 2 ? "All Zones" : "All Categories"}</option></select>}
            </label>
          ))}
          <div>
            <span className="mb-2 block text-[11px] font-bold text-slate-700">Status</span>
            <div className="grid grid-cols-3 gap-x-2 gap-y-2">
              {statusFilters.map(([label, dot]) => (
                <label key={label} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-700"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</label>
              ))}
            </div>
          </div>
          <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-700">Employee</span><select className={selectClass}><option>All Employees</option></select></label>
          <label className="block"><span className="mb-1 block text-[11px] font-bold text-slate-700">Date Range</span><div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700"><Clock3 size={14} />May 6, 2024 - May 13, 2024</div></label>
          <button className="h-10 w-full rounded-lg border border-[#5B1467]/35 bg-[#5B1467]/5 text-xs font-black text-[#5B1467]">Apply Filters</button>
        </div>
      </div>
      <button className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-[#5B1467] to-[#6B1E78] text-sm font-black text-white shadow-lg shadow-purple-900/25"><QrCode size={18} />Scan QR / RFID</button>
    </aside>
  );
}

function InventoryMap() {
  return (
    <section className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {[[MapPin, "Map View", true], [List, "List View"], [Activity, "Heatmap"], [Layers, "Layers"]].map(([icon, label, active]) => (
            <button key={label} className={`flex h-9 items-center gap-2 rounded-lg border px-4 text-xs font-black ${active ? "border-[#5B1467] bg-[#5B1467] text-white" : "border-slate-200 bg-white text-slate-700"}`}>{renderIcon(icon, { size: 15 })}{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-500">Floor</span>
          <button className="flex h-9 w-40 items-center justify-between rounded-lg border border-slate-200 px-3 font-bold">Ground Floor <ChevronDown size={15} /></button>
        </div>
      </div>

      <div className="relative h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(15,23,42,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
        <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 900 520" preserveAspectRatio="none">
          <path d="M28 26H835v42h33v102h-20v68h25v106h-41v132H40V380H15V250h54V28" fill="none" stroke="#111827" strokeWidth="3" />
          {Array.from({ length: 16 }).map((_, i) => <path key={i} d={`M${60 + i * 50} 30v448`} stroke="#334155" strokeWidth="1" />)}
          {Array.from({ length: 9 }).map((_, i) => <path key={i} d={`M30 ${70 + i * 45}h830`} stroke="#64748b" strokeWidth="1" />)}
          <path d="M42 210h120v56H42zm0 68h120v64H42m505-250v300M692 35v120m0 185v132M112 40v148m0 190v98" fill="none" stroke="#0f172a" strokeWidth="2" />
        </svg>
        {zones.map((zone) => (
          <div key={zone.name}>
            <div className={`absolute rounded-sm border-2 ${zone.style}`} />
            <div className={`absolute rounded-md border px-3 py-2 text-xs shadow-sm ${zone.label}`}>
              <p className="font-black text-slate-950">{zone.name}</p>
              <p className={zone.count === "Restricted" ? "font-bold text-red-600" : "text-slate-700"}>{zone.count}</p>
            </div>
          </div>
        ))}
        {markers.map(([left, top, color, label], index) => (
          <button key={`${left}-${top}-${index}`} className={`absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-lg border-2 border-white ${color} text-[9px] font-black text-white shadow-lg ring-2 ring-slate-900/5`} style={{ left, top }}>{label}</button>
        ))}

        <div className="absolute left-4 top-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {[Plus, Minus, Fullscreen, Target].map((icon, index) => <button key={index} className="grid h-11 w-11 place-items-center border-b border-slate-100 last:border-b-0">{renderIcon(icon, { size: 18 })}</button>)}
        </div>

        <div className="absolute right-4 top-4 w-36 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="mb-3 text-xs font-black">Tool Status</p>
          {statusFilters.slice(1).concat([["Offline", "bg-slate-400"]]).map(([label, dot]) => <p key={label} className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{label}</p>)}
        </div>

        <div className="absolute bottom-16 right-4 w-36 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="mb-3 text-xs font-black">Layers</p>
          {["Zones", "Tool Markers", "Heatmap", "Maintenance", "Employees", "CCTV Feeds"].map((item, i) => (
            <div key={item} className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700"><span>{item}</span><span className={`h-4 w-7 rounded-full p-0.5 ${i < 2 || i === 3 ? "bg-[#5B1467]" : "bg-slate-200"}`}><span className={`block h-3 w-3 rounded-full bg-white ${i < 2 || i === 3 ? "ml-3" : ""}`} /></span></div>
          ))}
        </div>

        <button className="absolute bottom-4 right-4 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black shadow-lg"><LocateFixed size={17} />Locate Me <ChevronDown size={15} /></button>
      </div>
    </section>
  );
}

function ToolDetailsPanel() {
  return (
    <aside className="w-[280px] shrink-0 space-y-4">
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">Tool Details</h2><div className="flex gap-3 text-slate-500"><ChevronsUpDown size={15} /><X size={15} /></div></div>
        <div className="flex gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-xl bg-slate-100"><Drill size={54} className="text-slate-900" /></div>
          <div className="min-w-0 flex-1">
            <span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-black text-green-700">Available</span>
            <h3 className="mt-2 text-base font-black text-slate-950">Cordless Drill D-12</h3>
            <p className="text-xs text-slate-500">ID: DRL-D12-8832</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-xs">
          {["Category", "Power Tools", "Zone", "Storage Bay A", "Last Seen", "2 mins ago", "Assigned To", "John Smith"].map((item, i) => <div key={`${item}-${i}`} className={i % 2 ? "font-bold text-slate-800" : "text-slate-500"}>{item}</div>)}
        </dl>
        <div className="mt-3 flex items-center gap-3 text-xs"><span className="font-bold text-slate-500">Battery: 78%</span><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 w-[78%] rounded-full bg-green-500" /></div></div>
        <div className="mt-5 grid grid-cols-2 gap-2"><button className="h-10 rounded-lg border border-slate-200 text-xs font-black">View Details</button><button className="h-10 rounded-lg bg-gradient-to-r from-[#5B1467] to-[#6B1E78] text-xs font-black text-white">Track History</button></div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">Alerts</h2><button className="text-xs font-bold text-[#5B1467]">View all</button></div>
        <div className="space-y-3">
          {alerts.map(([title, sub, time, icon, tone]) => <div key={title} className="flex items-start gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full ${tone}`}>{renderIcon(icon, { size: 15 })}</span><span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-900">{title}</span><span className="text-xs text-slate-500">{sub}</span></span><span className="text-[10px] text-slate-500">{time}</span></div>)}
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">Zone Overview</h2><button className="text-xs font-bold text-[#5B1467]">View all</button></div>
        <div className="space-y-5">
          {zoneProgress.map(([name, count, pct, color, width]) => <div key={name}><div className="mb-2 flex items-center gap-3 text-xs"><span className={`h-2.5 w-2.5 rounded-full ${color}`} /><span className="flex-1 font-black text-slate-800">{name}</span><span className="font-bold">{count}</span><span>{pct}</span></div><div className="h-1.5 rounded-full bg-slate-200"><div className={`h-1.5 rounded-full ${color} ${width}`} /></div></div>)}
        </div>
      </div>
    </aside>
  );
}

function BottomAnalytics() {
  return (
    <section className="grid grid-cols-[1.1fr_1fr_1fr] gap-4">
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">Movement Timeline</h2><span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-bold text-green-700"><span className="h-2 w-2 rounded-full bg-green-500" />Live</span></div>
        <table className="w-full text-left text-xs"><thead className="text-slate-500"><tr>{["Time", "Tool", "From", "To", "By"].map((h) => <th key={h} className="pb-3 font-bold">{h}</th>)}</tr></thead><tbody>{timeline.map((row) => <tr key={row.join("-")} className="font-semibold text-slate-800">{row.map((cell) => <td key={cell} className="py-2">{cell}</td>)}</tr>)}</tbody></table>
        <button className="mt-4 flex items-center gap-2 text-sm font-black text-[#5B1467]">View full timeline <Route size={14} /></button>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black uppercase tracking-[0.16em] text-slate-700">Tool Heatmap (Density)</h2><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Last 24 hours</button></div>
        <div className="relative h-52 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(15,23,42,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
          {["left-[12%] top-[18%] h-28 w-28 bg-green-400", "left-[20%] top-[33%] h-24 w-24 bg-red-500", "left-[42%] top-[25%] h-20 w-20 bg-yellow-400", "left-[64%] top-[10%] h-24 w-24 bg-cyan-300", "left-[70%] top-[55%] h-16 w-16 bg-blue-500", "left-[45%] top-[58%] h-16 w-16 bg-orange-500"].map((cls) => <div key={cls} className={`absolute rounded-full blur-xl ${cls} opacity-70`} />)}
          <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[10px] font-bold"><span>Low</span><span className="h-24 w-2 rounded-full bg-gradient-to-t from-blue-500 via-green-400 via-yellow-300 to-red-500" /><span>High</span></div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-[0_14px_35px_rgba(15,23,42,0.08)]">
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-slate-700">Recent Activity</h2>
        <div className="space-y-3">{recentActivity.map(([name, action, loc, time, icon]) => <div key={`${name}-${action}`} className="flex gap-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-green-50 text-green-700">{renderIcon(icon, { size: 15 })}</span><span className="min-w-0 flex-1 text-xs"><span className="font-black">{name}</span> {action}<span className="block text-slate-500">{loc}</span></span><span className="text-[10px] text-slate-500">{time}</span></div>)}</div>
        <button className="mt-4 flex items-center gap-2 text-sm font-black text-[#5B1467]">View all activity <Route size={14} /></button>
      </div>
    </section>
  );
}

function FeatureStrip() {
  return (
    <section className="grid grid-cols-6 border-t border-slate-200 bg-white px-9 py-4 shadow-[0_-10px_30px_rgba(15,23,42,0.04)]">
      {features.map(([icon, title, sub, tone], index) => (
        <div key={title} className={`flex items-center gap-4 px-5 ${index ? "border-l border-slate-200" : ""}`}>
          <span className={`grid h-12 w-12 place-items-center rounded-full ${tone}`}>{renderIcon(icon, { size: 23 })}</span>
          <span><span className="block text-sm font-black text-slate-950">{title}</span><span className="text-xs text-slate-500">{sub}</span></span>
        </div>
      ))}
    </section>
  );
}

export default function ToolsMap() {
  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-[#f8fafc]">
          <div className="space-y-4 p-6">
            <Header />
            <KPICards />
            <section className="flex gap-4">
              <FiltersPanel />
              <InventoryMap />
              <ToolDetailsPanel />
            </section>
            <BottomAnalytics />
          </div>
          <FeatureStrip />
        </main>
      </div>
    </div>
  );
}
