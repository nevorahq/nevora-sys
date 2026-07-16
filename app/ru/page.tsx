import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "@/modules/landing";

export const metadata: Metadata = landingMetadata("ru");

export default function RussianLandingPage() {
  return <LandingPage locale="ru" />;
}
