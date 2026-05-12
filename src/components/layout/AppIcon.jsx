const iconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.8,
  viewBox: "0 0 24 24",
};

const ICONS = {
  activity: (
    <>
      <path d="M4 13h4l2.5-5 3 10 2.5-5H20" />
    </>
  ),
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 15.5h11" />
      <path d="M8 15.5V10a4 4 0 1 1 8 0v5.5" />
      <path d="M10.5 18a1.5 1.5 0 0 0 3 0" />
    </>
  ),
  chart: (
    <>
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
    </>
  ),
  "chevron-down": (
    <>
      <path d="m6 9 6 6 6-6" />
    </>
  ),
  "chevron-left": (
    <>
      <path d="m15 6-6 6 6 6" />
    </>
  ),
  "chevron-right": (
    <>
      <path d="m9 6 6 6-6 6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 4.5h6v3H9z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  contacts: (
    <>
      <path d="M6 6.5A2.5 2.5 0 0 1 8.5 4h7A2.5 2.5 0 0 1 18 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 17.5z" />
      <path d="M9.5 9.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 0 0-5 0Z" />
      <path d="M8.5 16c.9-1.8 2.2-2.7 3.5-2.7S14.6 14.2 15.5 16" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 7 4v10l-7 4-7-4V7z" />
      <path d="m12 3 7 4-7 4-7-4" />
      <path d="M12 11v10" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m13 7 4 4" />
    </>
  ),
  file: (
    <>
      <path d="M8 4h6l4 4v12H8z" />
      <path d="M14 4v4h4" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5h6l2 2H20v8a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.25" />
      <rect x="14" y="4" width="6" height="6" rx="1.25" />
      <rect x="4" y="14" width="6" height="6" rx="1.25" />
      <rect x="14" y="14" width="6" height="6" rx="1.25" />
    </>
  ),
  home: (
    <>
      <path d="m4 10.5 8-6 8 6" />
      <path d="M6.5 9.5v10h4.5V14h2v5.5h4.5v-10" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </>
  ),
  logout: (
    <>
      <path d="M10 6V4.5A1.5 1.5 0 0 1 11.5 3h6A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 19.5V18" />
      <path d="M15 12H5" />
      <path d="m8 9-3 3 3 3" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m12 3 8 4.5-8 4.5-8-4.5" />
      <path d="M12 12v9" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20s5-4.6 5-9a5 5 0 1 0-10 0c0 4.4 5 9 5 9Z" />
      <circle cx="12" cy="11" r="1.8" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  receipt: (
    <>
      <path d="M7 4h10v16l-2-1.5L12 20l-3-1.5L7 20z" />
      <path d="M9.5 9h5" />
      <path d="M9.5 12h5" />
      <path d="M9.5 15h3" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 7h-7a3 3 0 0 0-3 3" />
      <path d="m17 7-2.5-2.5" />
      <path d="M17 7 14.5 9.5" />
      <path d="M7 17h7a3 3 0 0 0 3-3" />
      <path d="m7 17 2.5 2.5" />
      <path d="M7 17 9.5 14.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m19 19-3.5-3.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a7.4 7.4 0 0 0 .1-2l1.8-1.2-1.6-2.7-2 .6a7.7 7.7 0 0 0-1.5-.9L16 6.5h-4l-.2 2.3a7.7 7.7 0 0 0-1.5.9l-2-.6-1.6 2.7L4.5 13a7.4 7.4 0 0 0 .1 2l-1.8 1.2 1.6 2.7 2-.6a7.7 7.7 0 0 0 1.5.9L8 21.5h4l.2-2.3a7.7 7.7 0 0 0 1.5-.9l2 .6 1.6-2.7z" />
    </>
  ),
  spark: (
    <>
      <path d="m12 4 1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </>
  ),
  tool: (
    <>
      <path d="M14.5 6.5a3.5 3.5 0 0 0 4 4L11 18l-4-4 7.5-7.5a3.5 3.5 0 0 0 4 4" />
      <path d="m5 19 2 2" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h3l2 2v3h-5z" />
      <circle cx="7" cy="17" r="1.5" />
      <circle cx="17" cy="17" r="1.5" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7H5v4" />
      <path d="M5 11a7 7 0 1 0 2.1-5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V6" />
      <path d="m8 10 4-4 4 4" />
      <path d="M5 19h14" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <circle cx="17" cy="8" r="2.25" />
      <path d="M14.5 17a3.5 3.5 0 0 1 4.5-3.3" />
    </>
  ),
  x: (
    <>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
};

const AppIcon = ({ className = "h-5 w-5", name = "grid" }) => (
  <svg {...iconProps} className={className}>
    {ICONS[name] || ICONS.grid}
  </svg>
);

export default AppIcon;
