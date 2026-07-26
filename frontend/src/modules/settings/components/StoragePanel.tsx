import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { DownloadIcon, FileIcon, FileTextIcon, LockIcon, MusicIcon, Trash2Icon } from "lucide-react";
import { toast } from "@/components/common/toast";
import Tooltip from "@/components/common/Tooltip";
import { SelectInput } from "@/components/inputs/SelectInput";
import { useApi } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import {
  mediaRoute,
  type ListMediaParams,
  type MediaCategory,
  type MediaFile,
  type MediaPagination,
  type MediaUsage,
} from "@/services/operations/media/media.route";
import { formatBytes } from "@/modules/settings/utils";
import { CATEGORY_FILTERS, STORAGE_PAGE_SIZE, asCategoryFilter } from "@/modules/settings/constants";

const SORT_OPTIONS = [
  { label: "Newest first", value: "created_at:desc" },
  { label: "Oldest first", value: "created_at:asc" },
  { label: "Largest first", value: "size:desc" },
  { label: "Smallest first", value: "size:asc" },
];

/** Category icon for files with no visual preview. */
const iconFor = (category: MediaCategory) => {
  if (category === "audio") return MusicIcon;
  if (category === "documents") return FileTextIcon;
  return FileIcon;
};

/** "2 notes · 1 chat" — the same references the server's delete guard refuses on. */
const usageLabel = ({ notes, chatMessages }: MediaUsage) =>
  [
    notes > 0 && `${notes} note${notes === 1 ? "" : "s"}`,
    chatMessages > 0 && `${chatMessages} chat${chatMessages === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Browses everything stored in the storage-server. The listing is filesystem-backed (proxied
 * through central-server, which is also where the delete guard lives), while previews and
 * downloads hit the storage-server directly via each file's `url`.
 *
 * The first page arrives from the route loader; the filter/sort chips write search params, which
 * re-run it. Only "Load more" fetches from here.
 */
const StoragePanel = ({
  initialMedia,
  initialPagination,
}: {
  initialMedia: MediaFile[];
  initialPagination: MediaPagination;
}) => {
  const { execute: listMedia, loading } = useApi(mediaRoute.listMedia);
  const { execute: deleteMedia } = useApi(mediaRoute.deleteMedia);
  const [searchParams, setSearchParams] = useSearchParams();

  const sortByParam = searchParams.get("sortBy");
  const orderParam = searchParams.get("order");

  const category = asCategoryFilter(searchParams.get("category"));
  const sortValue = sortByParam && orderParam ? `${sortByParam}:${orderParam}` : SORT_OPTIONS[0].value;
  const sort = SORT_OPTIONS.some((o) => o.value === sortValue) ? sortValue : SORT_OPTIONS[0].value;

  const [files, setFiles] = useState<MediaFile[]>(initialMedia);
  const [pagination, setPagination] = useState<MediaPagination | null>(initialPagination);

  // A filter/sort change is a navigation: the loader hands over a fresh first page, which replaces
  // whatever "Load more" had accumulated.
  useEffect(() => {
    setFiles(initialMedia);
    setPagination(initialPagination);
  }, [initialMedia, initialPagination]);

  // the card whose trash button was clicked once — a second click confirms
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadMore = async () => {
    const offset = files.length;
    const [sortBy, order] = sort.split(":") as [ListMediaParams["sortBy"], ListMediaParams["order"]];
    const res = await listMedia({
      category: category === "all" ? undefined : category,
      sortBy,
      order,
      limit: STORAGE_PAGE_SIZE,
      offset,
    });
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    const { media, pagination: page } = res.response.data;
    setFiles((prev) => [...prev, ...media]);
    setPagination(page);
  };

  const setParam = (updates: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    setSearchParams(newParams, { replace: true });
  };

  const handleDelete = async (file: MediaFile) => {
    if (confirmingId !== file.storageId) {
      setConfirmingId(file.storageId);
      return;
    }
    setDeletingId(file.storageId);
    const res = await deleteMedia(file.storageId);
    setDeletingId(null);
    setConfirmingId(null);
    if (res.error) {
      // 409 when the file is still attached to a chat message — show the server's wording
      toast.error(res.error.message);
      return;
    }
    setFiles((prev) => prev.filter((f) => f.storageId !== file.storageId));
    setPagination((prev) => (prev ? { ...prev, total: prev.total - 1 } : prev));
    toast.success("File deleted");
  };

  return (
    <>
      <div className="sticky top-0 z-10 -mx-6 -mt-6 bg-grey px-6 pb-6 pt-6">
        <header className="mb-6">
          <h1 className="heading-semibold text-white">Storage</h1>
          <p className="mt-1.5 para-small-regular text-neutral-400">
            Every file uploaded through chat and notes. Deleting one removes it from disk for good.
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORY_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setConfirmingId(null);
                setParam({ category: option === "all" ? null : option });
              }}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-1.5 para-small-medium capitalize text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white",
                category === option && "bg-neutral-800 text-white",
              )}
            >
              {option === "all" ? "All files" : option}
            </button>
          ))}
        </div>

        <SelectInput
          options={SORT_OPTIONS}
          value={sort}
          onChange={(value) => {
            setConfirmingId(null);
            const isDefault = value === SORT_OPTIONS[0].value;
            const [sortBy, order] = value.split(":");
            setParam({
              sortBy: isDefault ? null : sortBy,
              order: isDefault ? null : order,
            });
          }}
          className="w-44"
          buttonClassName="h-9 rounded-lg"
        />
      </div>
      </div>

      {files.length === 0 ? (
        <p className="para-small-regular text-neutral-500">{loading ? "Loading files…" : "No files stored yet."}</p>
      ) : (
        <>
          <p className="mb-3 caption-regular text-neutral-500">
            Showing {files.length} of {pagination?.total ?? files.length}
          </p>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {files.map((file) => {
              const Icon = iconFor(file.category);
              const confirming = confirmingId === file.storageId;
              const inUse = file.usage.notes > 0 || file.usage.chatMessages > 0;
              return (
                <div
                  key={file.storageId}
                  className="flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-grey-50"
                >
                  <div className="flex h-32 items-center justify-center overflow-hidden bg-black">
                    {file.mimeType.startsWith("image/") ? (
                      <img src={file.url} alt={file.originalFilename} className="size-full object-cover" />
                    ) : file.mimeType.startsWith("video/") ? (
                      <video src={file.url} muted preload="metadata" className="size-full object-cover" />
                    ) : (
                      <Icon className="size-10 text-neutral-600" />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-y-1 p-3">
                    <span className="truncate para-small-medium text-white" title={file.originalFilename}>
                      {file.originalFilename}
                    </span>
                    <span className="caption-regular text-neutral-500">
                      {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
                    </span>
                    {inUse && (
                      <span className="mt-0.5 w-fit rounded-md bg-neutral-800 px-1.5 py-0.5 caption-small-medium text-neutral-400">
                        In use · {usageLabel(file.usage)}
                      </span>
                    )}

                    <div className="mt-2 flex items-center justify-between">
                      <a
                        href={file.url}
                        download={file.originalFilename}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-x-1.5 rounded-lg px-2 py-1 caption-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
                      >
                        <DownloadIcon className="size-4" />
                        Download
                      </a>
                      {inUse ? (
                        <Tooltip
                          content={`Referenced by ${usageLabel(file.usage)}. Remove the reference there before deleting.`}
                        >
                          <span
                            aria-label="In use — can't be deleted"
                            className="flex cursor-not-allowed items-center rounded-lg px-2 py-1 text-neutral-600"
                          >
                            <LockIcon className="size-4" />
                          </span>
                        </Tooltip>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(file)}
                          onBlur={() => confirming && setConfirmingId(null)}
                          disabled={deletingId === file.storageId}
                          aria-label={confirming ? "Confirm delete" : "Delete file"}
                          className={cn(
                            "flex cursor-pointer items-center gap-x-1.5 rounded-lg px-2 py-1 caption-medium text-neutral-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60",
                            confirming && "text-red-400",
                          )}
                        >
                          <Trash2Icon className="size-4" />
                          {confirming ? "Confirm?" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {pagination?.hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => loadMore()}
                disabled={loading}
                className="cursor-pointer rounded-lg border border-neutral-800 px-4 py-2 para-small-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default StoragePanel;
