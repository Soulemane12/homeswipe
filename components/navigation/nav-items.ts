import { Dna, Heart, Layers } from "lucide-react";

export const DESKTOP_NAV = [
  { href: "/swipe", label: "Swipe", icon: Layers },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/home-dna", label: "Home DNA", icon: Dna },
] as const;

export const MOBILE_NAV = [
  { href: "/swipe", label: "Swipe", icon: Layers },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/home-dna", label: "DNA", icon: Dna },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
