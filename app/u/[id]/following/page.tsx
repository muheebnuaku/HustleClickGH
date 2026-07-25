"use client";

import { useParams } from "next/navigation";
import { UserListView } from "@/components/UserListView";

export default function FollowingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <UserListView
      title="Following"
      endpoint={`/api/users/${id}/following`}
      backHref={`/u/${id}`}
      emptyText="Not following anyone yet."
    />
  );
}
