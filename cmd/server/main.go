package main

import (
	"log"
	"me-bot/internal/config"
	"me-bot/internal/database"
	"me-bot/internal/handler"
	"me-bot/internal/middleware"
	"me-bot/internal/repository"
	"me-bot/internal/service"
	"net/http"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

func main() {
	cfg := config.Load()
	db := database.Connect(cfg)

	bot, err := linebot.New(cfg.LineChannelSecret, cfg.LineAccessToken)
	if err != nil {
		log.Fatal("LINE bot init error:", err)
	}

	// Repositories
	userRepo := repository.NewUserRepository(db)
	attRepo := repository.NewAttendanceRepository(db)

	// Rich Menu
	richMenuSvc := service.NewRichMenuService(cfg.LineAccessToken)
	if err := richMenuSvc.Setup(
		"assets/richmenu/menu_a.png",
		"assets/richmenu/menu_b.png",
		"assets/richmenu/menu_c.png",
	); err != nil {
		log.Println("⚠️ Rich Menu setup error:", err)
	} else {
		log.Println("✅ Rich Menu setup complete")

		go richMenuSvc.AssignMenuToExistingUsers(userRepo)
	}

	// Services
	checkinSvc := service.NewCheckinService(bot, userRepo, attRepo, cfg, richMenuSvc)

	// Handlers
	webhookHandler := handler.NewWebhookHandler(bot, checkinSvc)
	authHandler := handler.NewAuthHandler(db, cfg)
	adminHandler := handler.NewAdminHandler(db, cfg, bot)

	mux := http.NewServeMux()
	mux.HandleFunc("/webhook", webhookHandler.Handle)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"ME Bot"}`))
	})

	// Auth API
	mux.HandleFunc("/api/auth/verify-liff", authHandler.VerifyLiffHandler)

	// Admin API (Protected by JWT)
	requireAdmin := middleware.RequireAdmin(cfg.JWTSecret)
	mux.Handle("/api/admin/users", requireAdmin(http.HandlerFunc(adminHandler.GetUsersHandler)))
	mux.Handle("/api/admin/users/role", requireAdmin(http.HandlerFunc(adminHandler.UpdateUserRoleHandler)))
	mux.Handle("/api/admin/attendances", requireAdmin(http.HandlerFunc(adminHandler.GetAttendancesHandler)))
	mux.Handle("/api/admin/attendances/update", requireAdmin(http.HandlerFunc(adminHandler.UpdateAttendanceHandler)))
	mux.Handle("/api/admin/leave-requests", requireAdmin(http.HandlerFunc(adminHandler.GetLeaveRequestsHandler)))
	mux.Handle("/api/admin/leave-requests/status", requireAdmin(http.HandlerFunc(adminHandler.UpdateLeaveStatusHandler)))
	mux.Handle("/api/admin/schedules", requireAdmin(http.HandlerFunc(adminHandler.GetUserScheduleHandler)))
	mux.Handle("/api/admin/schedules/update", requireAdmin(http.HandlerFunc(adminHandler.UpdateUserScheduleHandler)))
	mux.Handle("/api/admin/system", requireAdmin(http.HandlerFunc(adminHandler.GetSystemSettingsHandler)))
	mux.Handle("/api/admin/system/toggle", requireAdmin(http.HandlerFunc(adminHandler.ToggleSystemHandler)))

	// Apply CORS
	handlerWithCORS := middleware.CORS(mux)

	log.Printf("🚀 ME Bot starting on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, handlerWithCORS); err != nil {
		log.Fatal("Server error:", err)
	}
}
