package helper

import (
	"encoding/json"
	"net/http"
)

func write(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func WriteJSON(w http.ResponseWriter, status int, data any) {
	write(w, status, map[string]any{"data": data})
}

type Pagination struct {
	Total   int  `json:"total"`
	Limit   int  `json:"limit"`
	Offset  int  `json:"offset"`
	HasMore bool `json:"hasMore"`
}

func WritePaginatedJSON(w http.ResponseWriter, status int, data any, pagination Pagination) {
	write(w, status, map[string]any{
		"data":       data,
		"pagination": pagination,
	})
}

func WriteError(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]any{
		"error": map[string]string{"message": message},
	})
}
