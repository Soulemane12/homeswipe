import type { Metadata } from "next";
import { MapExperience } from "@/components/maps/map-experience";
import { getCurrentUserId } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getOrCreateUser } from "@/services/users";

export const metadata: Metadata = { title: "Map" };

export default async function MapPage(props: PageProps<"/map">) {
  const { focus } = await props.searchParams;
  const user = await getOrCreateUser(await getCurrentUserId());
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
      <h1 className="mb-4 font-display text-4xl md:text-5xl">Map</h1>
      <MapExperience mapboxToken={env().NEXT_PUBLIC_MAPBOX_TOKEN} constraints={user.constraints} focusId={typeof focus === "string" ? focus : undefined} />
    </div>
  );
}
