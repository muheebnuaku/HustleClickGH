import { redirect } from "next/navigation";

// Admins land on Users by default (login sends them to /admin).
export default function AdminIndex() {
  redirect("/admin/users");
}
