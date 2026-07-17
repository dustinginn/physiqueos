import localFont from "next/font/local";
import FloatingBottomNavigation from "../components/navigation/FloatingBottomNavigation";
import ThemeScript from "../components/theme/ThemeScript";
import ThemeSwitch from "../components/theme/ThemeSwitch";
import "./globals.css";

const plusJakarta = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  display: "swap",
  variable: "--font-sans",
  weight: "200 800",
  style: "normal",
});

export const metadata = {
  title: "PhysiqueOS",
  description: "The operating system for your physique.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} antialiased`}
      suppressHydrationWarning
    >
      <body>
        <ThemeScript />
        {children}
        <FloatingBottomNavigation />
        <ThemeSwitch />
      </body>
    </html>
  );
}
