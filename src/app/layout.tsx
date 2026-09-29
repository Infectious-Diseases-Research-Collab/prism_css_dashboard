import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PRISM CSS Dashboard",
  description: "Cross-sectional survey progress and indicators for the 26 MRC surveillance sites",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
