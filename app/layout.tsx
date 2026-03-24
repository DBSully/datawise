import type { Metadata } from "next";
import "./globals.css";
import { AppChrome } from "@/components/layout/app-chrome";

export const metadata: Metadata = {
  title: "DataWise",
  description: "Property-centric real estate analytics platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
