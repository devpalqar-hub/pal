import { RequireRole } from "@/components/require-role";
import AnalyticsView from "./_view";

// Project analytics is visible to everyone for their own projects; the team tab inside is limited to managers.
export default function AnalyticsPage() {
  return <RequireRole min="STAFF"><AnalyticsView /></RequireRole>;
}
