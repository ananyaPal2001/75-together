import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "75 Together",
  description: "A shared 75 Hard challenge, journal, and daily commitment tracker.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
