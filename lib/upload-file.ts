/**
 * Uploads a file/blob to storage.
 *
 * Production (BLOB_READ_WRITE_TOKEN present on server):
 *   Uses @vercel/blob client-side upload — the file goes directly from the
 *   browser to Vercel Blob CDN without passing through the Next.js API route.
 *   This bypasses Vercel's 4.5 MB serverless body limit.
 *
 * Local dev (no BLOB_READ_WRITE_TOKEN):
 *   Falls back to a FormData POST to /api/upload which writes to public/uploads/.
 */
export async function uploadFile(
  file: File | Blob,
  projectId: string,
  suggestedName?: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; fileName: string; fileType: string; fileSizeMB: number }> {
  const name =
    suggestedName ||
    (file instanceof File ? file.name : `recording-${Date.now()}.webm`);

  const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));

  if (process.env.NODE_ENV === "production") {
    // Client-side Vercel Blob upload (bypasses serverless body limit)
    const { upload } = await import("@vercel/blob/client");
    const blobFile =
      file instanceof File ? file : new File([file], name, { type: file.type });

    // Add a random suffix to avoid "blob already exists" errors on re-uploads
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
    const uniqueName = `${base}-${Date.now()}${ext}`;

    const blob = await upload(`datasets/${projectId}/${uniqueName}`, blobFile, {
      access: "public",
      handleUploadUrl: "/api/upload",
      onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
    });

    return {
      url: blob.url,
      fileName: name,
      fileType: file.type,
      fileSizeMB,
    };
  }

  // Local dev: FormData POST via XHR so we can track progress
  const formData = new FormData();
  const uploadBlob =
    file instanceof File ? file : new File([file], name, { type: file.type });
  formData.append("file", uploadBlob);
  formData.append("projectId", projectId);

  const data = await new Promise<{ url: string; fileName: string; fileType: string; fileSizeMB: number }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).message || "Upload failed")); }
          catch { reject(new Error("Upload failed")); }
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(formData);
    }
  );

  return {
    url: data.url,
    fileName: data.fileName ?? name,
    fileType: data.fileType ?? file.type,
    fileSizeMB: data.fileSizeMB ?? fileSizeMB,
  };
}
