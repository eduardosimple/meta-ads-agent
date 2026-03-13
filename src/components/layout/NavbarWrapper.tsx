"use client";

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

const HIDE_NAVBAR_PATHS = ["/login"];

export default function NavbarWrapper() {
  const pathname = usePathname();
  const hide = HIDE_NAVBAR_PATHS.some((p) => pathname.startsWith(p));
  if (hide) return null;
  return <Navbar />;
}
