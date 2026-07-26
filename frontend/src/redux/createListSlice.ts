import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * A sidebar list (the note explorer, the chat history, the diagram list).
 *
 * These three lists are the one bit of page data that does **not** live in route loader data: a
 * mutation has to be able to patch a single row, and React Router has no way to write back into a
 * loader's result. The route loader still does the fetching — it seeds the slice with `setItems`
 * (the `rootLoader` → `setModels` pattern) — and every create/save/delete afterwards patches the
 * row locally from the response it already has, so nothing refetches the whole list.
 *
 * The reducers return fresh state rather than mutating the draft: with a generic row type, Immer's
 * `WritableDraft<T>` doesn't accept a plain `T` back.
 */
export function createListSlice<T extends { id: number }>(name: string) {
  return createSlice({
    name,
    initialState: { items: [] as T[] },
    reducers: {
      /** Replaces the list — the route loader's seed on entering the section. */
      setItems: (_state, action: PayloadAction<T[]>) => ({ items: action.payload }),

      /**
       * Adds or updates one row and moves it to the front. The server orders all three lists by
       * `updated_at DESC` and a DB trigger stamps that column on every write, so the row just
       * touched belongs at the top — this reproduces what a refetch would have returned.
       *
       * The payload is merged onto the existing row, so a caller holding only part of one (a chat
       * turn knows the id and title, not the model) can still patch it.
       */
      upsertItem: (state, action: PayloadAction<Partial<T> & { id: number }>) => {
        const items = state.items as T[];
        const current = items.find((item) => item.id === action.payload.id);
        return {
          items: [
            { ...current, ...action.payload } as T,
            ...items.filter((item) => item.id !== action.payload.id),
          ],
        };
      },

      removeItem: (state, action: PayloadAction<number>) => ({
        items: (state.items as T[]).filter((item) => item.id !== action.payload),
      }),
    },
  });
}
