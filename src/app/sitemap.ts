import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ordavo.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-11-05");
  return ["/", "/pilot", "/privacy", "/terms"].map((path) => ({
    url: `${BASE}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : path === "/pilot" ? 0.9 : 0.3,
    alternates: {
      languages: {
        en: `${BASE}${path === "/" ? "" : path}`,
        el: `${BASE}${path}?lang=el`,
      },
    },
  }));
}
