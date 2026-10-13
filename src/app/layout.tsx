import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeScript } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Wayfinder · Trip discovery",
  description: "Discover destinations, find the cheapest dates and compare flights with generative UI.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
