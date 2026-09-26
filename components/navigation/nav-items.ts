import { Compass, Dna, Heart, Map, Search, UserRound } from "lucide-react";

export const DESKTOP_NAV = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/search", label: "Search", icon: Search },
  { href: "/map", label: "Map", icon: Map },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/home-dna", label: "Home DNA", icon: Dna },
] as const;

export const MOBILE_NAV = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/search", label: "Search", icon: Search },
  { href: "/saved", label: "Saved", icon: Heart },
  { href: "/home-dna", label: "DNA", icon: Dna },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
