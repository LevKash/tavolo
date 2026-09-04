import { notFound } from "next/navigation";
import { getVenueBySlug } from "@/lib/core";
import BarApp from "./bar-app";

export const dynamic = "force-dynamic";

export default async function BarPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();
  return <BarApp slug={venue.slug} venueName={venue.name} accent={venue.accent_color} />;
}
