import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ordavo.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/pilot", "/privacy", "/terms"],
      disallow: ["/m/", "/bar", "/staff", "/dashboard", "/admin", "/api/", "/login", "/signup", "/r/", "/thanks"],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
