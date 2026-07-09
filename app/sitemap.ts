import type { MetadataRoute } from "next";
import { ROUTES } from "@/shared/config/routes";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://bussines.nevorahq.com").replace(/\/$/, "");
const LAST_MODIFIED = new Date("2026-07-09");

function absoluteUrl(path: string) {
  return path === ROUTES.home ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl(ROUTES.home),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl(ROUTES.landingEn),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl(ROUTES.landingRo),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl(ROUTES.landingRu),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl(ROUTES.pricing),
      lastModified: LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: absoluteUrl(ROUTES.terms),
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: absoluteUrl(ROUTES.privacy),
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: absoluteUrl(ROUTES.refunds),
      lastModified: LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
