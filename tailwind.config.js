export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        clay: {
          bg: "var(--background-main)",
          bgAlt: "var(--background-main-alt)",
          surface: "var(--background-card)",
          elevated: "var(--background-card-elevated)",
          muted: "var(--background-muted)",
          text: "var(--text-primary)",
          subtext: "var(--text-secondary)",
          border: "var(--border-color)",
          primary: "var(--primary)",
          accent: "var(--accent-blue)",
        },
      },
      borderRadius: {
        clay: "var(--radius)",
        "clay-sm": "var(--radius-sm)",
        "clay-xs": "var(--radius-xs)",
        "clay-lg": "var(--radius-lg)",
        "clay-xl": "var(--radius-xl)",
      },
      boxShadow: {
        clay: "var(--shadow-card)",
        "clay-soft": "var(--shadow-soft)",
        "clay-floating": "var(--shadow-floating)",
        "clay-inner": "var(--shadow-pressed)",
        "clay-accent": "var(--shadow-accent)",
      },
      backgroundImage: {
        "clay-surface": "var(--gradient-surface)",
        "clay-surface-strong": "var(--gradient-surface-strong)",
        "clay-accent": "var(--gradient-accent)",
        "clay-body": "var(--gradient-body)",
      },
      ringColor: {
        clay: "var(--ring)",
      },
    },
  },
}
