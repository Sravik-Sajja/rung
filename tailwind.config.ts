// Tailwind theme for Rung — tokens map to CSS variables in globals.css so themes flip automatically.
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        elevated: "var(--elevated)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-faint": "var(--ink-faint)",
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-contrast": "var(--accent-contrast)",
        "accent-soft": "var(--accent-soft)",
        spark: "var(--spark)",
        "spark-soft": "var(--spark-soft)",
        "spark-fg": "var(--spark-fg)",
        "spark-ink": "var(--spark-ink)",
        focus: "var(--focus)",
        "focus-hover": "var(--focus-hover)",
        "focus-contrast": "var(--focus-contrast)",
        "focus-soft": "var(--focus-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        mastery: {
          none: "var(--m-none)",
          "none-fg": "var(--m-none-fg)",
          support: "var(--m-support)",
          "support-fg": "var(--m-support-fg)",
          developing: "var(--m-developing)",
          "developing-fg": "var(--m-developing-fg)",
          mastered: "var(--m-mastered)",
          "mastered-fg": "var(--m-mastered-fg)"
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      borderColor: { DEFAULT: "var(--border)" },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)"
      },
      maxWidth: { content: "64rem", wide: "100rem" }
    }
  },
  plugins: []
} satisfies Config;
