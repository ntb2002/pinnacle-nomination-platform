import { AdminNav } from "@/components/admin/admin-nav";
import { requireRole } from "@/server/auth/session";

/**
 * Admin shell. The role check here keeps non-admins from seeing any admin chrome; every
 * admin page, action and service still checks the role itself (layouts do not guard
 * server actions).
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireRole("ADMIN");
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
