import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppIcon from "../components/layout/AppIcon";

const seedEmployees = [];

const HRMS_STORAGE_KEYS = {
  attendance: "hrms:attendance",
  employees: "hrms:employees",
  payroll: "hrms:payroll",
  relieving: "hrms:relieving",
  reports: "hrms:reports",
  reviews: "hrms:reviews",
  salaryHistory: "hrms:salary-history",
  session: "hrms:session",
};

const demoEmployeeFingerprints = new Set([
  "EMP001|John Doe|john.doe@mail.com",
  "EMP002|Jane Smith|jane.smith@mail.com",
  "EMP003|Michael Brown|michael.b@mail.com",
  "EMP004|Emily Davis|emily.davis@mail.com",
  "EMP005|David Wilson|david.wilson@mail.com",
]);

const removeDemoEmployees = (records = []) => {
  const cleanedRecords = records.filter((employee) => {
    const fingerprint = [
      employee.id,
      employee.name,
      employee.email,
    ].join("|");

    return !demoEmployeeFingerprints.has(fingerprint);
  });

  return cleanedRecords.length === records.length ? records : cleanedRecords;
};

const readStoredList = (key, fallback = []) => {
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored);
    const records = Array.isArray(parsed) ? parsed : fallback;

    if (key !== HRMS_STORAGE_KEYS.employees) return records;

    const cleanedRecords = removeDemoEmployees(records);
    if (cleanedRecords.length !== records.length) {
      window.localStorage.setItem(key, JSON.stringify(cleanedRecords));
    }

    return cleanedRecords;
  } catch {
    return fallback;
  }
};

const writeStoredList = (key, value) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage can fail in private browsing or quota-limited contexts.
  }
};

const useStoredList = (key, fallback = []) => {
  const [items, setItems] = useState(() => readStoredList(key, fallback));

  const saveItems = (updater) => {
    setItems((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      writeStoredList(key, next);
      return next;
    });
  };

  return [items, saveItems];
};

const useHrmsEmployees = () => {
  const [employees, saveEmployees] = useStoredList(
    HRMS_STORAGE_KEYS.employees,
    seedEmployees
  );
  const cleanedEmployees = removeDemoEmployees(employees);

  useEffect(() => {
    if (cleanedEmployees.length !== employees.length) {
      saveEmployees(cleanedEmployees);
    }
  }, [cleanedEmployees, employees, saveEmployees]);

  const saveCleanEmployees = (updater) => {
    saveEmployees((current) => {
      const cleanedCurrent = removeDemoEmployees(current);
      const next =
        typeof updater === "function" ? updater(cleanedCurrent) : updater;
      return removeDemoEmployees(next);
    });
  };

  return [cleanedEmployees, saveCleanEmployees];
};

const saveSession = (session) => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      HRMS_STORAGE_KEYS.session,
      JSON.stringify(session)
    );
  } catch {
    // Ignore local storage failures.
  }
};

const createEmployeeId = (records) => {
  const maxNumber = records.reduce((max, employee) => {
    const match = String(employee.id || "").match(/\d+/);
    return Math.max(max, match ? Number(match[0]) : 0);
  }, 0);

  return `EMP${String(maxNumber + 1).padStart(3, "0")}`;
};

const getInitials = (name = "") =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "EM";

const todayValue = () => new Date().toISOString().slice(0, 10);

const formatDate = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return day && month && year ? `${day}-${month}-${year}` : value;
};

const toDateInputValue = (value = "") => {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
};

const displayValue = (value) => {
  const text = String(value ?? "").trim();
  return text || "Not provided";
};

const maritalStatusOptions = ["Single", "Married", "Divorced", "Widowed"];
const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const buildEmployeeForm = (employee) => {
  const source = employee ?? {};

  return {
    address: source.address || "",
    bloodGroup: source.bloodGroup || "",
    dateOfBirth: toDateInputValue(source.dateOfBirth),
    department: source.department || "",
    designation: source.designation || "",
    email: source.email || "",
    fullName: source.name || "",
    gender: source.gender || "",
    joined: toDateInputValue(source.joined),
    manager: source.manager || "",
    maritalStatus: source.maritalStatus || "",
    nationality: source.nationality || "",
    phone: source.phone || "",
    photo: source.photo || "",
    salary: String(source.salary || ""),
    status: source.status || "Active",
  };
};

const readProfilePhoto = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    if (!file.type?.startsWith("image/")) {
      reject(new Error("Please upload a valid image file."));
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      reject(new Error("Profile picture must be 4 MB or smaller."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");

        if (!context) {
          resolve(String(reader.result || ""));
          return;
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => resolve(String(reader.result || ""));
      image.src = String(reader.result || "");
    };

    reader.onerror = () =>
      reject(new Error("Could not read the selected profile picture."));
    reader.readAsDataURL(file);
  });

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const printEmployeeProfile = (employee) => {
  if (typeof window === "undefined" || !employee) return;

  const printableRows = [
    ["Employee ID", displayValue(employee.id)],
    ["Name", displayValue(employee.name)],
    ["Department", displayValue(employee.department)],
    ["Designation", displayValue(employee.designation)],
    ["Email", displayValue(employee.email)],
    ["Phone", displayValue(employee.phone)],
    ["Status", displayValue(employee.status)],
    ["Reporting To", displayValue(employee.manager)],
    ["Date of Joining", displayValue(employee.joined)],
    ["Date of Birth", displayValue(employee.dateOfBirth)],
    ["Marital Status", displayValue(employee.maritalStatus)],
    ["Nationality", displayValue(employee.nationality)],
    ["Blood Group", displayValue(employee.bloodGroup)],
    ["Salary", money(employee.salary)],
    ["Address", displayValue(employee.address)],
  ];
  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(employee.name)} - Employee Profile</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            color: #0f172a;
            font-family: Arial, sans-serif;
            background: #ffffff;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 18px;
          }
          h1 { margin: 0; font-size: 26px; }
          .muted { margin: 6px 0 0; color: #64748b; font-size: 13px; }
          .photo {
            width: 96px;
            height: 96px;
            border-radius: 999px;
            border: 1px solid #cbd5e1;
            object-fit: cover;
          }
          .initials {
            display: grid;
            width: 96px;
            height: 96px;
            place-items: center;
            border-radius: 999px;
            background: #0f172a;
            color: white;
            font-size: 26px;
            font-weight: 700;
          }
          table {
            width: 100%;
            margin-top: 28px;
            border-collapse: collapse;
            font-size: 14px;
          }
          th, td {
            border: 1px solid #e2e8f0;
            padding: 11px 12px;
            text-align: left;
            vertical-align: top;
          }
          th {
            width: 210px;
            background: #f8fafc;
            color: #475569;
          }
          .footer {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
            gap: 32px;
            color: #475569;
            font-size: 13px;
          }
          @media print {
            body { padding: 18px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <section class="header">
          <div>
            <h1>Employee Profile</h1>
            <p class="muted">Generated from HRMS local data</p>
          </div>
          ${
            employee.photo
              ? `<img class="photo" src="${employee.photo}" alt="${escapeHtml(
                  employee.name
                )}" />`
              : `<div class="initials">${escapeHtml(
                  employee.avatar || getInitials(employee.name)
                )}</div>`
          }
        </section>
        <table>
          <tbody>
            ${printableRows
              .map(
                ([label, value]) =>
                  `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(
                    value
                  )}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
        <section class="footer">
          <span>Prepared By: HRMS Admin</span>
          <span>Signature: __________________</span>
        </section>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
};

const cycleAttendanceStatus = (status) => {
  const order = ["P", "A", "L", "H"];
  const currentIndex = order.indexOf(status);
  return order[(currentIndex + 1) % order.length] || "P";
};

const statusClasses = {
  Active: "bg-emerald-50 text-emerald-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Draft: "bg-slate-100 text-slate-700",
  "On Leave": "bg-rose-50 text-rose-700",
  Pending: "bg-amber-50 text-amber-700",
  Processed: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-rose-50 text-rose-700",
  Relieved: "bg-slate-100 text-slate-700",
  "Revision Requested": "bg-amber-50 text-amber-700",
  "Salary Activated": "bg-blue-50 text-blue-700",
};

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const clampNumber = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const averageScore = (values = []) => {
  const scores = values.map((value) => clampNumber(value));
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
};

const scoreGrade = (score) => {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
};

const downloadTextFile = (filename, content, type = "text/plain") => {
  if (typeof window === "undefined") return;

  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
};

const Field = ({ label, children }) => (
  <label className="grid gap-1.5 text-xs font-semibold text-slate-700">
    {label}
    {children}
  </label>
);

const Input = ({ as: Component = "input", className = "", ...props }) => (
  <Component
    className={[
      "min-h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  />
);

const Button = ({ children, variant = "primary", className = "", ...props }) => {
  const variants = {
    primary: "border-blue-700 bg-blue-700 text-white hover:bg-blue-800",
    danger: "border-rose-600 bg-rose-600 text-white hover:bg-rose-700",
    secondary: "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
    ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
  };

  return (
    <button
      type="button"
      className={[
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
};

const Panel = ({ children, className = "", ...props }) => (
  <section
    className={[
      "rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    {children}
  </section>
);

const RegisterDocumentView = ({
  title,
  subtitle,
  onClose,
  leftTitle = "Employee Details",
  leftRows = [],
  rightTitle = "Register Details",
  rightRows = [],
  tableColumns = [],
  tableRows = [],
  bottomLeftTitle = "Remarks",
  bottomLeftValue = "-",
  bottomRightTitle = "For HR Department",
  bottomRightValue = "Authorised Signatory",
}) => (
  <div className="border border-slate-800 text-xs text-slate-900">
    <div className="border-b border-slate-800 p-2">
      <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-wide">
        <span>{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-600 border border-slate-300 rounded-full"
        >
          Close view
        </button>
      </div>
      {subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}
    </div>

    <div className="grid grid-cols-2 border-b border-slate-800">
      <div className="p-3 border-r border-slate-800">
        <p className="mb-2 font-semibold">{leftTitle}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {leftRows.map(([label, value]) => (
            <div key={label} className="contents">
              <p className="text-slate-600">{label}:</p>
              <p className="font-semibold whitespace-pre-line">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3">
        <p className="mb-2 font-semibold">{rightTitle}</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {rightRows.map(([label, value]) => (
            <div key={label} className="contents">
              <p className="text-slate-600">{label}:</p>
              <p className="font-semibold whitespace-pre-line">{value || "-"}</p>
            </div>
          ))}
        </div>
      </div>
    </div>

    {tableColumns.length > 0 && (
      <table className="w-full text-[11px] border-b border-slate-800">
        <thead>
          <tr className="border-b border-slate-800">
            {tableColumns.map((column) => (
              <th key={column} className="p-2 text-left">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, index) => (
            <tr key={row.id || index} className="border-b border-slate-200">
              {row.values.map((value, valueIndex) => (
                <td key={`${row.id || index}-${valueIndex}`} className="p-2">
                  {value || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )}

    <div className="grid grid-cols-2 border-b border-slate-800 text-[11px]">
      <div className="p-3 border-r border-slate-800">
        <p className="font-semibold">{bottomLeftTitle}</p>
        <p className="mt-1 whitespace-pre-line">{bottomLeftValue || "-"}</p>
      </div>
      <div className="p-3 text-right">
        <p className="font-semibold">{bottomRightTitle}</p>
        <div className="mt-8 border-t border-slate-700 pt-2">
          {bottomRightValue}
        </div>
      </div>
    </div>
  </div>
);

const Avatar = ({ initials, size = "md", src }) => {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-20 w-20 text-xl",
  };

  return (
    <span
      className={[
        "inline-grid shrink-0 place-items-center rounded-full bg-slate-900 font-bold text-white",
        sizes[size],
      ].join(" ")}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
};

const StatusBadge = ({ status }) => (
  <span
    className={[
      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
      statusClasses[status] || "bg-slate-100 text-slate-600",
    ].join(" ")}
  >
    {status}
  </span>
);

const ScoreBar = ({ label, value, tone = "blue" }) => {
  const tones = {
    amber: "bg-amber-500",
    blue: "bg-blue-600",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
  };
  const score = clampNumber(value);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs font-bold">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-900">{score}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${tones[tone] || tones.blue}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const ScoreInput = ({ label, value, onChange }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <ScoreBar label={label} value={value} />
    <Input
      type="range"
      min="0"
      max="100"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-3 px-0"
    />
  </div>
);

const RadarChart = ({ metrics = [] }) => {
  const size = 220;
  const center = size / 2;
  const radius = 78;
  const safeMetrics = metrics.length ? metrics : [{ label: "Score", value: 0 }];
  const pointFor = (index, scale = 1) => {
    const angle = (Math.PI * 2 * index) / safeMetrics.length - Math.PI / 2;
    return [
      center + Math.cos(angle) * radius * scale,
      center + Math.sin(angle) * radius * scale,
    ];
  };
  const polygonPoints = safeMetrics
    .map((metric, index) =>
      pointFor(index, clampNumber(metric.value) / 100).join(",")
    )
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-56 w-full">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={safeMetrics.map((_, index) => pointFor(index, scale).join(",")).join(" ")}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}
      {safeMetrics.map((metric, index) => {
        const [x, y] = pointFor(index, 1.1);
        return (
          <text
            key={metric.label}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-500 text-[9px] font-bold"
          >
            {metric.label}
          </text>
        );
      })}
      <polygon
        points={polygonPoints}
        fill="#2563eb"
        fillOpacity="0.16"
        stroke="#2563eb"
        strokeWidth="2"
      />
    </svg>
  );
};

const SalaryGrowthChart = ({ records = [], currentSalary = 0 }) => {
  const values = records.length
    ? records.map((record) => Number(record.revisedSalary || record.currentSalary || 0))
    : [Number(currentSalary || 0)];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const width = 520;
  const height = 180;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / Math.max(1, max - min)) * 130 - 25;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full">
      <path d="M0 155H520" stroke="#e2e8f0" />
      <polyline points={points} fill="none" stroke="#059669" strokeWidth="3" />
      {points.split(" ").map((point, index) => {
        const [x, y] = point.split(",");
        return (
          <g key={`${point}-${index}`}>
            <circle cx={x} cy={y} r="4" fill="#059669" />
            <text x={x} y={Number(y) - 10} textAnchor="middle" className="fill-slate-600 text-[11px] font-bold">
              {money(values[index])}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const Notice = ({ children, tone = "success" }) => {
  if (!children) return null;

  const tones = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div
      className={[
        "rounded-md border px-3 py-2 text-sm font-semibold",
        tones[tone] || tones.success,
      ].join(" ")}
    >
      {children}
    </div>
  );
};

const HrmsShell = ({ children }) => {
  return (
    <div className="min-h-[calc(100vh-7rem)] rounded-lg border border-slate-200 bg-slate-50 p-4 text-slate-900 shadow-sm">
      {children}
    </div>
  );
};

const HrmsLoginPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });

  const handleSubmit = (event) => {
    event.preventDefault();
    saveSession({
      username: form.username || "admin",
      loggedInAt: new Date().toISOString(),
    });
    navigate("/dashboard");
  };

  return (
    <main className="grid min-h-screen bg-white text-slate-900 lg:grid-cols-2">
      <section className="relative flex min-h-[360px] items-center overflow-hidden bg-gradient-to-br from-blue-600 to-blue-300 p-8 text-white">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute bottom-10 left-8 h-16 w-16 rounded-full bg-white/10" />
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold">HRMS</h1>
          <p className="mt-3 text-xl font-semibold">
            Human Resource Management System
          </p>
          <div className="mt-10 grid max-w-sm grid-cols-[1fr_88px] items-end gap-4">
            <div className="rounded-lg bg-white/15 p-4 backdrop-blur">
              <div className="mb-4 flex items-center gap-3">
                <Avatar initials="HR" />
                <div className="h-2 flex-1 rounded-full bg-white/55" />
              </div>
              <div className="space-y-2">
                <div className="h-2 rounded-full bg-white/45" />
                <div className="h-2 w-3/4 rounded-full bg-white/35" />
              </div>
            </div>
            <div className="grid justify-items-center gap-2">
              <div className="h-16 w-16 rounded-full bg-slate-900" />
              <div className="h-24 w-20 rounded-t-full bg-blue-800" />
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
        >
          <h2 className="text-center text-2xl font-bold text-slate-900">
            Welcome Back!
          </h2>
          <p className="mt-1 text-center text-sm text-slate-500">
            Please login to your account
          </p>

          <div className="mt-8 grid gap-4">
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                placeholder="Enter username"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                placeholder="Enter password"
              />
            </Field>
            <Link
              to="/dashboard"
              className="justify-self-end text-xs font-semibold text-blue-700"
            >
              Forgot Password?
            </Link>
            <Button type="submit" className="w-full">
              Login
            </Button>
          </div>

          <p className="mt-8 text-center text-xs text-slate-400">
            2024 HRMS. All rights reserved.
          </p>
        </form>
      </section>
    </main>
  );
};

const DashboardPage = () => {
  const [storedEmployees] = useHrmsEmployees();
  const [reviews] = useStoredList(HRMS_STORAGE_KEYS.reviews, []);
  const [payroll] = useStoredList(HRMS_STORAGE_KEYS.payroll, []);
  const [relieving] = useStoredList(HRMS_STORAGE_KEYS.relieving, []);
  const totalEmployees = storedEmployees.length;
  const activeEmployees = storedEmployees.filter(
    (employee) => employee.status === "Active"
  ).length;
  const onLeaveEmployees = storedEmployees.filter(
    (employee) => employee.status === "On Leave"
  ).length;
  const relievedEmployees = storedEmployees.filter(
    (employee) => employee.status === "Relieved"
  ).length;
  const latestPayroll = payroll[payroll.length - 1];
  const recentEmployee = storedEmployees[0];

  const stats = [
    { label: "Total Employees", value: totalEmployees, delta: "Saved locally" },
    { label: "Active Employees", value: activeEmployees, delta: "Live count" },
    { label: "On Leave", value: onLeaveEmployees, delta: "Live count" },
    { label: "Relieved", value: relievedEmployees, delta: "Live count" },
  ];

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <Panel key={item.label}>
            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-xs font-semibold text-blue-600">{item.delta}</p>
          </Panel>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel>
          <h2 className="text-sm font-bold">Monthly Attendance</h2>
          <div className="mt-4 flex items-center gap-5">
            <div
              className="grid h-28 w-28 place-items-center rounded-full"
              style={{
                background:
                  "conic-gradient(#2563eb 0 85%, #ef4444 85% 95%, #f59e0b 95% 100%)",
              }}
            >
              <div className="grid h-20 w-20 place-items-center rounded-full bg-white text-xl font-bold">
                85%
              </div>
            </div>
            <div className="grid gap-2 text-xs">
              {[
                ["Present", "85%", "bg-blue-600"],
                ["Absent", "10%", "bg-red-500"],
                ["Leave", "5%", "bg-amber-500"],
              ].map(([label, value, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${color}`} />
                  <span className="w-16 text-slate-600">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="grid place-items-center text-center">
          <div>
            <h2 className="text-sm font-bold">Pending Reviews</h2>
            <p className="mt-7 text-4xl font-bold">
              {Math.max(0, totalEmployees - reviews.length)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {reviews.length} reviews saved locally
            </p>
            <Link to="/reviews">
              <Button className="mt-4">View Reviews</Button>
            </Link>
          </div>
        </Panel>

        <Panel className="grid place-items-center text-center">
          <div>
            <h2 className="text-sm font-bold">Payroll Status</h2>
            <p className="mt-7 text-sm text-slate-500">
              {latestPayroll?.month || "May 2024"}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">Completed</p>
            <Link to="/payroll">
              <Button className="mt-4">View Payroll</Button>
            </Link>
          </div>
        </Panel>
      </section>

      <Panel>
        <h2 className="text-sm font-bold">Recent Activities</h2>
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm">
          <Avatar
            initials={recentEmployee?.avatar || "HR"}
            size="sm"
            src={recentEmployee?.photo}
          />
          <strong>{recentEmployee?.name || "No employees yet"}</strong>
          <span className="text-slate-500">
            {recentEmployee
              ? relieving.length
                ? "Relieving data saved"
                : reviews.length
                  ? "Review saved"
                  : "Employee data saved locally"
              : "Add employee details to start"}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            {recentEmployee ? "Local DB" : ""}
          </span>
        </div>
      </Panel>
    </div>
  );
};

const EmployeeListPage = () => {
  const [employees] = useHrmsEmployees();
  const [query, setQuery] = useState("");
  const filteredEmployees = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((employee) =>
      [
        employee.id,
        employee.name,
        employee.department,
        employee.designation,
        employee.email,
        employee.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query]);

  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search employee..."
          className="sm:max-w-xs"
        />
        <Link to="/employees/add">
          <Button>
            <AppIcon name="plus" className="h-4 w-4" />
            Add Employee
          </Button>
        </Link>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[820px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["ID", "Photo", "Name", "Department", "Designation", "Email", "Status", "Action"].map(
                (heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEmployees.map((employee) => (
              <tr key={employee.id} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-semibold">{employee.id}</td>
                <td className="px-3 py-3">
                  <Avatar
                    initials={employee.avatar}
                    size="sm"
                    src={employee.photo}
                  />
                </td>
                <td className="px-3 py-3">{employee.name}</td>
                <td className="px-3 py-3">{employee.department}</td>
                <td className="px-3 py-3">{employee.designation}</td>
                <td className="px-3 py-3">{employee.email}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={employee.status} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/employees/profile/${employee.id}`}
                      aria-label={`View ${employee.name}`}
                    >
                      <Button className="min-h-8 px-2 text-xs" variant="secondary">
                        <AppIcon name="user" className="h-4 w-4" />
                        View
                      </Button>
                    </Link>
                    <Link
                      to={`/employees/edit/${employee.id}`}
                      aria-label={`Edit ${employee.name}`}
                    >
                      <Button className="min-h-8 px-2 text-xs" variant="secondary">
                        <AppIcon name="edit" className="h-4 w-4" />
                        Edit
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((page) => (
          <button
            key={page}
            type="button"
            className={[
              "grid h-8 w-8 place-items-center rounded-md border text-xs font-bold",
              page === 1
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-200 bg-white text-slate-600",
            ].join(" ")}
          >
            {page}
          </button>
        ))}
      </div>
    </Panel>
  );
};

const AddEmployeePage = () => {
  const [employees, setEmployees] = useHrmsEmployees();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Personal Details");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    address: "",
    bloodGroup: "",
    dateOfBirth: "",
    department: "",
    designation: "",
    email: "",
    fullName: "",
    gender: "",
    joined: "",
    manager: "",
    maritalStatus: "",
    nationality: "",
    phone: "",
    photo: "",
    salary: "",
    status: "Active",
  });
  const tabs = ["Personal Details", "Employment Details", "Salary Details", "Documents"];
  const employeeId = useMemo(() => createEmployeeId(employees), [employees]);
  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  };
  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const photo = await readProfilePhoto(file);
      updateForm("photo", photo);
      setMessage("Profile picture added. Save the employee to keep it.");
    } catch (uploadError) {
      setError(uploadError.message || "Profile picture upload failed.");
      event.target.value = "";
    }
  };

  const handleSave = (event) => {
    event.preventDefault();

    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Full name, email, and phone number are required.");
      return;
    }

    const newEmployee = {
      id: employeeId,
      name: form.fullName.trim(),
      department: form.department,
      designation: form.designation,
      email: form.email.trim(),
      phone: form.phone.trim(),
      status: form.status,
      manager: form.manager.trim(),
      joined: formatDate(form.joined),
      salary: Number(form.salary) || 0,
      avatar: getInitials(form.fullName),
      address: form.address.trim(),
      bloodGroup: form.bloodGroup,
      dateOfBirth: formatDate(form.dateOfBirth),
      gender: form.gender,
      maritalStatus: form.maritalStatus,
      nationality: form.nationality.trim(),
      photo: form.photo,
    };

    setEmployees((current) => [newEmployee, ...current]);
    setMessage(`${newEmployee.name} saved locally as ${newEmployee.id}.`);
    window.setTimeout(() => navigate("/employees"), 450);
  };

  return (
    <Panel>
      <div className="mb-4 grid gap-2">
        <Notice>{message}</Notice>
        <Notice tone="warning">{error}</Notice>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={[
              "min-h-10 border-b-2 px-4 text-sm font-bold",
              tab === item
                ? "border-blue-700 text-blue-700"
                : "border-transparent text-slate-500",
            ].join(" ")}
          >
            {item}
          </button>
        ))}
      </div>

      <form
        className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_168px]"
        onSubmit={handleSave}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name">
            <Input
              value={form.fullName}
              onChange={(event) => updateForm("fullName", event.target.value)}
              placeholder="Enter full name"
            />
          </Field>
          <Field label="Employee ID">
            <Input value={employeeId} disabled />
          </Field>
          <Field label="Date of Birth">
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => updateForm("dateOfBirth", event.target.value)}
            />
          </Field>
          <Field label="Gender">
            <Input
              as="select"
              value={form.gender}
              onChange={(event) => updateForm("gender", event.target.value)}
            >
              <option value="" disabled>
                Select Gender
              </option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </Input>
          </Field>
          <Field label="Date of Joining">
            <Input
              type="date"
              value={form.joined}
              onChange={(event) => updateForm("joined", event.target.value)}
            />
          </Field>
          <Field label="Reporting Manager">
            <Input
              value={form.manager}
              onChange={(event) => updateForm("manager", event.target.value)}
              placeholder="Enter reporting manager"
            />
          </Field>
          <Field label="Nationality">
            <Input
              value={form.nationality}
              onChange={(event) => updateForm("nationality", event.target.value)}
              placeholder="Enter nationality"
            />
          </Field>
          <Field label="Marital Status">
            <Input
              as="select"
              value={form.maritalStatus}
              onChange={(event) => updateForm("maritalStatus", event.target.value)}
            >
              <option value="">Select Marital Status</option>
              {maritalStatusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Input>
          </Field>
          <Field label="Blood Group">
            <Input
              as="select"
              value={form.bloodGroup}
              onChange={(event) => updateForm("bloodGroup", event.target.value)}
            >
              <option value="">Select Blood Group</option>
              {bloodGroupOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Input>
          </Field>
          <Field label="Phone Number">
            <Input
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              placeholder="Enter phone number"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="Enter email"
            />
          </Field>
          <Field label="Department">
            <Input
              as="select"
              value={form.department}
              onChange={(event) => updateForm("department", event.target.value)}
            >
              <option value="">Select Department</option>
              <option>IT</option>
              <option>HR</option>
              <option>Finance</option>
              <option>Marketing</option>
            </Input>
          </Field>
          <Field label="Designation">
            <Input
              value={form.designation}
              onChange={(event) => updateForm("designation", event.target.value)}
              placeholder="Enter designation"
            />
          </Field>
          <Field label="Basic Salary">
            <Input
              type="number"
              min="0"
              value={form.salary}
              onChange={(event) => updateForm("salary", event.target.value)}
              placeholder="Enter salary"
            />
          </Field>
          <Field label="Status">
            <Input
              as="select"
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
            >
              <option>Active</option>
              <option>On Leave</option>
            </Input>
          </Field>
          <Field label="Address">
            <Input
              as="textarea"
              rows={3}
              value={form.address}
              onChange={(event) => updateForm("address", event.target.value)}
              placeholder="Enter address"
              className="sm:col-span-2"
            />
          </Field>
        </div>

        <div className="grid content-start gap-3">
          <p className="text-xs font-bold text-slate-700">Photo</p>
          <div className="grid aspect-square place-items-center rounded-md border border-slate-200 bg-slate-50">
            <Avatar
              initials={getInitials(form.fullName)}
              size="lg"
              src={form.photo}
            />
          </div>
          <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
        </div>

        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button variant="secondary" onClick={() => navigate("/employees")}>
            Cancel
          </Button>
          <Button type="submit">Save & Next</Button>
        </div>
      </form>
    </Panel>
  );
};

const EditEmployeePage = () => {
  const { employeeId } = useParams();
  const [employees, setEmployees] = useHrmsEmployees();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Personal Details");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const employee = useMemo(
    () =>
      employees.find((record) => record.id === employeeId) ||
      employees[0] ||
      null,
    [employeeId, employees]
  );
  const [form, setForm] = useState(() => buildEmployeeForm(employee));
  const tabs = ["Personal Details", "Employment Details", "Salary Details", "Documents"];

  useEffect(() => {
    setForm(buildEmployeeForm(employee));
    setError("");
    setMessage("");
  }, [employee]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  };
  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const photo = await readProfilePhoto(file);
      updateForm("photo", photo);
      setMessage("Profile picture updated. Click Update Employee to save it.");
    } catch (uploadError) {
      setError(uploadError.message || "Profile picture upload failed.");
      event.target.value = "";
    }
  };

  const handleUpdate = (event) => {
    event.preventDefault();

    if (!employee) {
      setError("No employee record found to update.");
      return;
    }

    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("Full name, email, and phone number are required.");
      return;
    }

    const updatedEmployee = {
      ...employee,
      name: form.fullName.trim(),
      department: form.department,
      designation: form.designation.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      status: form.status,
      manager: form.manager.trim(),
      joined: formatDate(form.joined),
      salary: Number(form.salary) || 0,
      avatar: getInitials(form.fullName),
      address: form.address.trim(),
      bloodGroup: form.bloodGroup,
      dateOfBirth: formatDate(form.dateOfBirth),
      gender: form.gender,
      maritalStatus: form.maritalStatus,
      nationality: form.nationality.trim(),
      photo: form.photo,
    };

    setEmployees((current) =>
      current.map((record) =>
        record.id === updatedEmployee.id ? updatedEmployee : record
      )
    );
    setMessage(`${updatedEmployee.name} updated locally.`);
    window.setTimeout(() => navigate("/employees"), 450);
  };

  if (!employee) {
    return (
      <Panel>
        <Notice tone="warning">No employee record found to edit.</Notice>
        <Button className="mt-4" onClick={() => navigate("/employees")}>
          Back to Employees
        </Button>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="mb-4 grid gap-2">
        <Notice>{message}</Notice>
        <Notice tone="warning">{error}</Notice>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex flex-wrap gap-1">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={[
                "min-h-10 border-b-2 px-4 text-sm font-bold",
                tab === item
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-500",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="pb-2 text-xs font-bold text-slate-500">
          Editing {employee.id}
        </span>
      </div>

      <form
        className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_168px]"
        onSubmit={handleUpdate}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name">
            <Input
              value={form.fullName}
              onChange={(event) => updateForm("fullName", event.target.value)}
              placeholder="Enter full name"
            />
          </Field>
          <Field label="Employee ID">
            <Input value={employee.id} disabled />
          </Field>
          <Field label="Date of Birth">
            <Input
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => updateForm("dateOfBirth", event.target.value)}
            />
          </Field>
          <Field label="Gender">
            <Input
              as="select"
              value={form.gender}
              onChange={(event) => updateForm("gender", event.target.value)}
            >
              <option value="">Select Gender</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
            </Input>
          </Field>
          <Field label="Date of Joining">
            <Input
              type="date"
              value={form.joined}
              onChange={(event) => updateForm("joined", event.target.value)}
            />
          </Field>
          <Field label="Reporting Manager">
            <Input
              value={form.manager}
              onChange={(event) => updateForm("manager", event.target.value)}
              placeholder="Enter reporting manager"
            />
          </Field>
          <Field label="Nationality">
            <Input
              value={form.nationality}
              onChange={(event) => updateForm("nationality", event.target.value)}
              placeholder="Enter nationality"
            />
          </Field>
          <Field label="Marital Status">
            <Input
              as="select"
              value={form.maritalStatus}
              onChange={(event) => updateForm("maritalStatus", event.target.value)}
            >
              <option value="">Select Marital Status</option>
              {maritalStatusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Input>
          </Field>
          <Field label="Blood Group">
            <Input
              as="select"
              value={form.bloodGroup}
              onChange={(event) => updateForm("bloodGroup", event.target.value)}
            >
              <option value="">Select Blood Group</option>
              {bloodGroupOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Input>
          </Field>
          <Field label="Phone Number">
            <Input
              value={form.phone}
              onChange={(event) => updateForm("phone", event.target.value)}
              placeholder="Enter phone number"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="Enter email"
            />
          </Field>
          <Field label="Department">
            <Input
              as="select"
              value={form.department}
              onChange={(event) => updateForm("department", event.target.value)}
            >
              <option value="">Select Department</option>
              <option>IT</option>
              <option>HR</option>
              <option>Finance</option>
              <option>Marketing</option>
            </Input>
          </Field>
          <Field label="Designation">
            <Input
              value={form.designation}
              onChange={(event) => updateForm("designation", event.target.value)}
              placeholder="Enter designation"
            />
          </Field>
          <Field label="Basic Salary">
            <Input
              type="number"
              min="0"
              value={form.salary}
              onChange={(event) => updateForm("salary", event.target.value)}
              placeholder="Enter salary"
            />
          </Field>
          <Field label="Status">
            <Input
              as="select"
              value={form.status}
              onChange={(event) => updateForm("status", event.target.value)}
            >
              <option>Active</option>
              <option>On Leave</option>
              <option>Relieved</option>
            </Input>
          </Field>
          <Field label="Address">
            <Input
              as="textarea"
              rows={3}
              value={form.address}
              onChange={(event) => updateForm("address", event.target.value)}
              placeholder="Enter address"
              className="sm:col-span-2"
            />
          </Field>
        </div>

        <div className="grid content-start gap-3">
          <p className="text-xs font-bold text-slate-700">Photo</p>
          <div className="grid aspect-square place-items-center rounded-md border border-slate-200 bg-slate-50">
            <Avatar
              initials={getInitials(form.fullName)}
              size="lg"
              src={form.photo}
            />
          </div>
          <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
        </div>

        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button variant="secondary" onClick={() => navigate("/employees")}>
            Cancel
          </Button>
          <Button type="submit">Update Employee</Button>
        </div>
      </form>
    </Panel>
  );
};

const EmployeeProfilePage = () => {
  const { employeeId } = useParams();
  const [employees, setEmployees] = useHrmsEmployees();
  const [, setAttendanceRecords] = useStoredList(HRMS_STORAGE_KEYS.attendance, []);
  const [, setPayrollBatches] = useStoredList(HRMS_STORAGE_KEYS.payroll, []);
  const [, setRelievingRecords] = useStoredList(HRMS_STORAGE_KEYS.relieving, []);
  const [, setReviewRecords] = useStoredList(HRMS_STORAGE_KEYS.reviews, []);
  const [, setSalaryHistory] = useStoredList(HRMS_STORAGE_KEYS.salaryHistory, []);
  const navigate = useNavigate();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employeeId || employees[0]?.id || ""
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const employee =
    employees.find((record) => record.id === selectedEmployeeId) ||
    employees[0] ||
    null;
  const filteredEmployees = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter((record) =>
      [
        record.id,
        record.name,
        record.department,
        record.designation,
        record.email,
        record.phone,
        record.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [employees, searchQuery]);

  useEffect(() => {
    if (employeeId && employees.some((record) => record.id === employeeId)) {
      setSelectedEmployeeId(employeeId);
      return;
    }

    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employeeId, employees, selectedEmployeeId]);

  const selectEmployee = (id) => {
    setSelectedEmployeeId(id);
    setMessage("");
    navigate(`/employees/profile/${id}`, { replace: true });
  };

  const deleteEmployee = () => {
    if (!employee) return;

    const confirmed = window.confirm(
      `Delete ${employee.name} (${employee.id}) from local HRMS records?`
    );

    if (!confirmed) return;

    const nextEmployees = employees.filter((record) => record.id !== employee.id);
    setEmployees(nextEmployees);
    setAttendanceRecords((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setReviewRecords((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setSalaryHistory((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setRelievingRecords((current) =>
      current.filter((record) => record.employeeId !== employee.id)
    );
    setPayrollBatches((current) =>
      current.map((batch) => ({
        ...batch,
        rows: (batch.rows || []).filter((row) => row.id !== employee.id),
      }))
    );
    const nextEmployeeId = nextEmployees[0]?.id || "";
    setSelectedEmployeeId(nextEmployeeId);
    setMessage(`${employee.name} deleted from local HRMS records.`);
    navigate(
      nextEmployeeId ? `/employees/profile/${nextEmployeeId}` : "/employees/profile",
      { replace: true }
    );
  };

  if (!employee) {
    return (
      <Panel>
        <div className="grid gap-4">
          <Notice tone="warning">No employee records are available.</Notice>
          <div className="flex flex-wrap gap-2">
            <Link to="/employees/add">
              <Button>
                <AppIcon name="plus" className="h-4 w-4" />
                Add Employee
              </Button>
            </Link>
            <Link to="/employees">
              <Button variant="secondary">Back to Employee List</Button>
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3">
            <Notice>{message}</Notice>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
              <Field label="Search Employee">
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, ID, department, phone..."
                />
              </Field>
              <Field label="Select Employee">
                <Input
                  as="select"
                  value={employee.id}
                  onChange={(event) => selectEmployee(event.target.value)}
                >
                  {filteredEmployees.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.id} - {record.name}
                    </option>
                  ))}
                </Input>
              </Field>
            </div>
            {searchQuery && (
              <div className="flex flex-wrap gap-2">
                {filteredEmployees.length ? (
                  filteredEmployees.slice(0, 8).map((record) => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => selectEmployee(record.id)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                        record.id === employee.id
                          ? "border-blue-700 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                      ].join(" ")}
                    >
                      {record.id} - {record.name}
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">
                    No employees match your search.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-start gap-2 xl:justify-end">
            <Link to={`/employees/edit/${employee.id}`}>
              <Button>
                <AppIcon name="edit" className="h-4 w-4" />
                Edit Employee
              </Button>
            </Link>
            <Button variant="danger" onClick={deleteEmployee}>
              <AppIcon name="x" className="h-4 w-4" />
              Delete Employee
            </Button>
          </div>
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button onClick={() => printEmployeeProfile(employee)}>
          <AppIcon name="file" className="h-4 w-4" />
          Print
        </Button>
      </div>

      <RegisterDocumentView
        title="EMPLOYEE PROFILE"
        subtitle={`${employee.name} | ${employee.id}`}
        onClose={() => navigate("/employees")}
        leftRows={[
          ["Employee", employee.name],
          ["Employee ID", employee.id],
          ["Department", displayValue(employee.department)],
          ["Designation", displayValue(employee.designation)],
          ["Status", displayValue(employee.status)],
        ]}
        rightRows={[
          ["Email", displayValue(employee.email)],
          ["Phone", displayValue(employee.phone)],
          ["Reporting To", displayValue(employee.manager)],
          ["Joining Date", displayValue(employee.joined)],
          ["Basic Salary", money(employee.salary)],
        ]}
        tableColumns={["Sl No", "Particulars", "Details"]}
        tableRows={[
          { id: "address", values: ["1", "Address", displayValue(employee.address)] },
          { id: "dob", values: ["2", "Date of Birth", displayValue(employee.dateOfBirth)] },
          { id: "gender", values: ["3", "Gender", displayValue(employee.gender)] },
          {
            id: "marital",
            values: ["4", "Marital Status", displayValue(employee.maritalStatus)],
          },
          { id: "nationality", values: ["5", "Nationality", displayValue(employee.nationality)] },
          { id: "blood", values: ["6", "Blood Group", displayValue(employee.bloodGroup)] },
        ]}
        bottomLeftTitle="Employee Notes"
        bottomLeftValue="Registered employee details from local HRMS records."
      />
    </div>
  );
};

const ReviewsPage = () => {
  const [employees] = useHrmsEmployees();
  const [reviews, setReviews] = useStoredList(HRMS_STORAGE_KEYS.reviews, []);
  const [rating, setRating] = useState(4);
  const [message, setMessage] = useState("");
  const [activeReviewId, setActiveReviewId] = useState("");
  const [form, setForm] = useState({
    comments: "",
    employeeId: employees[0]?.id || "",
    improvement: "",
    period: "01-01-2024 - 31-12-2024",
    reviewer: "",
    strengths: "",
    type: "Annual",
  });
  const selectedEmployee =
    employees.find((employee) => employee.id === form.employeeId) || null;
  const reviewRows = useMemo(
    () =>
      [...reviews].sort((first, second) =>
        String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
      ),
    [reviews]
  );
  const activeReviewRecord =
    reviewRows.find((record) => record.id === activeReviewId) || null;

  useEffect(() => {
    if (!form.employeeId && employees[0]?.id) {
      setForm((current) => ({ ...current, employeeId: employees[0].id }));
    }
  }, [employees, form.employeeId]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  };

  const saveReview = (event) => {
    event.preventDefault();

    if (!selectedEmployee) {
      setMessage("Add an employee before saving a review.");
      return;
    }

    const review = {
      id: `REV-${Date.now()}`,
      comments: form.comments.trim(),
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      improvement: form.improvement.trim(),
      period: form.period,
      rating,
      reviewer: form.reviewer,
      strengths: form.strengths.trim(),
      type: form.type,
      savedAt: new Date().toISOString(),
    };

    setReviews((current) => [review, ...current]);
    setActiveReviewId(review.id);
    setMessage(
      `Review saved locally for ${selectedEmployee.name}. Total reviews: ${
        reviews.length + 1
      }.`
    );
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4">
          <Notice>{message}</Notice>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-slate-200">
          {["Review Details", "Salary Reassessment"].map((item, index) => (
            <button
              key={item}
              type="button"
              className={[
                "min-h-10 border-b-2 px-4 text-sm font-bold",
                index === 0
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-500",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
        </div>

        <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={saveReview}>
          <div className="grid gap-4">
            <Field label="Employee">
              <Input
                as="select"
                value={form.employeeId}
                onChange={(event) => updateForm("employeeId", event.target.value)}
              >
                <option value="">Select Employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {`${employee.name} (${employee.id})`}
                  </option>
                ))}
              </Input>
            </Field>
            <Field label="Review Period">
              <Input
                as="select"
                value={form.period}
                onChange={(event) => updateForm("period", event.target.value)}
              >
                <option>01-01-2024 - 31-12-2024</option>
                <option>01-07-2024 - 31-12-2024</option>
              </Input>
            </Field>
            <Field label="Review Type">
              <Input
                as="select"
                value={form.type}
                onChange={(event) => updateForm("type", event.target.value)}
              >
                <option>Annual</option>
                <option>Quarterly</option>
                <option>Probation</option>
              </Input>
            </Field>
            <Field label="Reviewer">
              <Input
                value={form.reviewer}
                onChange={(event) => updateForm("reviewer", event.target.value)}
                placeholder="Enter reviewer name"
              />
            </Field>
          </div>

          <div className="grid gap-4">
            <div>
              <p className="text-xs font-bold text-slate-700">Overall Rating</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className={[
                      "grid h-8 w-8 place-items-center text-2xl",
                      star <= rating ? "text-amber-400" : "text-slate-300",
                    ].join(" ")}
                    aria-label={`${star} star rating`}
                  >
                    *
                  </button>
                ))}
              </div>
            </div>
            <Field label="Strengths">
              <Input
                as="textarea"
                rows={3}
                value={form.strengths}
                onChange={(event) => updateForm("strengths", event.target.value)}
                placeholder="Enter strengths"
              />
            </Field>
            <Field label="Areas of Improvement">
              <Input
                as="textarea"
                rows={3}
                value={form.improvement}
                onChange={(event) => updateForm("improvement", event.target.value)}
                placeholder="Enter areas of improvement"
              />
            </Field>
            <Field label="Comments">
              <Input
                as="textarea"
                rows={3}
                value={form.comments}
                onChange={(event) => updateForm("comments", event.target.value)}
                placeholder="Enter comments"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 lg:col-span-2">
            <Button
              variant="secondary"
              onClick={() => {
                setRating(4);
                setForm((current) => ({
                  ...current,
                  comments: "",
                  improvement: "",
                  strengths: "",
                }));
                setMessage("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Save Review</Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold">Review Register</h2>
            <p className="text-sm text-slate-500">
              Saved review details from localStorage.
            </p>
          </div>
          <Link to="/reviews/history">
            <Button variant="secondary">Review History</Button>
          </Link>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Saved Date", "Employee", "Period", "Type", "Rating", "Reviewer", "Action"].map(
                  (heading) => (
                    <th key={heading} className="px-3 py-3 font-bold">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reviewRows.map((record) => (
                <tr
                  key={record.id}
                  className={[
                    "hover:bg-slate-50",
                    activeReviewId === record.id ? "bg-blue-50/50" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    {record.savedAt
                      ? new Date(record.savedAt).toLocaleString()
                      : "Not provided"}
                  </td>
                  <td className="px-3 py-3">
                    <strong>{record.employeeName}</strong>
                    <p className="text-xs text-slate-500">{record.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">{record.period}</td>
                  <td className="px-3 py-3">{record.type}</td>
                  <td className="px-3 py-3">{record.rating || 0} / 5</td>
                  <td className="px-3 py-3">{displayValue(record.reviewer)}</td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => setActiveReviewId(record.id)}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {!reviewRows.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No registered review details found. Save a review to create an entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeReviewRecord && (
        <RegisterDocumentView
          title="PERFORMANCE REVIEW"
          subtitle={`${activeReviewRecord.employeeName} | ${activeReviewRecord.id}`}
          onClose={() => setActiveReviewId("")}
          leftRows={[
            ["Employee", activeReviewRecord.employeeName],
            ["Employee ID", activeReviewRecord.employeeId],
            ["Review Type", activeReviewRecord.type],
            ["Review Period", activeReviewRecord.period],
          ]}
          rightRows={[
            ["Reviewer", displayValue(activeReviewRecord.reviewer)],
            ["Rating", `${activeReviewRecord.rating || 0} / 5`],
            [
              "Saved Date",
              activeReviewRecord.savedAt
                ? new Date(activeReviewRecord.savedAt).toLocaleString()
                : "Not provided",
            ],
            ["Register Ref", activeReviewRecord.id],
          ]}
          tableColumns={["Sl No", "Particulars", "Details"]}
          tableRows={[
            {
              id: "strengths",
              values: ["1", "Strengths", displayValue(activeReviewRecord.strengths)],
            },
            {
              id: "improvement",
              values: [
                "2",
                "Areas of Improvement",
                displayValue(activeReviewRecord.improvement),
              ],
            },
            {
              id: "comments",
              values: ["3", "Comments", displayValue(activeReviewRecord.comments)],
            },
          ]}
          bottomLeftTitle="Review Notes"
          bottomLeftValue={displayValue(activeReviewRecord.comments)}
        />
      )}
    </div>
  );
};

const reassessmentMetricLabels = {
  workQuality: "Work Quality",
  communication: "Communication",
  teamwork: "Teamwork",
  leadership: "Leadership",
  punctuality: "Punctuality",
  taskCompletion: "Task Completion",
  innovation: "Innovation",
  clientFeedback: "Client Feedback",
};

const defaultReassessmentMetrics = {
  workQuality: 86,
  communication: 82,
  teamwork: 88,
  leadership: 76,
  punctuality: 90,
  taskCompletion: 84,
  innovation: 78,
  clientFeedback: 80,
};

const approvalStatuses = [
  "Pending",
  "Approved",
  "Rejected",
  "Revision Requested",
];

const SalaryReassessmentPage = () => {
  const [employees, setEmployees] = useHrmsEmployees();
  const [reviews, setReviews] = useStoredList(HRMS_STORAGE_KEYS.reviews, []);
  const [salaryHistory, setSalaryHistory] = useStoredList(
    HRMS_STORAGE_KEYS.salaryHistory,
    []
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees[0]?.id || ""
  );
  const [metrics, setMetrics] = useState(defaultReassessmentMetrics);
  const [documents, setDocuments] = useState([]);
  const [message, setMessage] = useState("");
  const [activeRegisterId, setActiveRegisterId] = useState("");
  const [registerEmployeeFilter, setRegisterEmployeeFilter] = useState("all");
  const [registerStatusFilter, setRegisterStatusFilter] = useState("all");
  const [form, setForm] = useState({
    acknowledgement: "Pending",
    attendanceScore: 90,
    behaviorScore: 88,
    bonus: "",
    departmentTransfer: "",
    digitalSignature: "",
    effectiveDate: todayValue(),
    employeeComment: "",
    employeeSelfReview: "",
    hrComments: "",
    hrStatus: "Pending",
    incrementPercent: 10,
    kpiScore: 86,
    managerComments: "",
    managerStatus: "Pending",
    overallRating: 4,
    productivityScore: 84,
    promotionEffectiveDate: todayValue(),
    promotionRecommendation: "No Promotion",
    proposedRole: "",
    reviewDate: todayValue(),
    reviewPeriod: "Jan 2026 - Dec 2026",
    reviewerName: "",
    salaryStatus: "Pending",
    strengths: "",
    directorStatus: "Pending",
    improvement: "",
    notifyEmail: true,
    notifyHr: true,
    notifyPromotion: false,
    reminder: true,
  });
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || null;
  const currentSalary = Number(selectedEmployee?.salary || 0);
  const incrementPercent = clampNumber(form.incrementPercent, 0, 100);
  const incrementAmount = Math.round((currentSalary * incrementPercent) / 100);
  const revisedSalary = currentSalary + incrementAmount;
  const bonus = Number(form.bonus || 0);
  const metricRows = Object.entries(metrics).map(([key, value]) => ({
    key,
    label: reassessmentMetricLabels[key],
    value,
  }));
  const metricAverage = averageScore(metricRows.map((metric) => metric.value));
  const reviewScore = averageScore([
    form.kpiScore,
    form.attendanceScore,
    form.behaviorScore,
    form.productivityScore,
    metricAverage,
  ]);
  const grade = scoreGrade(reviewScore);
  const employeeHistory = useMemo(
    () =>
      salaryHistory
        .filter((record) => record.employeeId === selectedEmployeeId)
        .sort((first, second) =>
          String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
        ),
    [salaryHistory, selectedEmployeeId]
  );
  const registerRows = useMemo(() => {
    return [...salaryHistory]
      .sort((first, second) =>
        String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
      )
      .filter((record) =>
        registerEmployeeFilter === "all"
          ? true
          : record.employeeId === registerEmployeeFilter
      )
      .filter((record) =>
        registerStatusFilter === "all"
          ? true
          : record.salaryStatus === registerStatusFilter
      );
  }, [registerEmployeeFilter, registerStatusFilter, salaryHistory]);
  const registerStatuses = useMemo(
    () =>
      Array.from(
        new Set(salaryHistory.map((record) => record.salaryStatus).filter(Boolean))
      ),
    [salaryHistory]
  );
  const activeRegisterRecord =
    registerRows.find((record) => record.id === activeRegisterId) ||
    registerRows[0] ||
    null;
  const lastIncrement = employeeHistory.find(
    (record) => Number(record.incrementAmount || 0) > 0
  );
  const aiIncrement =
    reviewScore >= 90 ? 15 : reviewScore >= 82 ? 12 : reviewScore >= 72 ? 8 : 4;
  const resignationRisk =
    form.attendanceScore < 70 || form.behaviorScore < 65
      ? "Medium"
      : reviewScore >= 85 && incrementPercent < 8
        ? "Medium"
        : "Low";
  const promotionReadiness =
    reviewScore >= 88 && metrics.leadership >= 80
      ? "Ready"
      : reviewScore >= 78
        ? "Developing"
        : "Not Ready";
  const compensationRows = [
    ["Basic Salary", Math.round(revisedSalary * 0.5)],
    ["HRA", Math.round(revisedSalary * 0.2)],
    ["Allowances", Math.round(revisedSalary * 0.15)],
    ["Incentives", bonus],
    ["PF", Math.round(revisedSalary * 0.06)],
    ["Tax Estimate", Math.round(revisedSalary * 0.05)],
  ];

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const selectReassessmentEmployee = (id) => {
    const employee = employees.find((record) => record.id === id);
    setSelectedEmployeeId(id);
    setActiveRegisterId("");
    setForm((current) => ({
      ...current,
      departmentTransfer: employee?.department || "",
      proposedRole: employee?.designation || "",
    }));
    setMessage("");
  };

  useEffect(() => {
    if (!selectedEmployee) return;

    setForm((current) => ({
      ...current,
      departmentTransfer:
        current.departmentTransfer || selectedEmployee.department || "",
      proposedRole: current.proposedRole || selectedEmployee.designation || "",
    }));
  }, [selectedEmployee?.id]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage("");
  };

  const updateMetric = (key, value) => {
    setMetrics((current) => ({ ...current, [key]: clampNumber(value) }));
    setMessage("");
  };

  const buildRecord = (status) => {
    const approved = status === "Approved" || status === "Salary Activated";

    return {
      id: `SAL-${Date.now()}`,
      acknowledgement: form.acknowledgement,
      attendanceScore: Number(form.attendanceScore) || 0,
      behaviorScore: Number(form.behaviorScore) || 0,
      bonus,
      compensationRows,
      currentRole: selectedEmployee?.designation || "",
      currentSalary,
      departmentTransfer: form.departmentTransfer,
      digitalSignature: form.digitalSignature.trim(),
      documents,
      effectiveDate: form.effectiveDate,
      employeeComment: form.employeeComment.trim(),
      employeeId: selectedEmployee?.id || "",
      employeeName: selectedEmployee?.name || "",
      employeeSelfReview: form.employeeSelfReview.trim(),
      grade,
      hrComments: form.hrComments.trim(),
      incrementAmount,
      incrementPercent,
      kpiScore: Number(form.kpiScore) || 0,
      managerComments: form.managerComments.trim(),
      metricAverage,
      metrics,
      overallRating: Number(form.overallRating) || 0,
      productivityScore: Number(form.productivityScore) || 0,
      promotionEffectiveDate: form.promotionEffectiveDate,
      promotionReadiness,
      promotionRecommendation: form.promotionRecommendation,
      proposedRole: form.proposedRole.trim(),
      resignationRisk,
      revisedSalary,
      reviewDate: form.reviewDate,
      reviewPeriod: form.reviewPeriod,
      reviewerName: form.reviewerName.trim(),
      reviewScore,
      salaryStatus: status,
      savedAt: new Date().toISOString(),
      strengths: form.strengths.trim(),
      directorStatus: approved ? "Approved" : form.directorStatus,
      hrStatus: approved ? "Approved" : form.hrStatus,
      improvement: form.improvement.trim(),
      managerStatus: approved ? "Approved" : form.managerStatus,
      notificationSettings: {
        notifyEmail: form.notifyEmail,
        notifyHr: form.notifyHr,
        notifyPromotion: form.notifyPromotion,
        reminder: form.reminder,
      },
    };
  };

  const saveReassessment = (status = "Pending", activateSalary = false) => {
    if (!selectedEmployee) {
      setMessage("Add an employee before saving salary reassessment.");
      return;
    }

    const record = buildRecord(status);
    setSalaryHistory((current) => [record, ...current]);
    setReviews((current) => [
      {
        id: `REV-${record.id}`,
        comments: record.managerComments || record.hrComments,
        employeeId: record.employeeId,
        employeeName: record.employeeName,
        improvement: record.improvement,
        period: record.reviewPeriod,
        rating: record.overallRating,
        reviewer: record.reviewerName,
        salaryReassessmentId: record.id,
        strengths: record.strengths,
        type: "Salary Reassessment",
        savedAt: record.savedAt,
      },
      ...current,
    ]);

    if (activateSalary) {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === selectedEmployee.id
            ? {
                ...employee,
                department: form.departmentTransfer || employee.department,
                designation:
                  form.promotionRecommendation === "Promotion Recommended" &&
                  form.proposedRole
                    ? form.proposedRole
                    : employee.designation,
                salary: revisedSalary,
              }
            : employee
        )
      );
    }

    setMessage(
      activateSalary
        ? `Salary activated for ${selectedEmployee.name}. Revised salary is ${money(revisedSalary)}.`
        : `Salary reassessment saved locally for ${selectedEmployee.name}.`
    );
    setActiveRegisterId(record.id);
  };

  const loadRegisterRecord = (record) => {
    if (!record) return;

    setSelectedEmployeeId(record.employeeId);
    setActiveRegisterId(record.id);
    setMetrics({
      ...defaultReassessmentMetrics,
      ...(record.metrics || {}),
    });
    setDocuments(record.documents || []);
    setForm((current) => ({
      ...current,
      acknowledgement: record.acknowledgement || "Pending",
      attendanceScore: record.attendanceScore ?? current.attendanceScore,
      behaviorScore: record.behaviorScore ?? current.behaviorScore,
      bonus: String(record.bonus || ""),
      departmentTransfer: record.departmentTransfer || "",
      digitalSignature: record.digitalSignature || "",
      effectiveDate: record.effectiveDate || todayValue(),
      employeeComment: record.employeeComment || "",
      employeeSelfReview: record.employeeSelfReview || "",
      hrComments: record.hrComments || "",
      hrStatus: record.hrStatus || "Pending",
      incrementPercent: record.incrementPercent ?? current.incrementPercent,
      kpiScore: record.kpiScore ?? current.kpiScore,
      managerComments: record.managerComments || "",
      managerStatus: record.managerStatus || "Pending",
      overallRating: record.overallRating || current.overallRating,
      productivityScore: record.productivityScore ?? current.productivityScore,
      promotionEffectiveDate: record.promotionEffectiveDate || todayValue(),
      promotionRecommendation: record.promotionRecommendation || "No Promotion",
      proposedRole: record.proposedRole || record.currentRole || "",
      reviewDate: record.reviewDate || todayValue(),
      reviewPeriod: record.reviewPeriod || current.reviewPeriod,
      reviewerName: record.reviewerName || "",
      salaryStatus: record.salaryStatus || "Pending",
      strengths: record.strengths || "",
      directorStatus: record.directorStatus || "Pending",
      improvement: record.improvement || "",
      notifyEmail:
        record.notificationSettings?.notifyEmail ?? current.notifyEmail,
      notifyHr: record.notificationSettings?.notifyHr ?? current.notifyHr,
      notifyPromotion:
        record.notificationSettings?.notifyPromotion ?? current.notifyPromotion,
      reminder: record.notificationSettings?.reminder ?? current.reminder,
    }));
    setMessage(`${record.employeeName} reassessment loaded from register.`);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const activateRegisterRecord = (record) => {
    if (!record) return;

    setEmployees((current) =>
      current.map((employee) =>
        employee.id === record.employeeId
          ? {
              ...employee,
              department: record.departmentTransfer || employee.department,
              designation:
                record.promotionRecommendation === "Promotion Recommended" &&
                record.proposedRole
                  ? record.proposedRole
                  : employee.designation,
              salary: Number(record.revisedSalary || employee.salary || 0),
            }
          : employee
      )
    );
    setSalaryHistory((current) =>
      current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              directorStatus: "Approved",
              hrStatus: "Approved",
              managerStatus: "Approved",
              salaryStatus: "Salary Activated",
            }
          : item
      )
    );
    setActiveRegisterId(record.id);
    setMessage(
      `${record.employeeName} salary activated from register. Revised salary is ${money(record.revisedSalary)}.`
    );
  };

  const deleteRegisterRecord = (record) => {
    if (!record) return;

    const confirmed = window.confirm(
      `Delete salary reassessment ${record.id} for ${record.employeeName}?`
    );

    if (!confirmed) return;

    setSalaryHistory((current) =>
      current.filter((item) => item.id !== record.id)
    );
    setReviews((current) =>
      current.filter((item) => item.salaryReassessmentId !== record.id)
    );
    setActiveRegisterId("");
    setMessage(`${record.employeeName} reassessment deleted from register.`);
  };

  const downloadRegisterRecord = (record) => {
    if (!record) return;

    downloadTextFile(
      `${record.employeeId}-${record.id}-salary-reassessment.json`,
      JSON.stringify(record, null, 2),
      "application/json"
    );
  };

  const handleDocumentUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setDocuments((current) => [
      ...current,
      ...files.map((file) => ({
        addedAt: new Date().toISOString(),
        name: file.name,
        size: file.size,
        type: file.type || "Document",
      })),
    ]);
    event.target.value = "";
  };

  const downloadReport = () => {
    if (!selectedEmployee) {
      setMessage("Select an employee before downloading the report.");
      return;
    }

    downloadTextFile(
      `${selectedEmployee.id}-salary-reassessment.json`,
      JSON.stringify(buildRecord("Report Generated"), null, 2),
      "application/json"
    );
  };

  const printRevisionLetter = () => {
    if (typeof window === "undefined" || !selectedEmployee) {
      setMessage("Select an employee before printing the salary revision letter.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(selectedEmployee.name)} Salary Revision</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #0f172a; }
            h1 { font-size: 22px; margin-bottom: 8px; }
            p { line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin: 24px 0; }
            td { border: 1px solid #e2e8f0; padding: 10px; }
            .label { color: #64748b; font-weight: 700; width: 36%; }
            .footer { margin-top: 48px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1>Salary Revision Letter</h1>
          <p>Dear ${escapeHtml(selectedEmployee.name)},</p>
          <p>Based on the completed performance review for ${escapeHtml(form.reviewPeriod)}, your revised salary details are listed below.</p>
          <table>
            <tr><td class="label">Employee ID</td><td>${escapeHtml(selectedEmployee.id)}</td></tr>
            <tr><td class="label">Current Salary</td><td>${escapeHtml(money(currentSalary))}</td></tr>
            <tr><td class="label">Increment</td><td>${incrementPercent}% (${escapeHtml(money(incrementAmount))})</td></tr>
            <tr><td class="label">Revised Salary</td><td>${escapeHtml(money(revisedSalary))}</td></tr>
            <tr><td class="label">Effective Date</td><td>${escapeHtml(form.effectiveDate)}</td></tr>
            <tr><td class="label">Grade</td><td>${escapeHtml(grade)}</td></tr>
          </table>
          <p>Regards,<br/>HR Department</p>
          <div class="footer">
            <span>HR Signature: __________________</span>
            <span>Employee Signature: __________________</span>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <Field label="Employee">
              <Input
                as="select"
                value={selectedEmployeeId}
                onChange={(event) => {
                  selectReassessmentEmployee(event.target.value);
                }}
              >
                <option value="">Select Employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.id} - {employee.name}
                  </option>
                ))}
              </Input>
            </Field>
            <Notice>{message}</Notice>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <AppIcon name="file" className="h-4 w-4" />
              Appraisal PDF
            </Button>
            <Button variant="secondary" onClick={printRevisionLetter}>
              <AppIcon name="receipt" className="h-4 w-4" />
              Revision Letter
            </Button>
            <Button onClick={downloadReport}>
              <AppIcon name="download" className="h-4 w-4" />
              Review Report
            </Button>
          </div>
        </div>
      </Panel>

      {!selectedEmployee && (
        <Panel>
          <Notice tone="warning">Add an employee before salary reassessment.</Notice>
          <Link to="/employees/add">
            <Button className="mt-4">
              <AppIcon name="plus" className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        </Panel>
      )}

      {selectedEmployee && (
        <>
          <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <Panel>
              <div className="flex gap-4">
                <Avatar
                  initials={selectedEmployee.avatar}
                  size="lg"
                  src={selectedEmployee.photo}
                />
                <div>
                  <h2 className="text-xl font-bold">{selectedEmployee.name}</h2>
                  <p className="text-sm font-semibold text-slate-500">
                    {selectedEmployee.id}
                  </p>
                  <p className="text-sm text-slate-500">
                    {displayValue(selectedEmployee.designation)}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                {[
                  ["Department", displayValue(selectedEmployee.department)],
                  ["Joining Date", displayValue(selectedEmployee.joined)],
                  ["Current Salary", money(currentSalary)],
                  ["Last Increment", lastIncrement?.effectiveDate || "Not provided"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-slate-500">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <div className="grid gap-4 md:grid-cols-4">
                {[
                  ["Overall", `${reviewScore}%`, `Grade ${grade}`],
                  ["KPI", `${form.kpiScore}%`, "Core score"],
                  ["Attendance", `${form.attendanceScore}%`, "Payroll linked"],
                  ["Productivity", `${form.productivityScore}%`, "Delivery score"],
                ].map(([label, value, helper]) => (
                  <div key={label} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-bold text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
                    <p className="mt-1 text-xs text-slate-500">{helper}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <RadarChart metrics={metricRows} />
                <div className="grid content-center gap-3">
                  <ScoreBar label="Metric Average" value={metricAverage} tone="emerald" />
                  <ScoreBar label="Behavior Score" value={form.behaviorScore} tone="violet" />
                  <ScoreBar label="Promotion Readiness" value={reviewScore} tone="amber" />
                </div>
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">AI Recommendation</h2>
              <div className="mt-4 grid gap-3 text-sm">
                {[
                  ["Suggested Increment", `${aiIncrement}%`],
                  ["Promotion Eligibility", promotionReadiness],
                  ["Resignation Risk", resignationRisk],
                  ["Performance Trend", reviewScore >= 80 ? "Positive" : "Needs attention"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                    <span className="text-slate-500">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <Button
                className="mt-4 w-full"
                variant="secondary"
                onClick={() => updateForm("incrementPercent", aiIncrement)}
              >
                Apply AI Increment
              </Button>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Panel>
              <h2 className="text-sm font-bold">Performance Review</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Review Period">
                  <Input
                    value={form.reviewPeriod}
                    onChange={(event) => updateForm("reviewPeriod", event.target.value)}
                  />
                </Field>
                <Field label="Reviewer Name">
                  <Input
                    value={form.reviewerName}
                    onChange={(event) => updateForm("reviewerName", event.target.value)}
                    placeholder="Enter reviewer"
                  />
                </Field>
                <Field label="Review Date">
                  <Input
                    type="date"
                    value={form.reviewDate}
                    onChange={(event) => updateForm("reviewDate", event.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["KPI Score", "kpiScore"],
                  ["Attendance Score", "attendanceScore"],
                  ["Behavior Score", "behaviorScore"],
                  ["Productivity Score", "productivityScore"],
                ].map(([label, key]) => (
                  <ScoreInput
                    key={key}
                    label={label}
                    value={form[key]}
                    onChange={(value) => updateForm(key, value)}
                  />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-slate-700">Overall Rating</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => updateForm("overallRating", star)}
                    className={[
                      "grid h-9 w-9 place-items-center rounded-md border text-xl font-bold",
                      star <= form.overallRating
                        ? "border-amber-300 bg-amber-50 text-amber-500"
                        : "border-slate-200 text-slate-300",
                    ].join(" ")}
                    aria-label={`${star} star rating`}
                  >
                    *
                  </button>
                ))}
                <StatusBadge status={`Grade ${grade}`} />
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Salary Reassessment</h2>
              <div className="mt-4 grid gap-4">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs font-bold text-slate-500">Current Salary</p>
                  <p className="mt-1 text-3xl font-bold">{money(currentSalary)}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Recommended Increment %">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.incrementPercent}
                      onChange={(event) => updateForm("incrementPercent", event.target.value)}
                    />
                  </Field>
                  <Field label="Bonus">
                    <Input
                      type="number"
                      min="0"
                      value={form.bonus}
                      onChange={(event) => updateForm("bonus", event.target.value)}
                      placeholder="Enter bonus"
                    />
                  </Field>
                  <Field label="Effective Date">
                    <Input
                      type="date"
                      value={form.effectiveDate}
                      onChange={(event) => updateForm("effectiveDate", event.target.value)}
                    />
                  </Field>
                  <Field label="Promotion Recommendation">
                    <Input
                      as="select"
                      value={form.promotionRecommendation}
                      onChange={(event) => updateForm("promotionRecommendation", event.target.value)}
                    >
                      <option>No Promotion</option>
                      <option>Promotion Recommended</option>
                      <option>Role Enhancement</option>
                    </Input>
                  </Field>
                </div>
                <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <span>Increment Amount</span>
                    <strong>{money(incrementAmount)}</strong>
                  </div>
                  <div className="flex justify-between gap-4 text-base">
                    <span>Revised Salary</span>
                    <strong>{money(revisedSalary)}</strong>
                  </div>
                  <div className="flex justify-between gap-4 text-slate-600">
                    <span>Total With Bonus</span>
                    <strong>{money(revisedSalary + bonus)}</strong>
                  </div>
                </div>
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel>
              <h2 className="text-sm font-bold">KPI / Performance Metrics</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {metricRows.map((metric) => (
                  <ScoreInput
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    onChange={(value) => updateMetric(metric.key, value)}
                  />
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Promotion Management</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Current Role">
                  <Input value={selectedEmployee.designation || ""} disabled />
                </Field>
                <Field label="Proposed Role">
                  <Input
                    value={form.proposedRole}
                    onChange={(event) => updateForm("proposedRole", event.target.value)}
                    placeholder="Enter proposed role"
                  />
                </Field>
                <Field label="Promotion Effective Date">
                  <Input
                    type="date"
                    value={form.promotionEffectiveDate}
                    onChange={(event) => updateForm("promotionEffectiveDate", event.target.value)}
                  />
                </Field>
                <Field label="Department Transfer">
                  <Input
                    value={form.departmentTransfer}
                    onChange={(event) => updateForm("departmentTransfer", event.target.value)}
                    placeholder="Enter department"
                  />
                </Field>
              </div>

              <h2 className="mt-6 text-sm font-bold">Review Comments</h2>
              <div className="mt-4 grid gap-4">
                {[
                  ["Employee Strengths", "strengths"],
                  ["Areas of Improvement", "improvement"],
                  ["HR Comments", "hrComments"],
                  ["Manager Comments", "managerComments"],
                  ["Employee Self Review", "employeeSelfReview"],
                ].map(([label, key]) => (
                  <Field key={key} label={label}>
                    <Input
                      as="textarea"
                      rows={2}
                      value={form[key]}
                      onChange={(event) => updateForm(key, event.target.value)}
                      placeholder={label}
                    />
                  </Field>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
            <Panel>
              <h2 className="text-sm font-bold">Approval Workflow</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {[
                  ["Manager Review", "managerStatus"],
                  ["HR Approval", "hrStatus"],
                  ["Director Approval", "directorStatus"],
                  ["Salary Activated", "salaryStatus"],
                ].map(([label, key], index) => (
                  <div key={key} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-700 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <strong className="text-sm">{label}</strong>
                    </div>
                    <Input
                      as="select"
                      value={form[key]}
                      onChange={(event) => updateForm(key, event.target.value)}
                    >
                      {approvalStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </Input>
                  </div>
                ))}
              </div>

              <h2 className="mt-6 text-sm font-bold">Review History Timeline</h2>
              <div className="mt-4 grid gap-3">
                {employeeHistory.length ? (
                  employeeHistory.slice(0, 5).map((record) => (
                    <div key={record.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[120px_1fr_auto]">
                      <strong>{record.effectiveDate || record.reviewDate}</strong>
                      <span className="text-sm text-slate-600">
                        {money(record.currentSalary)} to {money(record.revisedSalary)} | Grade {record.grade}
                      </span>
                      <StatusBadge status={record.salaryStatus} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No salary reassessment history saved for this employee yet.
                  </p>
                )}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Analytics & Charts</h2>
              <SalaryGrowthChart
                records={[...employeeHistory].reverse()}
                currentSalary={currentSalary}
              />
              <div className="mt-4 grid gap-3">
                <ScoreBar label="Department Comparison" value={reviewScore - 4} tone="blue" />
                <ScoreBar label="Top Performer Index" value={reviewScore + 3} tone="emerald" />
                <ScoreBar label="Compensation Benchmark" value={incrementPercent * 7} tone="amber" />
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <Panel>
              <h2 className="text-sm font-bold">Compensation Breakdown</h2>
              <div className="mt-4 grid gap-3 text-sm">
                {compensationRows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                    <span className="text-slate-600">{label}</span>
                    <strong>{money(value)}</strong>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Documents & Notifications</h2>
              <div className="mt-4 grid gap-4">
                <Input type="file" multiple onChange={handleDocumentUpload} />
                <div className="grid gap-2 text-sm">
                  {documents.length ? (
                    documents.map((document) => (
                      <div key={`${document.name}-${document.addedAt}`} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                        <span>{document.name}</span>
                        <span className="text-slate-500">{Math.ceil(document.size / 1024)} KB</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-500">No documents attached.</span>
                  )}
                </div>
                {[
                  ["Increment approval email", "notifyEmail"],
                  ["Promotion notice", "notifyPromotion"],
                  ["HR alerts", "notifyHr"],
                  ["Reminder for pending reviews", "reminder"],
                ].map(([label, key]) => (
                  <label key={key} className="flex items-center gap-3 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(event) => updateForm(key, event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-700"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-bold">Employee Acknowledgement</h2>
              <div className="mt-4 grid gap-4">
                <Field label="Acknowledgement">
                  <Input
                    as="select"
                    value={form.acknowledgement}
                    onChange={(event) => updateForm("acknowledgement", event.target.value)}
                  >
                    <option>Pending</option>
                    <option>Accepted</option>
                    <option>Accepted With Comments</option>
                    <option>Rejected</option>
                  </Input>
                </Field>
                <Field label="Employee Comments">
                  <Input
                    as="textarea"
                    rows={3}
                    value={form.employeeComment}
                    onChange={(event) => updateForm("employeeComment", event.target.value)}
                    placeholder="Employee acknowledgement comments"
                  />
                </Field>
                <Field label="Digital Signature">
                  <Input
                    value={form.digitalSignature}
                    onChange={(event) => updateForm("digitalSignature", event.target.value)}
                    placeholder="Type employee name"
                  />
                </Field>
              </div>
            </Panel>
          </section>

          <Panel>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => saveReassessment("Draft", false)}>
                Save Draft
              </Button>
              <Button variant="secondary" onClick={() => saveReassessment("Approved", false)}>
                Save Approved Review
              </Button>
              <Button onClick={() => saveReassessment("Salary Activated", true)}>
                Activate Salary
              </Button>
            </div>
          </Panel>
        </>
      )}

      <Panel>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-base font-bold">Salary Reassessment Register</h2>
            <p className="mt-1 text-sm text-slate-500">
              Saved drafts, approved reviews, and activated salary revisions from localStorage.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px]">
            <Field label="Employee Filter">
              <Input
                as="select"
                value={registerEmployeeFilter}
                onChange={(event) => {
                  setRegisterEmployeeFilter(event.target.value);
                  setActiveRegisterId("");
                }}
              >
                <option value="all">All Employees</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.id} - {employee.name}
                  </option>
                ))}
              </Input>
            </Field>
            <Field label="Status Filter">
              <Input
                as="select"
                value={registerStatusFilter}
                onChange={(event) => {
                  setRegisterStatusFilter(event.target.value);
                  setActiveRegisterId("");
                }}
              >
                <option value="all">All Statuses</option>
                {registerStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Input>
            </Field>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {[
                  "Saved Date",
                  "Employee",
                  "Review Period",
                  "Score",
                  "Current Salary",
                  "Increment",
                  "Revised Salary",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registerRows.map((record) => (
                <tr
                  key={record.id}
                  className={[
                    "hover:bg-slate-50",
                    activeRegisterRecord?.id === record.id ? "bg-blue-50/50" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    {record.savedAt
                      ? new Date(record.savedAt).toLocaleString()
                      : "Not provided"}
                  </td>
                  <td className="px-3 py-3">
                    <strong>{record.employeeName}</strong>
                    <p className="text-xs text-slate-500">{record.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">{record.reviewPeriod}</td>
                  <td className="px-3 py-3">
                    <strong>{record.reviewScore}%</strong>
                    <p className="text-xs text-slate-500">Grade {record.grade}</p>
                  </td>
                  <td className="px-3 py-3">{money(record.currentSalary)}</td>
                  <td className="px-3 py-3">
                    {record.incrementPercent}% / {money(record.incrementAmount)}
                  </td>
                  <td className="px-3 py-3 font-bold">
                    {money(record.revisedSalary)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={record.salaryStatus} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="min-h-8 px-2 text-xs"
                        variant="secondary"
                        onClick={() => loadRegisterRecord(record)}
                      >
                        View
                      </Button>
                      <Button
                        className="min-h-8 px-2 text-xs"
                        onClick={() => activateRegisterRecord(record)}
                        disabled={record.salaryStatus === "Salary Activated"}
                      >
                        Activate
                      </Button>
                      <Button
                        className="min-h-8 px-2 text-xs"
                        variant="secondary"
                        onClick={() => downloadRegisterRecord(record)}
                      >
                        Download
                      </Button>
                      <Button
                        className="min-h-8 px-2 text-xs"
                        variant="danger"
                        onClick={() => deleteRegisterRecord(record)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!registerRows.length && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No saved salary reassessment records found. Use Save Draft,
                    Save Approved Review, or Activate Salary to create register entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeRegisterRecord && (
        <RegisterDocumentView
          title="SALARY REASSESSMENT"
          subtitle={`${activeRegisterRecord.employeeName} | ${activeRegisterRecord.id}`}
          onClose={() => setActiveRegisterId("")}
          leftRows={[
            ["Employee", activeRegisterRecord.employeeName],
            ["Employee ID", activeRegisterRecord.employeeId],
            ["Current Role", activeRegisterRecord.currentRole],
            ["Proposed Role", activeRegisterRecord.proposedRole],
            ["Review Period", activeRegisterRecord.reviewPeriod],
          ]}
          rightRows={[
            ["Status", activeRegisterRecord.salaryStatus],
            ["Review Score", `${activeRegisterRecord.reviewScore}%`],
            ["Grade", activeRegisterRecord.grade],
            ["Rating", `${activeRegisterRecord.overallRating || 0} / 5`],
            ["Effective Date", activeRegisterRecord.effectiveDate],
          ]}
          tableColumns={["Sl No", "Particulars", "Details"]}
          tableRows={[
            {
              id: "currentSalary",
              values: ["1", "Current Salary", money(activeRegisterRecord.currentSalary)],
            },
            {
              id: "increment",
              values: [
                "2",
                "Increment",
                `${activeRegisterRecord.incrementPercent}% / ${money(
                  activeRegisterRecord.incrementAmount
                )}`,
              ],
            },
            {
              id: "revisedSalary",
              values: ["3", "Revised Salary", money(activeRegisterRecord.revisedSalary)],
            },
            {
              id: "approval",
              values: [
                "4",
                "Approval",
                [
                  `Manager: ${activeRegisterRecord.managerStatus || "Pending"}`,
                  `HR: ${activeRegisterRecord.hrStatus || "Pending"}`,
                  `Director: ${activeRegisterRecord.directorStatus || "Pending"}`,
                  `Employee: ${activeRegisterRecord.acknowledgement || "Pending"}`,
                ].join(" | "),
              ],
            },
            {
              id: "attachments",
              values: [
                "5",
                "Attachments",
                activeRegisterRecord.documents?.length
                  ? activeRegisterRecord.documents
                      .map((document) => document.name)
                      .join(", ")
                  : "No attachments saved",
              ],
            },
          ]}
          bottomLeftTitle="Comments"
          bottomLeftValue={[
            activeRegisterRecord.strengths &&
              `Strengths: ${activeRegisterRecord.strengths}`,
            activeRegisterRecord.improvement &&
              `Improvement: ${activeRegisterRecord.improvement}`,
            activeRegisterRecord.hrComments && `HR: ${activeRegisterRecord.hrComments}`,
          ]
            .filter(Boolean)
            .join("\n") || "Not provided"}
        />
      )}
    </div>
  );
};

const AttendancePage = () => {
  const [employees] = useHrmsEmployees();
  const [records, setRecords] = useStoredList(HRMS_STORAGE_KEYS.attendance, []);
  const defaultStatuses = ["P", "P", "P", "A", "P", "L", "H", "P", "P", "P", "P", "A", "P", "P", "P", "P", "P", "L", "P", "P", "P", "A", "P", "P", "P", "H", "P", "P", "P", "P", "P"];
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    employees[0]?.id || ""
  );
  const [month, setMonth] = useState("May 2024");
  const [statuses, setStatuses] = useState(defaultStatuses);
  const [message, setMessage] = useState("");
  const [activeAttendanceId, setActiveAttendanceId] = useState("");
  const colorMap = {
    P: "bg-emerald-100 text-emerald-700",
    A: "bg-rose-100 text-rose-700",
    L: "bg-amber-100 text-amber-700",
    H: "bg-blue-100 text-blue-700",
  };
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || null;
  const attendanceRows = useMemo(
    () =>
      [...records].sort((first, second) =>
        String(second.savedAt || "").localeCompare(String(first.savedAt || ""))
      ),
    [records]
  );
  const activeAttendanceRecord =
    attendanceRows.find((record) => record.id === activeAttendanceId) || null;

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const loadAttendance = () => {
    if (!selectedEmployee) {
      setMessage("Add an employee before viewing attendance.");
      return;
    }

    const saved = records.find(
      (record) =>
        record.employeeId === selectedEmployeeId && record.month === month
    );
    setStatuses(saved?.statuses || defaultStatuses);
    setActiveAttendanceId(saved?.id || "");
    setMessage(
      saved
        ? `Loaded saved attendance for ${selectedEmployee.name}.`
        : "No saved attendance found. Showing default grid."
    );
  };
  const saveAttendance = () => {
    if (!selectedEmployee) {
      setMessage("Add an employee before saving attendance.");
      return;
    }

    const counts = statuses.reduce(
      (summary, status) => ({
        ...summary,
        [status]: (summary[status] || 0) + 1,
      }),
      {}
    );
    const record = {
      id: `${selectedEmployeeId}-${month}`,
      employeeId: selectedEmployeeId,
      employeeName: selectedEmployee.name,
      month,
      statuses,
      counts,
      savedAt: new Date().toISOString(),
    };

    setRecords((current) => [
      record,
      ...current.filter((item) => item.id !== record.id),
    ]);
    setActiveAttendanceId(record.id);
    setMessage(`Attendance saved locally for ${selectedEmployee.name}.`);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4">
          <Notice>{message}</Notice>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Employee">
            <Input
              as="select"
              value={selectedEmployeeId}
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
                setActiveAttendanceId("");
                setMessage("");
              }}
            >
              <option value="">Select Employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {`${employee.name} (${employee.id})`}
                </option>
              ))}
            </Input>
          </Field>
          <Field label="Month">
            <Input
              as="select"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setActiveAttendanceId("");
                setMessage("");
              }}
            >
              <option>May 2024</option>
              <option>June 2024</option>
            </Input>
          </Field>
          <Button className="self-end" onClick={loadAttendance}>
            View
          </Button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[72px_repeat(31,minmax(24px,1fr))] text-center text-xs">
              <div className="border border-slate-200 bg-slate-50 py-2 font-bold">Date</div>
              {statuses.map((_, index) => (
                <div key={index + 1} className="border-y border-r border-slate-200 bg-slate-50 py-2 font-bold">
                  {index + 1}
                </div>
              ))}
              <div className="border-x border-b border-slate-200 py-2 font-bold">Status</div>
              {statuses.map((status, index) => (
                <button
                  key={`${status}-${index}`}
                  type="button"
                  onClick={() =>
                    setStatuses((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? cycleAttendanceStatus(item) : item
                      )
                    )
                  }
                  className={`border-b border-r border-slate-200 py-2 font-bold ${colorMap[status]}`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
          {[
            ["P", "Present", colorMap.P],
            ["A", "Absent", colorMap.A],
            ["L", "Leave", colorMap.L],
            ["H", "Holiday", colorMap.H],
          ].map(([code, label, classes]) => (
            <span key={code} className="inline-flex items-center gap-2">
              <span className={`grid h-5 w-5 place-items-center rounded ${classes}`}>{code}</span>
              {label}
            </span>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setStatuses(defaultStatuses);
              setMessage("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={saveAttendance}>Save Attendance</Button>
        </div>
      </Panel>

      <Panel>
        <div>
          <h2 className="text-base font-bold">Attendance Register</h2>
          <p className="mt-1 text-sm text-slate-500">
            Saved monthly attendance details from localStorage.
          </p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Saved Date", "Employee", "Month", "Present", "Absent", "Leave", "Holiday", "Action"].map(
                  (heading) => (
                    <th key={heading} className="px-3 py-3 font-bold">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendanceRows.map((record) => (
                <tr
                  key={record.id}
                  className={[
                    "hover:bg-slate-50",
                    activeAttendanceId === record.id ? "bg-blue-50/50" : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3">
                    {record.savedAt
                      ? new Date(record.savedAt).toLocaleString()
                      : "Not provided"}
                  </td>
                  <td className="px-3 py-3">
                    <strong>{record.employeeName}</strong>
                    <p className="text-xs text-slate-500">{record.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">{record.month}</td>
                  <td className="px-3 py-3">{record.counts?.P || 0}</td>
                  <td className="px-3 py-3">{record.counts?.A || 0}</td>
                  <td className="px-3 py-3">{record.counts?.L || 0}</td>
                  <td className="px-3 py-3">{record.counts?.H || 0}</td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => {
                        setSelectedEmployeeId(record.employeeId);
                        setMonth(record.month);
                        setStatuses(record.statuses || defaultStatuses);
                        setActiveAttendanceId(record.id);
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
              {!attendanceRows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No registered attendance details found. Save attendance to create an entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {activeAttendanceRecord && (
        <RegisterDocumentView
          title="MONTHLY ATTENDANCE"
          subtitle={`${activeAttendanceRecord.employeeName} | ${activeAttendanceRecord.month}`}
          onClose={() => setActiveAttendanceId("")}
          leftRows={[
            ["Employee", activeAttendanceRecord.employeeName],
            ["Employee ID", activeAttendanceRecord.employeeId],
            ["Month", activeAttendanceRecord.month],
            [
              "Saved Date",
              activeAttendanceRecord.savedAt
                ? new Date(activeAttendanceRecord.savedAt).toLocaleString()
                : "Not provided",
            ],
          ]}
          rightRows={[
            ["Present", activeAttendanceRecord.counts?.P || 0],
            ["Absent", activeAttendanceRecord.counts?.A || 0],
            ["Leave", activeAttendanceRecord.counts?.L || 0],
            ["Holiday", activeAttendanceRecord.counts?.H || 0],
          ]}
          tableColumns={["Date", "Status", "Description"]}
          tableRows={(activeAttendanceRecord.statuses || []).map((status, index) => ({
            id: `${activeAttendanceRecord.id}-${index}`,
            values: [
              String(index + 1),
              status,
              {
                P: "Present",
                A: "Absent",
                L: "Leave",
                H: "Holiday",
              }[status] || "Present",
            ],
          }))}
          bottomLeftTitle="Attendance Summary"
          bottomLeftValue={`Present: ${activeAttendanceRecord.counts?.P || 0}\nAbsent: ${
            activeAttendanceRecord.counts?.A || 0
          }\nLeave: ${activeAttendanceRecord.counts?.L || 0}\nHoliday: ${
            activeAttendanceRecord.counts?.H || 0
          }`}
        />
      )}
    </div>
  );
};

const PayrollPage = () => {
  const [employees] = useHrmsEmployees();
  const [payrollBatches, setPayrollBatches] = useStoredList(
    HRMS_STORAGE_KEYS.payroll,
    []
  );
  const [generated, setGenerated] = useState(false);
  const [month, setMonth] = useState("May 2024");
  const [department, setDepartment] = useState("All");
  const [message, setMessage] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [payrollEdits, setPayrollEdits] = useState({});
  const visibleEmployees =
    department === "All"
      ? employees
      : employees.filter((employee) => employee.department === department);
  const rows = visibleEmployees.map((employee, index) => {
    const allowance = [5000, 4000, 3000, 3500, 6000][index] ?? 3000;
    const deduction = [2000, 1800, 1500, 1700, 2500][index] ?? 1500;
    const edit = payrollEdits[employee.id] || {};
    const salary = Number(edit.salary ?? employee.salary ?? 0);
    const rowAllowance = Number(edit.allowance ?? allowance);
    const rowDeduction = Number(edit.deduction ?? deduction);
    return {
      ...employee,
      salary,
      allowance: rowAllowance,
      deduction: rowDeduction,
      net: salary + rowAllowance - rowDeduction,
      status: edit.status || (generated || index < 3 ? "Processed" : "Pending"),
    };
  });
  const selectedPayrollRow =
    rows.find((row) => row.id === selectedEmployeeId) || rows[0] || null;
  const selectedPayrollBatch =
    payrollBatches.find((batch) => batch.id === selectedBatchId) || null;

  useEffect(() => {
    if (rows[0]?.id && !rows.some((row) => row.id === selectedEmployeeId)) {
      setSelectedEmployeeId(rows[0].id);
    }
  }, [rows, selectedEmployeeId]);

  const updatePayrollEdit = (field, value) => {
    if (!selectedPayrollRow) return;

    setPayrollEdits((current) => {
      const currentEdit = current[selectedPayrollRow.id] || {};
      const nextEdit = {
        salary: selectedPayrollRow.salary,
        allowance: selectedPayrollRow.allowance,
        deduction: selectedPayrollRow.deduction,
        status: selectedPayrollRow.status,
        ...currentEdit,
        [field]: value,
      };

      return {
        ...current,
        [selectedPayrollRow.id]: nextEdit,
      };
    });
    setGenerated(false);
    setMessage("");
  };
  const savePayroll = () => {
    const processedRows = rows.map((row) => ({
      ...row,
      status: payrollEdits[row.id]?.status || "Processed",
    }));
    const batch = {
      id: `${month}-${department}`,
      department,
      month,
      rows: processedRows,
      savedAt: new Date().toISOString(),
    };

    setGenerated(true);
    setPayrollBatches((current) => [
      batch,
      ...current.filter((item) => item.id !== batch.id),
    ]);
    setSelectedBatchId(batch.id);
    setMessage(
      `Payroll saved locally for ${processedRows.length} employee${
        processedRows.length === 1 ? "" : "s"
      }.`
    );
  };
  const loadPayrollBatch = (batch) => {
    if (!batch) return;

    setMonth(batch.month || "May 2024");
    setDepartment(batch.department || "All");
    setGenerated(true);
    setSelectedBatchId(batch.id);
    setSelectedEmployeeId(batch.rows?.[0]?.id || "");
    setPayrollEdits(
      (batch.rows || []).reduce((edits, row) => {
        edits[row.id] = {
          allowance: Number(row.allowance || 0),
          deduction: Number(row.deduction || 0),
          salary: Number(row.salary || 0),
          status: row.status || "Processed",
        };
        return edits;
      }, {})
    );
    setMessage(`Payroll loaded for ${batch.month} / ${batch.department}.`);
  };
  const updatePayrollBatch = (batch) => {
    if (!batch) return;

    const updatedRows = rows.map((row) => ({ ...row, status: "Processed" }));
    const updatedBatch = {
      ...batch,
      department,
      month,
      rows: updatedRows,
      updatedAt: new Date().toISOString(),
    };

    setPayrollBatches((current) =>
      current.map((item) => (item.id === batch.id ? updatedBatch : item))
    );
    setSelectedBatchId(batch.id);
    setMessage(`Payroll updated for ${month} / ${department}.`);
  };
  const deletePayrollBatch = (batch) => {
    if (!batch) return;

    const confirmed = window.confirm(
      `Delete payroll batch ${batch.month} / ${batch.department}?`
    );

    if (!confirmed) return;

    setPayrollBatches((current) => current.filter((item) => item.id !== batch.id));
    if (selectedBatchId === batch.id) {
      setSelectedBatchId("");
      setGenerated(false);
    }
    setMessage(`Payroll deleted for ${batch.month} / ${batch.department}.`);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4">
          <Notice>{message}</Notice>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Month">
            <Input
              as="select"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setGenerated(false);
                setSelectedBatchId("");
                setSelectedEmployeeId("");
                setMessage("");
              }}
            >
              <option>May 2024</option>
              <option>June 2024</option>
            </Input>
          </Field>
          <Field label="Department">
            <Input
              as="select"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setGenerated(false);
                setSelectedBatchId("");
                setSelectedEmployeeId("");
                setMessage("");
              }}
            >
              <option>All</option>
              <option>IT</option>
              <option>HR</option>
              <option>Finance</option>
              <option>Marketing</option>
            </Input>
          </Field>
          <Button onClick={savePayroll} className="self-end">
            Save Payroll
          </Button>
        </div>

        {selectedPayrollRow && (
          <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
            <Field label="Select Employee">
              <Input
                as="select"
                value={selectedPayrollRow.id}
                onChange={(event) => {
                  setSelectedEmployeeId(event.target.value);
                  setMessage("");
                }}
              >
                {rows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.id} - {row.name}
                  </option>
                ))}
              </Input>
            </Field>
            <Field label="Basic Salary">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.salary}
                onChange={(event) => updatePayrollEdit("salary", event.target.value)}
              />
            </Field>
            <Field label="Allowances">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.allowance}
                onChange={(event) => updatePayrollEdit("allowance", event.target.value)}
              />
            </Field>
            <Field label="Deductions">
              <Input
                type="number"
                min="0"
                value={selectedPayrollRow.deduction}
                onChange={(event) => updatePayrollEdit("deduction", event.target.value)}
              />
            </Field>
            <Field label="Status">
              <Input
                as="select"
                value={selectedPayrollRow.status}
                onChange={(event) => updatePayrollEdit("status", event.target.value)}
              >
                <option>Pending</option>
                <option>Processed</option>
              </Input>
            </Field>
            <Button onClick={savePayroll} className="self-end">
              Save Edited Payroll
            </Button>
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["ID", "Employee", "Basic Salary", "Allowances", "Deductions", "Net Salary", "Status", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={selectedPayrollRow?.id === row.id ? "bg-blue-50/50" : ""}
                >
                  <td className="px-3 py-3 font-semibold">{row.id}</td>
                  <td className="px-3 py-3">{row.name}</td>
                  <td className="px-3 py-3">{money(row.salary)}</td>
                  <td className="px-3 py-3">{money(row.allowance)}</td>
                  <td className="px-3 py-3">{money(row.deduction)}</td>
                  <td className="px-3 py-3 font-bold">{money(row.net)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      className="min-h-8 px-2 text-xs"
                      variant="secondary"
                      onClick={() => setSelectedEmployeeId(row.id)}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No employees found for this payroll selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-base font-bold">Payroll Register</h2>
        <p className="mt-1 text-sm text-slate-500">
          Saved payroll batches with load, update, and delete options.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["Saved Date", "Month", "Department", "Employees", "Net Total", "Status", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payrollBatches.map((batch) => {
                const netTotal = (batch.rows || []).reduce(
                  (sum, row) => sum + Number(row.net || 0),
                  0
                );

                return (
                  <tr
                    key={batch.id}
                    className={selectedBatchId === batch.id ? "bg-blue-50/50" : ""}
                  >
                    <td className="px-3 py-3">
                      {batch.updatedAt || batch.savedAt
                        ? new Date(batch.updatedAt || batch.savedAt).toLocaleString()
                        : "Not provided"}
                    </td>
                    <td className="px-3 py-3">{batch.month}</td>
                    <td className="px-3 py-3">{batch.department}</td>
                    <td className="px-3 py-3">{batch.rows?.length || 0}</td>
                    <td className="px-3 py-3 font-bold">{money(netTotal)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status="Processed" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="min-h-8 px-2 text-xs"
                          variant="secondary"
                          onClick={() => loadPayrollBatch(batch)}
                        >
                          View
                        </Button>
                        <Button
                          className="min-h-8 px-2 text-xs"
                          onClick={() => updatePayrollBatch(batch)}
                        >
                          Update
                        </Button>
                        <Button
                          className="min-h-8 px-2 text-xs"
                          variant="danger"
                          onClick={() => deletePayrollBatch(batch)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!payrollBatches.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No payroll batches saved yet. Generate payroll to create a register entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {selectedPayrollBatch && (
        <RegisterDocumentView
          title="PAYROLL REGISTER"
          subtitle={`${selectedPayrollBatch.month} | ${selectedPayrollBatch.department}`}
          onClose={() => setSelectedBatchId("")}
          leftRows={[
            ["Month", selectedPayrollBatch.month],
            ["Department", selectedPayrollBatch.department],
            ["Employees", selectedPayrollBatch.rows?.length || 0],
            [
              "Saved Date",
              selectedPayrollBatch.savedAt
                ? new Date(selectedPayrollBatch.savedAt).toLocaleString()
                : "Not provided",
            ],
          ]}
          rightRows={[
            [
              "Updated Date",
              selectedPayrollBatch.updatedAt
                ? new Date(selectedPayrollBatch.updatedAt).toLocaleString()
                : "Not updated",
            ],
            [
              "Total Basic",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) => sum + Number(row.salary || 0),
                  0
                )
              ),
            ],
            [
              "Total Deductions",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) => sum + Number(row.deduction || 0),
                  0
                )
              ),
            ],
            [
              "Net Total",
              money(
                (selectedPayrollBatch.rows || []).reduce(
                  (sum, row) => sum + Number(row.net || 0),
                  0
                )
              ),
            ],
          ]}
          tableColumns={[
            "Employee ID",
            "Employee",
            "Basic Salary",
            "Allowances",
            "Deductions",
            "Net Pay",
            "Status",
          ]}
          tableRows={(selectedPayrollBatch.rows || []).map((row) => ({
            id: row.id,
            values: [
              row.id,
              row.name,
              money(row.salary),
              money(row.allowance),
              money(row.deduction),
              money(row.net),
              row.status,
            ],
          }))}
          bottomLeftTitle="Payroll Notes"
          bottomLeftValue="Registered payroll details saved from the payroll editor."
        />
      )}
    </div>
  );
};

const PayslipPage = () => {
  const [employees] = useHrmsEmployees();
  const [payrollBatches] = useStoredList(HRMS_STORAGE_KEYS.payroll, []);
  const monthOptions = useMemo(
    () =>
      Array.from(
        new Set(["May 2024", "June 2024", ...payrollBatches.map((batch) => batch.month).filter(Boolean)])
      ),
    [payrollBatches]
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [month, setMonth] = useState("May 2024");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("success");
  const [payslip, setPayslip] = useState(null);
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) || null;
  const employee = payslip?.employee || null;
  const payrollRow = payslip?.payrollRow || null;
  const earnings = payslip
    ? [
        ["Basic Salary", Number(payrollRow?.salary || 0)],
        ["Allowances", Number(payrollRow?.allowance || 0)],
      ]
    : [];
  const deductions = payslip
    ? [["Deductions", Number(payrollRow?.deduction || 0)]]
    : [];
  const totalEarnings = earnings.reduce((sum, [, value]) => sum + value, 0);
  const totalDeductions = deductions.reduce((sum, [, value]) => sum + value, 0);
  const netPay = payslip
    ? Number(payrollRow?.net ?? totalEarnings - totalDeductions)
    : 0;

  useEffect(() => {
    if (!selectedEmployeeId && employees[0]?.id) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  const buildPayslip = () => {
    if (!selectedEmployee) {
      setMessageTone("warning");
      setMessage("Select an employee before creating a payslip.");
      setPayslip(null);
      return null;
    }

    const matchingBatch = [...payrollBatches]
      .sort((first, second) =>
        String(second.updatedAt || second.savedAt || "").localeCompare(
          String(first.updatedAt || first.savedAt || "")
        )
      )
      .find(
        (batch) =>
          batch.month === month &&
          (batch.rows || []).some((row) => row.id === selectedEmployee.id)
      );
    const savedRow = matchingBatch?.rows?.find(
      (row) => row.id === selectedEmployee.id
    );
    const fallbackRow = {
      ...selectedEmployee,
      allowance: 5000,
      deduction: 4000,
      net: Number(selectedEmployee.salary || 0) + 5000 - 4000,
      salary: Number(selectedEmployee.salary || 0),
      status: "Pending",
    };

    const nextPayslip = {
      batch: matchingBatch || null,
      employee: selectedEmployee,
      month,
      payrollRow: savedRow || fallbackRow,
    };

    setPayslip(nextPayslip);
    setMessageTone(savedRow ? "success" : "warning");
    setMessage(
      savedRow
        ? `Payslip created for ${selectedEmployee.name} from saved payroll.`
        : `No saved payroll found for ${selectedEmployee.name} in ${month}. Showing fallback values. Save payroll first for registered payslip data.`
    );
    return nextPayslip;
  };

  const createPayslip = () => {
    buildPayslip();
  };

  const downloadPayslip = () => {
    const nextPayslip = buildPayslip();
    if (!nextPayslip) return;

    window.setTimeout(() => window.print(), 0);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="mb-4">
          <Notice tone={messageTone}>{message}</Notice>
          {!employees.length && (
            <Notice tone="warning">Add an employee before generating a payslip.</Notice>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Field label="Employee">
            <Input
              as="select"
              value={selectedEmployeeId}
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
                setPayslip(null);
                setMessage("");
              }}
            >
              <option value="">Select Employee</option>
              {employees.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.id} - {record.name}
                </option>
              ))}
            </Input>
          </Field>
          <Field label="Month">
            <Input
              as="select"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPayslip(null);
                setMessage("");
              }}
            >
              {monthOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </Input>
          </Field>
          <Button onClick={createPayslip} className="self-end">
            Create Payslip
          </Button>
        </div>
      </Panel>

      <Panel id="payslip-print-area">
        <div className="flex justify-end">
          <Button onClick={downloadPayslip} disabled={!selectedEmployee}>
            <AppIcon name="download" className="h-4 w-4" />
            Download PDF
          </Button>
        </div>

        {!payslip ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Select an employee and month, then create the payslip.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex gap-4">
                <Avatar
                  initials={employee?.avatar || getInitials(employee?.name)}
                  size="lg"
                  src={employee?.photo}
                />
                <div>
                  <h2 className="text-xl font-bold">
                    {employee?.name || "No employee selected"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {employee?.id || "Not provided"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {employee?.designation || "Not provided"}
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                {[
                  ["Department", displayValue(employee?.department)],
                  ["Month", payslip.month],
                  ["Date of Joining", displayValue(employee?.joined)],
                  ["Days Worked", "26"],
                  ["Bank Account", "Not provided"],
                  ["Payment Date", "31-05-2024"],
                  ["Payroll Status", payrollRow?.status || "Pending"],
                  ["Payroll Ref", payslip.batch?.id || "Not saved"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[120px_1fr] gap-3">
                    <span className="text-slate-500">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <PayrollBox title="Earnings" rows={earnings} totalLabel="Total Earnings" total={totalEarnings} />
              <PayrollBox title="Deductions" rows={deductions} totalLabel="Total Deductions" total={totalDeductions} />
            </div>
            <div className="mt-5 flex items-center justify-between rounded-md bg-blue-700 px-4 py-3 font-bold text-white">
              <span>Net Pay</span>
              <span>{money(netPay)}</span>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
};

const PayrollBox = ({ title, rows, totalLabel, total }) => (
  <div className="rounded-lg border border-slate-200">
    <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">
      {title}
    </h3>
    <div className="grid gap-2 p-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <span>{label}</span>
          <strong>{money(value)}</strong>
        </div>
      ))}
      <div className="mt-2 flex justify-between gap-4 border-t border-slate-100 pt-3 font-bold">
        <span>{totalLabel}</span>
        <span>{money(total)}</span>
      </div>
    </div>
  </div>
);

const RelievingPage = () => {
  const [employees, setEmployees] = useHrmsEmployees();
  const [, setRelievingRecords] = useStoredList(
    HRMS_STORAGE_KEYS.relieving,
    []
  );
  const employee = employees[0] || null;
  const [items, setItems] = useState([
    ["Handover Documents", true],
    ["Clear Pending Tasks", true],
    ["Return Company Assets", true],
    ["Exit Interview", true],
    ["Final Settlement", true],
  ]);
  const [message, setMessage] = useState("");
  const processRelieving = () => {
    if (!employee) {
      setMessage("Add an employee before processing relieving.");
      return;
    }

    const record = {
      id: `REL-${Date.now()}`,
      employeeId: employee.id,
      employeeName: employee.name,
      checklist: items.map(([label, checked]) => ({ label, checked })),
      lastWorkingDate: "10-06-2024",
      noticePeriod: "30 Days",
      resignationDate: "10-05-2024",
      status: "Relieved",
      savedAt: new Date().toISOString(),
    };

    setRelievingRecords((current) => [record, ...current]);
    setEmployees((current) =>
      current.map((item) =>
        item.id === employee.id ? { ...item, status: "Relieved" } : item
      )
    );
    setMessage(`${employee.name} relieving process saved locally.`);
  };

  return (
    <div className="grid gap-4">
      <Notice>{message}</Notice>
      {!employee && (
        <Panel>
          <Notice tone="warning">No employee records are available.</Notice>
          <Link to="/employees/add">
            <Button className="mt-4">
              <AppIcon name="plus" className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        </Panel>
      )}
      {employee && (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
      <Panel>
        <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="grid justify-items-center border-r border-slate-100 text-center">
            <Avatar initials={employee.avatar} size="lg" src={employee.photo} />
            <h2 className="mt-3 text-lg font-bold">{employee.name}</h2>
            <p className="text-sm text-slate-500">{employee.id}</p>
            <p className="text-sm text-slate-500">{employee.designation}</p>
            <p className="text-sm text-slate-500">{employee.department}</p>
          </div>
          <div className="grid gap-3 text-sm">
            {[
              ["Resignation Date", "10-05-2024"],
              ["Last Working Date", "10-06-2024"],
              ["Notice Period", "30 Days"],
              ["Relieving Status", employee.status === "Relieved" ? "Relieved" : "Pending"],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[150px_1fr] gap-3">
                <span className="text-slate-500">{label}</span>
                <strong
                  className={
                    value === "Pending" ? "text-amber-600" : "text-emerald-600"
                  }
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold">Relieving Checklist</h2>
        <div className="mt-4 grid gap-3">
          {items.map(([label, checked], index) => (
            <label key={label} className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  setItems((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? [item[0], event.target.checked] : item
                    )
                  )
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setItems((current) => current.map(([label]) => [label, false]));
              setMessage("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={processRelieving}>Process Relieving</Button>
        </div>
      </Panel>
      </div>
      )}
    </div>
  );
};

const SearchPage = () => {
  const [employees] = useHrmsEmployees();
  const [filters, setFilters] = useState({
    employeeId: "",
    name: "",
    department: "",
    designation: "",
    status: "",
    phone: "",
  });

  const results = useMemo(() => {
    const terms = Object.values(filters)
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean);
    if (!terms.length) return employees.slice(0, 1);
    return employees.filter((employee) => {
      const haystack = Object.values(employee).join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [filters]);

  const updateFilter = (key, value) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Field label="Employee ID">
            <Input
              value={filters.employeeId}
              onChange={(event) => updateFilter("employeeId", event.target.value)}
              placeholder="Enter ID"
            />
          </Field>
          <Field label="Name">
            <Input
              value={filters.name}
              onChange={(event) => updateFilter("name", event.target.value)}
              placeholder="Enter name"
            />
          </Field>
          <Field label="Department">
            <Input
              value={filters.department}
              onChange={(event) => updateFilter("department", event.target.value)}
              placeholder="Select Department"
            />
          </Field>
          <Field label="Designation">
            <Input
              value={filters.designation}
              onChange={(event) => updateFilter("designation", event.target.value)}
              placeholder="Select Designation"
            />
          </Field>
          <Field label="Status">
            <Input
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              placeholder="Select Status"
            />
          </Field>
          <Field label="Phone Number">
            <Input
              value={filters.phone}
              onChange={(event) => updateFilter("phone", event.target.value)}
              placeholder="Enter phone number"
            />
          </Field>
          <div className="self-end">
            <Button className="w-full">
              <AppIcon name="search" className="h-4 w-4" />
              Search
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <h2 className="text-sm font-bold">Search Results</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["ID", "Name", "Department", "Designation", "Phone", "Status", "Action"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-bold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((employee) => (
                <tr key={employee.id}>
                  <td className="px-3 py-3 font-semibold">{employee.id}</td>
                  <td className="px-3 py-3">{employee.name}</td>
                  <td className="px-3 py-3">{employee.department}</td>
                  <td className="px-3 py-3">{employee.designation}</td>
                  <td className="px-3 py-3">{employee.phone}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={employee.status} />
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      to={`/employees/profile/${employee.id}`}
                      className="text-blue-700"
                    >
                      <AppIcon name="user" className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

const HrmsReportsPage = () => {
  const [, setGeneratedReports] = useStoredList(HRMS_STORAGE_KEYS.reports, []);
  const [message, setMessage] = useState("");
  const reports = [
    ["Employee Report", "View Employee Details", "file"],
    ["Attendance Report", "View Attendance Details", "clock"],
    ["Payroll Report", "View Payroll Details", "receipt"],
    ["Review Report", "View Review Details", "clipboard"],
    ["Relieving Report", "View Relieving Details", "logout"],
    ["Salary Summary", "View Salary Summary", "chart"],
  ];
  const generateReport = (title) => {
    setGeneratedReports((current) => [
      {
        id: `RPT-${Date.now()}`,
        title,
        generatedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setMessage(`${title} generated and saved locally.`);
  };

  return (
    <div className="grid gap-4">
      <Notice>{message}</Notice>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map(([title, description, icon]) => (
          <Panel key={title} className="min-h-36">
            <div className="flex gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-md bg-blue-50 text-blue-700">
                <AppIcon name={icon} className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-bold">{title}</h2>
                <p className="mt-1 text-sm text-slate-500">{description}</p>
                <Button
                  className="mt-4 min-h-8 px-3 text-xs"
                  onClick={() => generateReport(title)}
                >
                  Generate
                </Button>
              </div>
            </div>
          </Panel>
        ))}
      </section>
    </div>
  );
};

const PermissionsPage = () => {
  const roles = [
    ["Admin", "Full access", "Dashboard, employees, payroll, reports, settings"],
    ["HR Manager", "HR access", "Employees, reviews, relieving, reports"],
    ["Payroll Officer", "Payroll access", "Attendance, payroll, payslip"],
    ["Manager", "Team access", "Reviews and employee profiles"],
    ["Employee", "Self service", "Profile and payslip"],
  ];

  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["Role", "Access Level", "Permissions"].map((heading) => (
                <th key={heading} className="px-3 py-3 font-bold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map(([role, level, permissions]) => (
              <tr key={role}>
                <td className="px-3 py-3 font-bold">{role}</td>
                <td className="px-3 py-3">{level}</td>
                <td className="px-3 py-3 text-slate-600">{permissions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

const renderPage = (page) => {
  switch (page) {
    case "dashboard":
      return <DashboardPage />;
    case "employees":
      return <EmployeeListPage />;
    case "add-employee":
      return <AddEmployeePage />;
    case "edit-employee":
      return <EditEmployeePage />;
    case "employee-profile":
      return <EmployeeProfilePage />;
    case "reviews":
      return <ReviewsPage />;
    case "salary-reassessment":
      return <SalaryReassessmentPage />;
    case "attendance":
      return <AttendancePage />;
    case "payroll":
      return <PayrollPage />;
    case "payslip":
      return <PayslipPage />;
    case "relieving":
      return <RelievingPage />;
    case "search":
      return <SearchPage />;
    case "reports":
      return <HrmsReportsPage />;
    case "permissions":
      return <PermissionsPage />;
    default:
      return <DashboardPage />;
  }
};

const HrmsPlaceholder = ({ page }) => {
  if (page === "login") {
    return <HrmsLoginPage />;
  }

  return <HrmsShell>{renderPage(page)}</HrmsShell>;
};

export default HrmsPlaceholder;
