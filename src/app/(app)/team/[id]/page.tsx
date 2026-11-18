import { RequireRole } from "@/components/require-role";
import MemberView from "./_view";

export default function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  return <RequireRole min="LEAD"><MemberView params={params} /></RequireRole>;
}
