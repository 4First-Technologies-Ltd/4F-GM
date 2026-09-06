import type { Metadata } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "4FG Smart Gas Monitor",
    template: "%s · 4FG Smart Gas Monitor",
  },
  description:
    "Know your gas level before it runs out. Real-time cylinder monitoring, automatic reorder, and a vendor marketplace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable} dark`} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint — no flash of dark on
            a light-theme visitor's reload. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
