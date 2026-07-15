import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "@/modules/landing";

export const metadata: Metadata = landingMetadata("ro");

export default function RomanianLandingPage() {
  return <LandingPage locale="ro" />;
}
