import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";

export default function SettingsPage() {
  redirect(ROUTES.settingsProfile);
}
