import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Hub", template: "%s · Hub" },
  description: "Je persoonlijke overzicht voor mails, geld, planning en documenten.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
