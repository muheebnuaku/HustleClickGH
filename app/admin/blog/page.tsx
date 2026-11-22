"use client";

import { useEffect, useRef, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { EmptyState, Notice, PageHeader, PageSkeleton, Panel } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, ImagePlus, Loader2, Megaphone, Pencil, Pin, PinOff, Plus, Save, Trash2, X } from "lucide-react";
import { uploadFile } from "@/lib/upload-file";
import { formatDate } from "@/lib/utils";

interface Post {
  id: string;
  slug: string;
  title: string;
  body: string;
  coverImage: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  pinned: boolean;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

interface Link {
  label: string;
  url: string;
  note?: string;
}

const EMPTY = { title: "", body: "", coverImage: "", linkUrl: "", linkLabel: "", pinned: false, published: true, notify: false };

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [linksDraft, setLinksDraft] = useState<Link[]>([]);
  const [savingLinks, setSavingLinks] = useState(false);

  const load = async () => {
    try {
      const data = await readJson(await fetch("/api/admin/blog"));
      setPosts(data.posts);
      setLinks(data.links);
      setLinksDraft(data.links.length ? data.links : [{ label: "", url: "" }]);
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not load posts" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY);
    setShowEditor(true);
    setMessage(null);
  };

  const openEdit = (p: Post) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      body: p.body,
      coverImage: p.coverImage ?? "",
      linkUrl: p.linkUrl ?? "",
      linkLabel: p.linkLabel ?? "",
      pinned: p.pinned,
      published: p.published,
      notify: false,
    });
    setShowEditor(true);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pushNote = (pushed: { sent: number; failed: number; removed: number } | null) =>
    pushed ? ` Push sent to ${pushed.sent} device${pushed.sent === 1 ? "" : "s"}.` : "";

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(editingId ? `/api/admin/blog/${editingId}` : "/api/admin/blog", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notify: form.published && form.notify }),
      });
      const data = await readJson(res);
      setShowEditor(false);
      setMessage({
        tone: "success",
        text: (data.post.published ? "Published." : "Saved as a draft.") + pushNote(data.pushed),
      });
      await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  };

  const patch = async (p: Post, body: Record<string, unknown>, done: string) => {
    setMessage(null);
    try {
      await readJson(
        await fetch(`/api/admin/blog/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      );
      setMessage({ tone: "success", text: done });
      await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not update" });
    }
  };

  const remove = async (p: Post) => {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await readJson(await fetch(`/api/admin/blog/${p.id}`, { method: "DELETE" }));
      setMessage({ tone: "success", text: "Post deleted." });
      if (editingId === p.id) setShowEditor(false);
      await load();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not delete" });
    }
  };

  const uploadCover = async (file: File) => {
    if (!file.type.startsWith("image/")) return setMessage({ tone: "error", text: "Choose an image file." });
    if (file.size > 5 * 1024 * 1024) return setMessage({ tone: "error", text: "Keep the image under 5 MB." });
    setUploading(true);
    try {
      const { url } = await uploadFile(file, "blog");
      setForm((f) => ({ ...f, coverImage: url }));
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  };

  const saveLinks = async () => {
    setSavingLinks(true);
    setMessage(null);
    try {
      const data = await readJson(
        await fetch("/api/admin/blog/links", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: linksDraft }),
        }),
      );
      setLinks(data.links);
      setLinksDraft(data.links.length ? data.links : [{ label: "", url: "" }]);
      setMessage({ tone: "success", text: "Community links saved. They show on the Updates page now." });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not save links" });
    } finally {
      setSavingLinks(false);
    }
  };

  const setLink = (i: number, key: keyof Link, value: string) =>
    setLinksDraft((list) => list.map((l, j) => (j === i ? { ...l, [key]: value } : l)));

  const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PageHeader
          icon={Megaphone}
          title="Updates (Blog)"
          description="Post news and new projects on the public Updates page, and manage the WhatsApp groups shown there."
          actions={
            <div className="flex gap-2">
              <a href="/blog" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink size={15} className="mr-1.5" /> View page
                </Button>
              </a>
              <Button size="sm" onClick={openNew}>
                <Plus size={15} className="mr-1.5" /> New update
              </Button>
            </div>
          }
        />

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        {showEditor && (
          <Panel className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">{editingId ? "Edit update" : "New update"}</h2>
              <button onClick={() => setShowEditor(false)} aria-label="Close editor" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Title</label>
              <Input value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="New project: paid voice recordings in Accra" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Post</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={10}
                className={field}
                placeholder={"Write the update. Leave a blank line between paragraphs.\nLinks (https://…) become clickable."}
              />
              <p className="mt-1 text-xs text-zinc-500">{form.body.trim().split(/\s+/).filter(Boolean).length} words</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Button link (optional)</label>
                <Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://chat.whatsapp.com/…" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Button text</label>
                <Input value={form.linkLabel} maxLength={60} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })} placeholder="Join the WhatsApp group" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Cover image (optional)</label>
              <div className="flex flex-wrap items-center gap-3">
                {form.coverImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.coverImage} alt="" className="h-16 w-28 rounded-lg object-cover" />
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <ImagePlus size={15} className="mr-1.5" />}
                  {form.coverImage ? "Change image" : "Upload image"}
                </Button>
                {form.coverImage && (
                  <button type="button" onClick={() => setForm({ ...form, coverImage: "" })} className="text-xs text-red-600 hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} />
                Publish (visible to everyone)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                Pin to the top
              </label>
              <label className={`flex items-center gap-2 ${form.published ? "" : "opacity-40"}`}>
                <input type="checkbox" disabled={!form.published} checked={form.published && form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
                Also send a push notification to all users
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditor(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || uploading}>
                {saving ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <Save size={15} className="mr-1.5" />}
                {form.published ? "Publish" : "Save draft"}
              </Button>
            </div>
          </Panel>
        )}

        {loading ? (
          <PageSkeleton stats={0} rows={4} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No updates yet"
            description="Post your first update. It appears on the public Updates page at /blog."
            action={<Button onClick={openNew}><Plus size={15} className="mr-1.5" /> New update</Button>}
          />
        ) : (
          <Panel className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {posts.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        p.published
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      }
                    >
                      {p.published ? "Published" : "Draft"}
                    </span>
                    {p.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        <Pin size={11} /> Pinned
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">{formatDate(p.publishedAt ?? p.updatedAt)}</span>
                  </div>
                  <p className="mt-1 truncate font-medium text-foreground">{p.title}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                    <Pencil size={14} className="mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => patch(p, { published: !p.published }, p.published ? "Unpublished." : "Published.")}>
                    {p.published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button variant="outline" size="sm" aria-label={p.pinned ? "Unpin" : "Pin"} onClick={() => patch(p, { pinned: !p.pinned }, p.pinned ? "Unpinned." : "Pinned to the top.")}>
                    {p.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </Button>
                  {p.published && (
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" aria-label="Open post">
                        <ExternalLink size={14} />
                      </Button>
                    </a>
                  )}
                  <Button variant="outline" size="sm" aria-label="Delete" onClick={() => remove(p)} className="text-red-600 hover:text-red-700">
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </Panel>
        )}

        <Panel className="space-y-3 p-5">
          <div>
            <h2 className="font-semibold text-foreground">WhatsApp groups and community links</h2>
            <p className="text-sm text-zinc-500">
              Shown beside every update. Social accounts (TikTok, YouTube, WhatsApp chat) appear automatically.
            </p>
          </div>
          {linksDraft.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
              <input className={field} value={l.label} maxLength={80} onChange={(e) => setLink(i, "label", e.target.value)} placeholder="Name, e.g. HustleClickGH Community 1" />
              <input className={field} value={l.url} onChange={(e) => setLink(i, "url", e.target.value)} placeholder="https://chat.whatsapp.com/…" />
              <input className={field} value={l.note ?? ""} maxLength={140} onChange={(e) => setLink(i, "note", e.target.value)} placeholder="Note (optional), e.g. Ghana contributors" />
              <button
                type="button"
                aria-label="Remove link"
                onClick={() => setLinksDraft((list) => list.filter((_, j) => j !== i))}
                className="justify-self-start rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => setLinksDraft((list) => [...list, { label: "", url: "" }])} disabled={linksDraft.length >= 12}>
              <Plus size={14} className="mr-1" /> Add link
            </Button>
            <Button size="sm" onClick={saveLinks} disabled={savingLinks}>
              {savingLinks ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
              Save links
            </Button>
          </div>
          {links.length === 0 && (
            <p className="text-xs text-zinc-500">No groups saved yet. Until you add one, the page links to the main HustleClickGH Community group.</p>
          )}
        </Panel>
      </div>
    </AdminLayout>
  );
}
