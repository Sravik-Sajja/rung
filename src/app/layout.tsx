// Root document shell: loads self-hosted fonts, global tokens, and shared metadata.
import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Rung: differentiated fractions practice",
  description:
    "A classroom platform that turns one assignment into a per-student diagnostic, targeted practice, and a teacher-ready small-group plan."
};

// Runs before first paint so the stored theme preference (light/dark) is stamped onto <html>
// ahead of hydration, avoiding a flash of the wrong theme. "system" (or no stored value) leaves
// data-theme unset so the prefers-color-scheme media query in globals.css takes over.
const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var v = localStorage.getItem("rung-theme");
    if (v === "light" || v === "dark") {
      document.documentElement.setAttribute("data-theme", v);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Inline (not next/script) so this runs synchronously before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      {/* Browser extensions (translation tools, etc.) inject attributes/classes onto <body>
          before React hydrates, causing a benign attribute mismatch. Suppress the warning on this
          one element — it only tolerates body-level extension noise, not real hydration bugs. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
