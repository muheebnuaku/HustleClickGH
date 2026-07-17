"use client";

import { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, Search, Mail, Phone, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { PARTNER_PROJECT_TYPES } from "@/lib/constants";

interface Inquiry {
  id: string;
  companyName: string;
  contactName: string;
  workEmail: string;
  phone: string | null;
  country: string | null;
  projectType: string;
  datasetSize: string | null;
  budgetRange: string | null;
  message: string;
  status: string;
  createdAt: string;
}

const STATUSES = ["new", "contacted", "in_progress", "closed"];
const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  contacted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  in_progress: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  closed: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function projectLabel(v: string) {
  return PARTNER_PROJECT_TYPES.find((p) => p.value === v)?.label ?? v;
}

export default function AdminPartnersPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [newCount, setNewCount] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/partners?${params.toString()}`);
      const data = await res.json();
      setInquiries(data.inquiries || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setNewCount(data.stats?.newCount || 0);
    } catch (error) {
      console.error("Failed to fetch partner inquiries:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch("/api/admin/partners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Building2 size={28} /> Partner Inquiries
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              Companies requesting datasets and partnerships
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl text-sm font-semibold">
            {newCount} new
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search company, contact or email…"
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-10 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </CardContent>
        </Card>

        {/* List */}
        {isLoading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <div className="w-10 h-10 border-t-2 border-b-2 border-green-500 rounded-full animate-spin" />
          </div>
        ) : inquiries.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-zinc-500">No inquiries found.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {inquiries.map((i) => (
              <Card key={i.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">{i.companyName}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[i.status] || ""}`}>
                          {i.status.replace("_", " ")}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {projectLabel(i.projectType)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                        <span>{i.contactName}</span>
                        <a href={`mailto:${i.workEmail}`} className="flex items-center gap-1 hover:text-blue-600">
                          <Mail size={13} /> {i.workEmail}
                        </a>
                        {i.phone && (
                          <span className="flex items-center gap-1"><Phone size={13} /> {i.phone}</span>
                        )}
                        {i.country && <span>{i.country}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-zinc-500 mb-2">{formatDate(i.createdAt)}</p>
                      <select
                        value={i.status}
                        onChange={(e) => updateStatus(i.id, e.target.value)}
                        className="h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2 text-sm"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace("_", " ")}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-500">
                    {i.datasetSize && <span>Size: {i.datasetSize}</span>}
                    {i.budgetRange && <span>Budget: {i.budgetRange}</span>}
                  </div>

                  <button
                    onClick={() => setExpanded(expanded === i.id ? null : i.id)}
                    className="mt-3 text-sm text-blue-600 hover:underline"
                  >
                    {expanded === i.id ? "Hide message" : "View message"}
                  </button>
                  {expanded === i.id && (
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                      {i.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 disabled:opacity-40"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
