import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import AuthGuard from "@/components/layout/AuthGuard";
import NavbarWrapper from "@/components/layout/NavbarWrapper";

export const metadata: Metadata = {
  title: "Meta Ads Agent",
  description: "Agente inteligente para criação e gestão de campanhas Meta Ads",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProvider>
          <AuthGuard>
            <NavbarWrapper />
            <main className="min-h-screen bg-[#f0f2f5]">{children}</main>
          </AuthGuard>
        </AppProvider>
      </body>
    </html>
  );
}
