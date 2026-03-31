import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1DAL 관제탑",
  description: "원달(1DAL) 실시간 콜 관제 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
