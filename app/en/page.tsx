import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "@/modules/landing";

export const metadata: Metadata = landingMetadata("en");

export default function EnglishLandingPage() {
  return <LandingPage locale="en" />;
}
