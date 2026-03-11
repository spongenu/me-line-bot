package handler

import (
	"log"
	"me-bot/internal/service"
	"net/http"
	"strings"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

type WebhookHandler struct {
	bot *linebot.Client
	svc *service.CheckinService
}

func NewWebhookHandler(bot *linebot.Client, svc *service.CheckinService) *WebhookHandler {
	return &WebhookHandler{bot: bot, svc: svc}
}

func (h *WebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	events, err := h.bot.ParseRequest(r)
	if err != nil {
		log.Println("ParseRequest error:", err)
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	for _, event := range events {
		switch event.Type {

		case linebot.EventTypeMessage:
			switch msg := event.Message.(type) {
			case *linebot.TextMessage:
				if event.Source.Type == linebot.EventSourceTypeUser {
					// DM — รับทุกคำสั่ง
					h.svc.HandleText(event, msg.Text)
				} else if event.Source.Type == linebot.EventSourceTypeGroup {
					// Group — รับแค่ สรุปวันนี้
					if msg.Text == "สรุปวันนี้" || msg.Text == "summary" || strings.HasPrefix(msg.Text, "สรุป ") {
						h.svc.HandleSummaryInGroup(event, msg.Text)
					}
				}
			case *linebot.LocationMessage:
				if event.Source.Type == linebot.EventSourceTypeUser {
					h.svc.HandleLocation(event, msg.Latitude, msg.Longitude)
				}
			}

		case linebot.EventTypeJoin:
			log.Printf("Bot joined group: %s", event.Source.GroupID)
		}
	}

	w.WriteHeader(http.StatusOK)
}
