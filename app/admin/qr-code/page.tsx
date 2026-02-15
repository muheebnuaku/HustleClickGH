"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Download, ExternalLink, Link2, QrCode, RefreshCw, Share2 } from "lucide-react";

interface QRConfig {
  content: string;
  size: number;
  fgColor: string;
  bgColor: string;
  format: "svg" | "png";
}

export default function AdminQRCodePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const qrRef = useRef<HTMLDivElement>(null);
  
  const [config, setConfig] = useState<QRConfig>({
    content: "",
    size: 256,
    fgColor: "#000000",
    bgColor: "#ffffff",
    format: "svg",
  });
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [presetLinks, setPresetLinks] = useState({
    website: typeof window !== "undefined" ? window.location.origin : "https://hustleclickgh.com",
    register: typeof window !== "undefined" ? `${window.location.origin}/register` : "https://hustleclickgh.com/register",
    custom: "",
  });
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.push("/dashboard");
    }
  }, [status, router, session]);

  // Generate QR code using a free API
  const generateQR = (content: string) => {
    if (!content.trim()) {
      setQrCodeUrl("");
      return;
    }
    // Using Google Charts API for QR code generation
    const encoded = encodeURIComponent(content);
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${config.size}x${config.size}&data=${encoded}&color=${config.fgColor.replace("#", "")}&bgcolor=${config.bgColor.replace("#", "")}&format=${config.format}`;
    setQrCodeUrl(url);
    setConfig({ ...config, content });
  };

  const downloadQR = async () => {
    if (!qrCodeUrl) return;
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-code-${Date.now()}.${config.format}`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: "success", text: "QR Code downloaded!" });
    } catch {
      setMessage({ type: "error", text: "Failed to download QR code" });
    }
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareQR = async () => {
    if (!qrCodeUrl || !navigator.share) return;
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const file = new File([blob], "qr-code.png", { type: blob.type });
      await navigator.share({
        files: [file],
        title: "HustleClickGH QR Code",
        text: `Scan this QR code to visit: ${config.content}`,
      });
    } catch {
      // Fallback to copying link
      copyLink(config.content);
      setMessage({ type: "success", text: "Link copied to clipboard!" });
    }
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (status === "loading") {
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
        <div>
          <h1 className="text-3xl font-bold text-foreground">QR Code Generator</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">Generate QR codes for links and promotions</p>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration */}
          <div className="space-y-6">
            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 size={20} />
                  Quick Links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => generateQR(presetLinks.website)}>
                    <ExternalLink size={16} />
                    Website
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => generateQR(presetLinks.register)}>
                    <ExternalLink size={16} />
                    Registration
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Custom URL */}
            <Card>
              <CardHeader>
                <CardTitle>Custom URL</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Enter URL or Text
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com or any text..."
                      value={presetLinks.custom}
                      onChange={(e) => setPresetLinks({ ...presetLinks, custom: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && generateQR(presetLinks.custom)}
                    />
                    <Button onClick={() => generateQR(presetLinks.custom)}>
                      <RefreshCw size={16} />
                      Generate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Style Options */}
            <Card>
              <CardHeader>
                <CardTitle>Style Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Size (px)
                    </label>
                    <Input
                      type="number"
                      min={100}
                      max={1000}
                      value={config.size}
                      onChange={(e) => {
                        const newSize = Number(e.target.value);
                        setConfig({ ...config, size: newSize });
                        if (config.content) generateQR(config.content);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Format
                    </label>
                    <select
                      value={config.format}
                      onChange={(e) => {
                        setConfig({ ...config, format: e.target.value as "svg" | "png" });
                        if (config.content) setTimeout(() => generateQR(config.content), 100);
                      }}
                      className="w-full px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                    >
                      <option value="svg">SVG</option>
                      <option value="png">PNG</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Foreground Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={config.fgColor}
                        onChange={(e) => {
                          setConfig({ ...config, fgColor: e.target.value });
                          if (config.content) setTimeout(() => generateQR(config.content), 100);
                        }}
                        className="w-12 h-10 rounded border border-zinc-300 cursor-pointer"
                      />
                      <Input value={config.fgColor} onChange={(e) => setConfig({ ...config, fgColor: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                      Background Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={config.bgColor}
                        onChange={(e) => {
                          setConfig({ ...config, bgColor: e.target.value });
                          if (config.content) setTimeout(() => generateQR(config.content), 100);
                        }}
                        className="w-12 h-10 rounded border border-zinc-300 cursor-pointer"
                      />
                      <Input value={config.bgColor} onChange={(e) => setConfig({ ...config, bgColor: e.target.value })} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode size={20} />
                QR Code Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div ref={qrRef} className="flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-900 rounded-xl min-h-[300px]">
                {qrCodeUrl ? (
                  <>
                    <img src={qrCodeUrl} alt="QR Code" className="max-w-full" style={{ width: Math.min(config.size, 300), height: Math.min(config.size, 300) }} />
                    <p className="mt-4 text-sm text-zinc-500 text-center break-all max-w-full px-4">
                      {config.content}
                    </p>
                  </>
                ) : (
                  <div className="text-center">
                    <QrCode className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" size={64} />
                    <p className="text-zinc-500">Enter a URL or text to generate QR code</p>
                  </div>
                )}
              </div>

              {qrCodeUrl && (
                <div className="flex flex-wrap gap-2 mt-6 justify-center">
                  <Button onClick={downloadQR}>
                    <Download size={16} />
                    Download
                  </Button>
                  <Button variant="outline" onClick={() => copyLink(config.content)}>
                    <Copy size={16} />
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                  <Button variant="outline" onClick={shareQR}>
                    <Share2 size={16} />
                    Share
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
