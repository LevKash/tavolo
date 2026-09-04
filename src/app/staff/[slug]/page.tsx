import { notFound } from "next/navigation";
import { getVenueBySlug } from "@/lib/core";
import StaffApp from "./staff-app";

export const dynamic = "force-dynamic";

export default async function StaffPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const venue = await getVenueBySlug(slug);
  if (!venue) notFound();
  return <StaffApp slug={venue.slug} venueName={venue.name} accent={venue.accent_color} />;
}
