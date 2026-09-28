package service

import (
	"fmt"
	"log"
	"me-bot/internal/config"
	"me-bot/internal/repository"
	"strings"
	"sync"
	"time"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

const MaxShiftDuration = 18 * time.Hour

type userState struct {
	Step string // "awaiting_name", "awaiting_checkin_location", "awaiting_checkout_location"
}

type CheckinService struct {
	bot         *linebot.Client
	userRepo    *repository.UserRepository
	attRepo     *repository.AttendanceRepository
	cfg         *config.Config
	richMenuSvc *RichMenuService
	states      map[string]*userState
	mu          sync.Mutex
}

func NewCheckinService(
	bot *linebot.Client,
	userRepo *repository.UserRepository,
	attRepo *repository.AttendanceRepository,
	cfg *config.Config,
	richMenuSvc *RichMenuService,
) *CheckinService {
	return &CheckinService{
		bot:         bot,
		userRepo:    userRepo,
		attRepo:     attRepo,
		cfg:         cfg,
		richMenuSvc: richMenuSvc,
		states:      make(map[string]*userState),
	}
}

func bangkokTZ() *time.Location {
	loc, _ := time.LoadLocation("Asia/Bangkok")
	return loc
}

func (s *CheckinService) HandleText(event *linebot.Event, text string) {
	userId := event.Source.UserID

	user, err := s.userRepo.FindByLineID(userId)
	if err == nil && user.IsActive {
		go s.syncProfile(user.ID, userId)
	}

	s.mu.Lock()
	state := s.states[userId]
	s.mu.Unlock()

	if state != nil && state.Step == "awaiting_name" {
		s.handleRegisterName(event, text)
		return
	}

	if text == "ฉันได้ยื่นคำขอลางานเข้าระบบแล้ว" {
		s.bot.ReplyMessage(event.ReplyToken, linebot.NewTextMessage("ระบบได้รับคำขอลางานของคุณแล้วค่ะ แอดมินจะแจ้งผลให้ทราบเร็วๆ นี้")).Do()
		return
	}

	switch text {
	case "ลงทะเบียน", "register", "Register":
		s.handleRegisterStart(event)
	case "เช็คอิน", "check-in", "Check-in", "checkin", "เช็คเอาท์", "check-out", "Check-out", "checkout":
		s.handleAttendanceRequest(event)
	case "ยกเลิก", "cancel":
		s.mu.Lock()
		delete(s.states, userId)
		s.mu.Unlock()
		s.replyText(event.ReplyToken, "↩️ ยกเลิกแล้วครับ")
	case "ลา", "ลางาน", "ขอลา", "leave":
		s.handleLeaveRequest(event)
	case "ประวัติ", "ประวัติการทำงาน", "history", "History":
		s.handleHistoryRequest(event)
	case "สรุปวันนี้", "summary":
		s.handleSummaryToday(event)
	default:
		// เช็คว่าขึ้นต้นด้วย "สรุป " ไหม
		if strings.HasPrefix(text, "สรุป ") {
			dateStr := strings.TrimPrefix(text, "สรุป ")
			s.handleSummaryByDate(event, dateStr)
		} else {
			s.replyMainMenu(event.ReplyToken)
		}
	}
}

func (s *CheckinService) HandleLocation(event *linebot.Event, lat, lng float64) {
	s.handleAttendanceRequest(event)
}

func (s *CheckinService) handleAttendanceRequest(event *linebot.Event) {
	liffUrl := s.cfg.StaffLiffURL
	if liffUrl == "" || liffUrl == "https://liff.line.me/YOUR-LIFF-ID" {
		liffUrl = "https://liff.line.me/YOUR-LIFF-ID"
	}
	checkinUrl := fmt.Sprintf("%s?path=checkin", liffUrl)

	flexMsg := fmt.Sprintf(`{
		"type": "bubble",
		"size": "kilo",
		"header": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "text",
					"text": "ลงเวลาทำงาน",
					"weight": "bold",
					"color": "#ffffff",
					"size": "lg"
				}
			],
			"backgroundColor": "#2563eb",
			"paddingAll": "12px"
		},
		"body": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "text",
					"text": "กดปุ่มด้านล่างเพื่อบันทึกเวลาเข้า-ออกงานผ่านระบบ GPS ครับ",
					"wrap": true,
					"size": "sm",
					"color": "#666666"
				}
			],
			"paddingAll": "16px"
		},
		"footer": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "button",
					"action": {
						"type": "uri",
						"label": "⏱️ บันทึกเวลาเข้า-ออกงาน",
						"uri": "%s"
					},
					"style": "primary",
					"color": "#2563eb"
				}
			],
			"paddingAll": "12px"
		}
	}`, checkinUrl)

	container, err := linebot.UnmarshalFlexMessageJSON([]byte(flexMsg))
	if err != nil {
		s.replyText(event.ReplyToken, "สามารถลงเวลาทำงานได้ที่ลิงก์นี้ครับ:\n"+checkinUrl)
		return
	}

	if _, err := s.bot.ReplyMessage(event.ReplyToken, linebot.NewFlexMessage("ลงเวลาทำงาน", container)).Do(); err != nil {
		s.replyText(event.ReplyToken, "สามารถลงเวลาทำงานได้ที่ลิงก์นี้ครับ:\n"+checkinUrl)
	}
}

func (s *CheckinService) handleLeaveRequest(event *linebot.Event) {
	liffUrl := s.cfg.StaffLiffURL
	if liffUrl == "" || liffUrl == "https://liff.line.me/YOUR-LIFF-ID" {
		liffUrl = "https://liff.line.me/YOUR-LIFF-ID"
	}
	leaveUrl := fmt.Sprintf("%s?path=leave", liffUrl)

	flexMsg := fmt.Sprintf(`{
		"type": "bubble",
		"size": "kilo",
		"header": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "text",
					"text": "ยื่นใบลา",
					"weight": "bold",
					"color": "#ffffff",
					"size": "lg"
				}
			],
			"backgroundColor": "#d97706",
			"paddingAll": "12px"
		},
		"body": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "text",
					"text": "คลิกที่ปุ่มด้านล่างเพื่อตรวจสอบโควตาและยื่นใบลาครับ",
					"wrap": true,
					"size": "sm",
					"color": "#666666"
				}
			],
			"paddingAll": "16px"
		},
		"footer": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "button",
					"action": {
						"type": "uri",
						"label": "📝 กรอกใบลา",
						"uri": "%s"
					},
					"style": "primary",
					"color": "#d97706"
				}
			],
			"paddingAll": "12px"
		}
	}`, leaveUrl)

	container, err := linebot.UnmarshalFlexMessageJSON([]byte(flexMsg))
	if err != nil {
		s.replyText(event.ReplyToken, "สามารถยื่นใบลาได้ที่ลิงก์นี้ครับ:\n"+leaveUrl)
		return
	}

	if _, err := s.bot.ReplyMessage(event.ReplyToken, linebot.NewFlexMessage("ยื่นใบลา", container)).Do(); err != nil {
		s.replyText(event.ReplyToken, "สามารถยื่นใบลาได้ที่ลิงก์นี้ครับ:\n"+leaveUrl)
	}
}

func (s *CheckinService) handleHistoryRequest(event *linebot.Event) {
	liffUrl := s.cfg.StaffLiffURL
	if liffUrl == "" || liffUrl == "https://liff.line.me/YOUR-LIFF-ID" {
		liffUrl = "https://liff.line.me/YOUR-LIFF-ID"
	}
	historyUrl := fmt.Sprintf("%s?path=history", liffUrl)

	flexMsg := fmt.Sprintf(`{
		"type": "bubble",
		"size": "kilo",
		"header": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "text",
					"text": "ประวัติการทำงาน",
					"weight": "bold",
					"color": "#ffffff",
					"size": "lg"
				}
			],
			"backgroundColor": "#059669",
			"paddingAll": "12px"
		},
		"body": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "text",
					"text": "คลิกที่ปุ่มด้านล่างเพื่อดูประวัติเวลาเข้า-ออกงานและสรุปชั่วโมงครับ",
					"wrap": true,
					"size": "sm",
					"color": "#666666"
				}
			],
			"paddingAll": "16px"
		},
		"footer": {
			"type": "box",
			"layout": "vertical",
			"contents": [
				{
					"type": "button",
					"action": {
						"type": "uri",
						"label": "📊 ดูประวัติการทำงาน",
						"uri": "%s"
					},
					"style": "primary",
					"color": "#059669"
				}
			],
			"paddingAll": "12px"
		}
	}`, historyUrl)

	container, err := linebot.UnmarshalFlexMessageJSON([]byte(flexMsg))
	if err != nil {
		s.replyText(event.ReplyToken, "สามารถดูประวัติการทำงานได้ที่ลิงก์นี้ครับ:\n"+historyUrl)
		return
	}

	if _, err := s.bot.ReplyMessage(event.ReplyToken, linebot.NewFlexMessage("ประวัติการทำงาน", container)).Do(); err != nil {
		s.replyText(event.ReplyToken, "สามารถดูประวัติการทำงานได้ที่ลิงก์นี้ครับ:\n"+historyUrl)
	}
}

func (s *CheckinService) replyText(replyToken, text string) {
	if _, err := s.bot.ReplyMessage(replyToken, linebot.NewTextMessage(text)).Do(); err != nil {
		log.Println("replyText error:", err)
	}
}

func (s *CheckinService) pushToGroup(groupID, text string) {
	if !s.userRepo.IsGroupNotifyEnabled() {
		return
	}
	if _, err := s.bot.PushMessage(groupID, linebot.NewTextMessage(text)).Do(); err != nil {
		log.Println("pushToGroup error:", err)
	}
}

func (s *CheckinService) replyMainMenu(replyToken string) {
	s.bot.ReplyMessage(replyToken,
		linebot.NewTextMessage("🏪 ME Bot\n\nพิมพ์คำสั่ง:\n• ลงทะเบียน\n• เช็คอิน\n• เช็คเอาท์\n• ลางาน\n• ประวัติ\n• ยกเลิก"),
	).Do()
}
