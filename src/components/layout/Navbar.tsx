"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppContext } from "@/context/AppContext";
import ClientSelector from "./ClientSelector";

const NAV_LINKS = [
  { href: "/", label: "Chat" },
  { href: "/visao-geral", label: "Visão Geral" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campanhas", label: "Campanhas" },
  { href: "/criar", label: "Nova Campanha" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/clientes", label: "Clientes" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { logout } = useAppContext();

  return (
    <nav className="bg-[#09090b] border-b border-[#1c1c20] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-[#7c3aed] to-[#3b82f6] shadow-[0_4px_16px_-4px_rgba(124,58,237,0.5)]">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-zinc-50 font-semibold text-base hidden sm:block tracking-tight">
              Meta Ads Agent
            </span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#18181b] text-zinc-50 border border-[#1c1c20]"
                      : "text-zinc-400 hover:text-zinc-50 hover:bg-[#18181b]"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <ClientSelector />
            <button
              onClick={logout}
              className="text-zinc-400 hover:text-zinc-50 border border-[#1c1c20] hover:border-zinc-700
                         px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-[#18181b]"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
