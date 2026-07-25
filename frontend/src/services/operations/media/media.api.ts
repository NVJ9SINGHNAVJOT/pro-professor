import { BASE_URL_SERVER } from "@/services/client/config";
import { rawFetch } from "@/services/client/rawFetch";

/**
 * Media endpoints. Uploads post raw multipart files through central-server (which records a
 * reference row and returns metadata) — so they bypass the generic {@link fetchApi} helper.
 * The returned {@link MediaAttachment.url} is a <em>direct</em> storage-server URL: `<img>` /
 * `<audio>` / download links point straight at storage, never through central-server.
 */
export interface MediaAttachment {
  id: number;
  /** Direct storage-server URL to stream the file from (`<img src>`, `<audio src>`, downloads). */
  url: string;
  originalFilename: string;
  mimeType: string;
  size: number;
}

/** Upload a single file and return its stored reference. */
async function upload(file: File, signal?: AbortSignal): Promise<MediaAttachment> {
  const form = new FormData();
  form.append("file", file, file.name);

  const res = await rawFetch(
    `${BASE_URL_SERVER}/media/upload`,
    { method: "POST", body: form, signal },
    "Upload failed",
  );

  const json = await res.json().catch(() => null);
  return json.data as MediaAttachment;
}

export const mediaApi = { upload };
