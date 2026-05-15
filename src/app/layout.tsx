import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/shared/AppSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { ChatWidget } from "@/components/shared/ChatPanel";
import { GlobalProviders } from "@/components/shared/GlobalProviders";
import { MockModeBanner } from "@/components/shared/MockModeBanner";

export const metadata: Metadata = {
  title: "BOMatic",
  description: "AI-powered Cisco presales automation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        <MockModeBanner />
        <GlobalProviders>
          <div className="flex h-screen">
            <AppSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto">{children}</main>
            </div>
          </div>
          <ChatWidget />
        </GlobalProviders>
      </body>
    </html>
  );
}
