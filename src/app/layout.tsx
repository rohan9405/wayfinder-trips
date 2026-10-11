import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayfinder · Trip discovery",
  description: "Discover destinations, find the cheapest dates and compare flights with generative UI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
