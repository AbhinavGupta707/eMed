import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "HomeRounds",
  description: "Synthetic adaptive clinical-round prototype"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
