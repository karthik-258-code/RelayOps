import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RelayOps — Project handover",
  description: "Evidence-linked project handovers with human review.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
