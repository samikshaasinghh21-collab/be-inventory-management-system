import logo from "../../assets/images/bangalore-electronics-logo.png";

const highlights = [
  { label: "Vendors", value: "120+" },
  { label: "Warehouses", value: "18" },
  { label: "On-time POs", value: "97%" },
];

const AuthShell = ({ title, subtitle, children, helper }) => (
  <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-center justify-center px-4 py-10">
    <div className="w-full max-w-6xl grid gap-10 lg:grid-cols-[1.05fr_0.95fr] items-stretch">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/80 shadow-[0_24px_120px_rgba(8,15,30,0.65)] px-10 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.12),transparent_25%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.10),transparent_28%)]" />
        <div className="relative space-y-8">
          <div className="flex items-center gap-4">
            <div className="bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/70 shadow-lg">
              <img src={logo} alt="Bangalore Electronics logo" className="h-10 w-auto" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-200/80">Workspace</p>
              <p className="display-font text-2xl font-semibold text-slate-50">Bangalore Electronics</p>
            </div>
          </div>

          <p className="text-lg text-slate-300 max-w-xl leading-relaxed">
            Manage procurement, warehouse intake, and project allocations from a unified console built for operations.
          </p>

          <div className="grid grid-cols-3 gap-4">
            {highlights.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-center shadow-inner shadow-black/20">
                <p className="display-font text-xl font-semibold text-white">{item.value}</p>
                <p className="text-sm text-slate-400">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {["Purchase orders", "Stock analytics", "Role-based access", "Delivery tracking"].map((tag) => (
              <span key={tag} className="rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm text-emerald-100">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative bg-slate-900/90 border border-slate-800 rounded-3xl shadow-[0_22px_70px_rgba(8,15,30,0.45)] p-10 lg:p-12">
        <div className="absolute -left-14 -top-14 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" aria-hidden />
        <div className="absolute -right-10 bottom-10 h-24 w-24 rounded-full bg-sky-500/10 blur-3xl" aria-hidden />
        <div className="relative space-y-8">
          <div className="space-y-2">
            <p className="display-font text-2xl text-slate-50">{title}</p>
            <p className="text-slate-300">{subtitle}</p>
          </div>
          {children}
          {helper && <div className="text-sm text-slate-400">{helper}</div>}
        </div>
      </div>
    </div>
  </div>
);

export default AuthShell;
