import { RequireRole } from "@/components/require-role";
import TeamView from "./_view";

export default function TeamPage() {
  return <RequireRole min="LEAD"><TeamView /></RequireRole>;
}
