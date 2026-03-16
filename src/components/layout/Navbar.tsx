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
  { href: "/clientes", label: "Clientes" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { logout } = useAppContext();

  return (
    <nav
      className="bg-meta-gradient shadow-lg sticky top-0 z-50"
      style={{
        background: "linear-gradient(135deg, #1877f2 0%, #42b72a 100%)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="text-white font-bold text-lg hidden sm:block">
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
                      ? "bg-white/25 text-white"
                      : "text-white/80 hover:text-white hover:bg-white/10"
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
              className="text-white/80 hover:text-white border border-white/20 hover:border-white/40
                         px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/10"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
