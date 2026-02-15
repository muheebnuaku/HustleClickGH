"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Edit2, Eye, Loader2, PenTool, Plus, Save, Trash2, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  published: boolean;
  views: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminBlogPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "",
    published: false,
  });

  // Note: Using localStorage as demo. Create API routes for production.
  const fetchPosts = () => {
    try {
      const stored = localStorage.getItem("blog_posts");
      if (stored) {
        setPosts(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePosts = (newPosts: BlogPost[]) => {
    localStorage.setItem("blog_posts", JSON.stringify(newPosts));
    setPosts(newPosts);
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      if (session?.user?.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      fetchPosts();
    }
  }, [status, router, session]);

  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  };

  const handleTitleChange = (title: string) => {
    setFormData({
      ...formData,
      title,
      slug: editingPost ? formData.slug : generateSlug(title),
    });
  };

  const resetForm = () => {
    setFormData({ title: "", slug: "", excerpt: "", content: "", coverImage: "", published: false });
    setEditingPost(null);
    setShowEditor(false);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      setMessage({ type: "error", text: "Title and content are required" });
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      if (editingPost) {
        const updated = posts.map(p => p.id === editingPost.id ? { ...p, ...formData, updatedAt: now } : p);
        savePosts(updated);
        setMessage({ type: "success", text: "Post updated!" });
      } else {
        const newPost: BlogPost = { id: `post_${Date.now()}`, ...formData, views: 0, createdAt: now, updatedAt: now };
        savePosts([newPost, ...posts]);
        setMessage({ type: "success", text: "Post created!" });
      }
      resetForm();
    } catch {
      setMessage({ type: "error", text: "Failed to save post" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (post: BlogPost) => {
    setFormData({ title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, coverImage: post.coverImage, published: post.published });
    setEditingPost(post);
    setShowEditor(true);
  };

  const handleDelete = (postId: string) => {
    if (!confirm("Delete this post?")) return;
    savePosts(posts.filter(p => p.id !== postId));
    setMessage({ type: "success", text: "Post deleted" });
  };

  const togglePublish = (postId: string) => {
    savePosts(posts.map(p => p.id === postId ? { ...p, published: !p.published, updatedAt: new Date().toISOString() } : p));
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (status === "loading" || isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Blog Management</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">Create and manage blog posts</p>
          </div>
          {!showEditor && (
            <Button onClick={() => setShowEditor(true)}>
              <Plus size={18} />
              New Post
            </Button>
          )}
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <BookOpen className="text-blue-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total Posts</p>
                  <p className="text-2xl font-bold text-foreground">{posts.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <Eye className="text-green-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Published</p>
                  <p className="text-2xl font-bold text-foreground">{posts.filter(p => p.published).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <PenTool className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Drafts</p>
                  <p className="text-2xl font-bold text-foreground">{posts.filter(p => !p.published).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {showEditor && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{editingPost ? "Edit Post" : "Create New Post"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={resetForm}><X size={18} /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Title *</label>
                  <Input placeholder="Enter post title" value={formData.title} onChange={(e) => handleTitleChange(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Slug</label>
                  <Input placeholder="post-url-slug" value={formData.slug} onChange={(e) => setFormData({ ...formData, slug: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Excerpt</label>
                <Input placeholder="Brief description" value={formData.excerpt} onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Cover Image URL</label>
                <div className="flex gap-2">
                  <Input placeholder="https://images.unsplash.com/..." value={formData.coverImage} onChange={(e) => setFormData({ ...formData, coverImage: e.target.value })} />
                  {formData.coverImage && <div className="w-12 h-10 bg-zinc-200 rounded overflow-hidden flex-shrink-0"><img src={formData.coverImage} alt="" className="w-full h-full object-cover" /></div>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Content * (Markdown)</label>
                <textarea placeholder="Write your post content here..." value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} rows={12} className="w-full px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y font-mono text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="published" checked={formData.published} onChange={(e) => setFormData({ ...formData, published: e.target.checked })} className="w-4 h-4 text-blue-600 rounded border-zinc-300" />
                <label htmlFor="published" className="text-sm text-zinc-700 dark:text-zinc-300">Publish immediately</label>
              </div>
              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {editingPost ? "Update Post" : "Save Post"}
                </Button>
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>All Posts</CardTitle></CardHeader>
          <CardContent>
            {posts.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="mx-auto text-zinc-400 mb-4" size={48} />
                <p className="text-zinc-500 mb-4">No blog posts yet</p>
                <Button onClick={() => setShowEditor(true)}><Plus size={18} />Create Your First Post</Button>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((post) => (
                  <div key={post.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    {post.coverImage && <div className="w-full sm:w-32 h-24 bg-zinc-200 rounded-lg overflow-hidden flex-shrink-0"><img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" /></div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-foreground">{post.title}</h3>
                          <p className="text-sm text-zinc-500 line-clamp-2">{post.excerpt || post.content.slice(0, 100)}...</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${post.published ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}>
                          {post.published ? "Published" : "Draft"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                          <span>{formatDate(post.createdAt)}</span>
                          <span className="flex items-center gap-1"><Eye size={12} />{post.views} views</span>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => togglePublish(post.id)}>{post.published ? "Unpublish" : "Publish"}</Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(post)}><Edit2 size={16} /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(post.id)} className="text-red-600 hover:text-red-700"><Trash2 size={16} /></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
