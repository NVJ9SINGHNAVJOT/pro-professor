import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/**
 * Media endpoints. Like {@link "@/services/operations/audio/audio"}, these bypass the generic
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

  const res = await rawFetch(`${BASE_URL_SERVER}/media/upload`, { method: "POST", body: form, signal }, "Upload failed");

  const json = await res.json().catch(() => null);
  return json.data as MediaAttachment;
}
