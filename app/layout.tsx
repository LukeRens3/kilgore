import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./editor.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-stack",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kilgore — MySQL editor",
  description: "Browse schemas, write SQL, and inspect results.",
};

/**
 * Applies the stored theme before first paint so the app never flashes the
 * wrong palette. Kept inline because it has to run ahead of hydration.
 */
const themeScript = `
try {
  var stored = localStorage.getItem("kilgore.theme");
  document.documentElement.dataset.theme = stored === "light" ? "light" : "dark";
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
