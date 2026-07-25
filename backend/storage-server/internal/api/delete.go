package api

import (
	"net/http"

	"github.com/navjot/storage-server/helper"
	"github.com/navjot/storage-server/internal/middleware"
	"github.com/navjot/storage-server/internal/storage"
)

func Delete(fs *storage.FileSystem) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if err := fs.Delete(id); err != nil {
			helper.WriteError(w, http.StatusNotFound, "media not found")
			return
		}

		middleware.LoggerFromContext(r.Context()).Info("file deleted", "id", id)

		helper.WriteJSON(w, http.StatusOK, map[string]bool{"deleted": true})
	}
}
