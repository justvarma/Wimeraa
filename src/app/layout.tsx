import type { Metadata } from "next"
import "./globals.css"
import { AppProvider } from "@/components/providers/AppProvider"

export const metadata: Metadata = {
  title: "Wimera Systems - Inventory Management",
  description: "Inventory Control & Asset Management System",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
