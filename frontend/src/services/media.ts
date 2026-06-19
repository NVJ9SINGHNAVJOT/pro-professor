import { BASE_URL_SERVER } from "@/services/apis";

/**
 * Media endpoints. Like {@link "@/services/audio"}, these bypass the generic
 * {@link fetchApi} helper because uploads post raw multipart files. They hit the
 * central-server pass-through, never the storage-service directly.
 */
export interface MediaAttachment {
  id: number;
  originalFilename: string;
  mimeType: string;
  size: number;
}

/** Absolute URL central-server streams a stored file from (for `<img src>` / downloads). */
export function mediaFileUrl(id: number): string {
  return `${BASE_URL_SERVER}/media/${id}/file`;
}

/** Upload a single file and return its stored reference. */
export async function uploadMedia(file: File, signal?: AbortSignal): Promise<MediaAttachment> {
  const form = new FormData();
  form.append("file", file, file.name);

  const res = await fetch(`${BASE_URL_SERVER}/media/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
    signal,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.message ?? `Upload failed (${res.status})`);
  }
  return json.data as MediaAttachment;
}
