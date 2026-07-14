// Root document shell that loads global styles and shared page metadata.
import "./globals.css";

export const metadata = { title: "Rung", description: "Fractions learning demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
