package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"me-bot/internal/config"
	"me-bot/internal/middleware"
	"me-bot/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB  *gorm.DB
	Cfg *config.Config
}

func NewAuthHandler(db *gorm.DB, cfg *config.Config) *AuthHandler {
	return &AuthHandler{DB: db, Cfg: cfg}
}

// VerifyLiffHandler receives ID Token from frontend LIFF, verifies it with LINE, and returns a JWT
func (h *AuthHandler) VerifyLiffHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var reqBody struct {
		IDToken string `json:"id_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	if reqBody.IDToken == "" {
		http.Error(w, "ID token is required", http.StatusBadRequest)
		return
	}

	// 1. Verify ID Token with LINE API
	lineUserID, err := h.verifyLineIDToken(reqBody.IDToken)
	if err != nil {
		log.Printf("Failed to verify LINE ID token: %v", err)
		http.Error(w, "Invalid ID token", http.StatusUnauthorized)
		return
	}

	// 2. Find user in database and check if they are an Admin
	var user model.User
	if err := h.DB.Preload("UserRoles.Role").Where("line_user_id = ?", lineUserID).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			http.Error(w, "User not found in system", http.StatusForbidden)
			return
		}
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	isAdmin := false
	for _, ur := range user.UserRoles {
		if ur.Role.Name == "admin" {
			isAdmin = true
			break
		}
	}

	if !isAdmin {
		http.Error(w, "Access denied: Admin role required", http.StatusForbidden)
		return
	}

	// 3. Issue our own JWT for the Web Dashboard
	expirationTime := time.Now().Add(24 * time.Hour) // Token valid for 24 hours
	claims := &middleware.Claims{
		UserID:     user.ID,
		LineUserID: user.LineUserID,
		Role:       "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(h.Cfg.JWTSecret))
	if err != nil {
		log.Printf("Failed to sign JWT: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Return token to frontend
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": tokenString,
		"user": map[string]interface{}{
			"id":           user.ID,
			"name":         user.Name,
			"display_name": user.DisplayName,
			"picture_url":  user.PictureURL,
		},
	})
}

// verifyLineIDToken sends a request to LINE OAuth API to verify the ID token
func (h *AuthHandler) verifyLineIDToken(idToken string) (string, error) {
	data := url.Values{}
	data.Set("id_token", idToken)
	data.Set("client_id", h.Cfg.LineLoginClientID)

	req, err := http.NewRequest("POST", "https://api.line.me/oauth2/v2.1/verify", strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("LINE verify API returned %d: %s", resp.StatusCode, string(bodyBytes))
		return "", json.Unmarshal([]byte{}, &struct{}{}) // return a generic error
	}

	var result struct {
		Sub string `json:"sub"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Sub, nil
}
