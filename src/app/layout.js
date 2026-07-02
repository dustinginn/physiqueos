import { Plus_Jakarta_Sans } from "next/font/google";
import FloatingBottomNavigation from "../components/navigation/FloatingBottomNavigation";
import ThemeScript from "../components/theme/ThemeScript";
import ThemeSwitch from "../components/theme/ThemeSwitch";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: [
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
  ],
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
