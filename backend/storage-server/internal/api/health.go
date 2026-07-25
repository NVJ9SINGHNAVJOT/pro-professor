package api

import (
	"net/http"

	"github.com/navjot/storage-server/helper"
)

func Health(w http.ResponseWriter, r *http.Request) {
	helper.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
