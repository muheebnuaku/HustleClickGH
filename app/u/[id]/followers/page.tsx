"use client";

import { useParams } from "next/navigation";
import { UserListView } from "@/components/UserListView";

export default function FollowersPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <UserListView
      title="Followers"
      endpoint={`/api/users/${id}/followers`}
      backHref={`/u/${id}`}
      emptyText="No followers yet."
    />
  );
}
