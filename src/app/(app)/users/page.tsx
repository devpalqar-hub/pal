import { RequireRole } from "@/components/require-role";
import UsersList from "./_list";

export default function UsersPage() {
  return <RequireRole min="LEAD"><UsersList /></RequireRole>;
}
