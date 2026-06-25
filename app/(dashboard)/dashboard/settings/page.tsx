import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/config/routes";

/**
 * Settings index — пока единственный раздел настроек это Members.
 * Редиректим, чтобы /dashboard/settings не был мёртвым 404.
 */
export default function SettingsPage() {
  redirect(ROUTES.members);
}
