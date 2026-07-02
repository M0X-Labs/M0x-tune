import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "./context/ThemeContext";
import { LogsProvider } from "./context/LogsContext";

export const metadata: Metadata = {
  title: "M0X Fine-Tuner Studio",
  description: "Fine-tuning studio for LLM's",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <LogsProvider>
            {children}
          </LogsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
