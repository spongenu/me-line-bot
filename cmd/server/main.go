package main

import (
	"log"
	"me-bot/internal/config"
	"me-bot/internal/database"
	"me-bot/internal/handler"
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

	http.HandleFunc("/webhook", webhookHandler.Handle)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"ME Bot"}`))
	})

	log.Printf("🚀 ME Bot starting on port %s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, nil); err != nil {
		log.Fatal("Server error:", err)
	}
}
