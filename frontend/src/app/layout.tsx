import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const ui = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});
const num = Barlow_Condensed({
  subsets: ["latin", "vietnamese"],
  weight: ["600", "700"],
  variable: "--font-num",
});

export const metadata: Metadata = {
  title: "LectureCards",
  description: "Biến bài giảng thành tóm tắt, flashcard và lịch ôn tập.",
};
export const viewport: Viewport = { themeColor: "#fdfdfb" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions (dark mode, translators) inject attributes on <html> before hydration.
    <html lang="vi" className={`${ui.variable} ${num.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
