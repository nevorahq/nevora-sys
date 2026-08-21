import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Nevora Finance Service",
  description: "Independent runtime for the Nevora Finance (Money) product.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0c111d", color: "#e6eaf2", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
