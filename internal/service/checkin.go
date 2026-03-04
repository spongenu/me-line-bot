package service

import (
	"fmt"
	"log"
	"me-bot/internal/config"
	"me-bot/internal/repository"
	"sync"
	"time"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

type userState struct {
	Step string // "awaiting_name", "awaiting_checkin_location", "awaiting_checkout_location"
}

type CheckinService struct {
	bot      *linebot.Client
	userRepo *repository.UserRepository
	attRepo  *repository.AttendanceRepository
	cfg      *config.Config
	states   map[string]*userState
	mu       sync.Mutex
}

func NewCheckinService(
	bot *linebot.Client,
	userRepo *repository.UserRepository,
	attRepo *repository.AttendanceRepository,
	cfg *config.Config,
) *CheckinService {
	return &CheckinService{
		bot:      bot,
		userRepo: userRepo,
		attRepo:  attRepo,
		cfg:      cfg,
		states:   make(map[string]*userState),
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

	switch text {
	case "ลงทะเบียน", "register", "Register":
		s.handleRegisterStart(event)
	case "เช็คอิน", "check-in", "Check-in", "checkin":
		s.mu.Lock()
		delete(s.states, userId)
		s.mu.Unlock()
		s.handleCheckinRequest(event)
	case "เช็คเอาท์", "check-out", "Check-out", "checkout":
		s.mu.Lock()
		delete(s.states, userId)
		s.mu.Unlock()
		s.handleCheckoutRequest(event)
	case "ยกเลิก", "cancel":
		s.mu.Lock()
		delete(s.states, userId)
		s.mu.Unlock()
		s.replyText(event.ReplyToken, "↩️ ยกเลิกแล้วครับ")
	case "สรุปวันนี้", "summary":
		s.handleSummaryToday(event)
	default:
		s.replyMainMenu(event.ReplyToken)
	}
}

func (s *CheckinService) HandleLocation(event *linebot.Event, lat, lng float64) {
	userId := event.Source.UserID

	s.mu.Lock()
	state := s.states[userId]
	s.mu.Unlock()

	if state == nil ||
		(state.Step != "awaiting_checkin_location" &&
			state.Step != "awaiting_checkout_location") {
		s.replyText(event.ReplyToken, "❌ กรุณาพิมพ์ 'เช็คอิน' หรือ 'เช็คเอาท์' ก่อนแชร์ตำแหน่งครับ")
		return
	}

	isCheckIn := state.Step == "awaiting_checkin_location"

	s.mu.Lock()
	delete(s.states, userId)
	s.mu.Unlock()

	now := time.Now().In(bangkokTZ())
	today := now.Format("2006-01-02")
	timeStr := now.Format("15:04")

	user, err := s.userRepo.FindByLineID(userId)
	if err != nil || !user.IsActive {
		s.replyText(event.ReplyToken, "❌ ยังไม่ได้รับการอนุมัติจาก admin")
		return
	}

	shop, err := s.userRepo.GetStaffShop(user.ID)
	if err != nil {
		s.replyText(event.ReplyToken, "❌ ไม่พบข้อมูลร้าน กรุณาติดต่อ admin")
		return
	}

	dist := Haversine(lat, lng, shop.Lat, shop.Lng)
	if dist > float64(shop.RadiusM) {
		s.replyText(event.ReplyToken,
			fmt.Sprintf("❌ ตำแหน่งของคุณอยู่ห่างจากร้าน %.0f เมตร\n(อนุญาตสูงสุด %d เมตร)", dist, shop.RadiusM))
		return
	}

	if isCheckIn {
		att, _ := s.attRepo.FindTodayByUser(user.ID, today)
		if att != nil {
			s.replyText(event.ReplyToken, "ℹ️ คุณได้เช็คอินแล้ววันนี้")
			return
		}
		if err := s.attRepo.CreateCheckIn(user.ID, shop.ID, lat, lng, now); err != nil {
			log.Println("CreateCheckIn error:", err)
			s.replyText(event.ReplyToken, "❌ เกิดข้อผิดพลาด กรุณาลองใหม่")
			return
		}
		s.replyText(event.ReplyToken, fmt.Sprintf("✅ เช็คอินสำเร็จ!\n🕐 เวลา: %s น.", timeStr))
		s.pushToGroup(shop.LineGroupID,
			fmt.Sprintf("✅ เช็คอิน\n👤 %s\n🕐 เวลา: %s น.\n🏪 %s", user.DisplayName, timeStr, shop.Name))
	} else {
		att, _ := s.attRepo.FindTodayByUser(user.ID, today)
		if att == nil {
			s.replyText(event.ReplyToken, "❌ คุณยังไม่ได้เช็คอินวันนี้")
			return
		}
		if att.CheckOutTime != nil {
			s.replyText(event.ReplyToken, "ℹ️ คุณได้เช็คเอาท์แล้ววันนี้")
			return
		}
		durationMin := int(now.Sub(*att.CheckInTime).Minutes())
		hours := durationMin / 60
		mins := durationMin % 60
		checkInStr := att.CheckInTime.In(bangkokTZ()).Format("15:04")

		if err := s.attRepo.UpdateCheckOut(att.ID, lat, lng, now, durationMin); err != nil {
			log.Println("UpdateCheckOut error:", err)
			s.replyText(event.ReplyToken, "❌ เกิดข้อผิดพลาด กรุณาลองใหม่")
			return
		}
		s.replyText(event.ReplyToken,
			fmt.Sprintf("✅ เช็คเอาท์สำเร็จ!\n🕔 เวลาออก: %s น.\n⏱ ทำงานรวม: %d ชม. %d นาที", timeStr, hours, mins))
		s.pushToGroup(shop.LineGroupID,
			fmt.Sprintf("🔴 เช็คเอาท์\n👤 %s\n🕗 เข้างาน: %s น.\n🕔 ออกงาน: %s น.\n⏱ รวม: %d ชม. %d นาที\n🏪 %s",
				user.DisplayName, checkInStr, timeStr, hours, mins, shop.Name))
	}
}

func (s *CheckinService) handleCheckinRequest(event *linebot.Event) {
	userId := event.Source.UserID
	user, err := s.userRepo.FindByLineID(userId)
	if err != nil || !user.IsActive {
		s.replyText(event.ReplyToken, "❌ ยังไม่ได้รับการอนุมัติจาก admin")
		return
	}
	if !s.userRepo.HasRole(user.ID, "staff") {
		s.replyText(event.ReplyToken, "❌ คุณไม่มีสิทธิ์เช็คอิน กรุณาติดต่อ admin")
		return
	}

	today := time.Now().In(bangkokTZ()).Format("2006-01-02")
	att, _ := s.attRepo.FindTodayByUser(user.ID, today)
	if att != nil {
		s.replyText(event.ReplyToken, "ℹ️ คุณได้เช็คอินแล้ววันนี้")
		return
	}

	s.mu.Lock()
	s.states[userId] = &userState{Step: "awaiting_checkin_location"}
	s.mu.Unlock()

	s.replyText(event.ReplyToken, "📍 กด + แล้วเลือก 'ตำแหน่ง' เพื่อแชร์พิกัดสำหรับเช็คอินครับ")
}

func (s *CheckinService) handleCheckoutRequest(event *linebot.Event) {
	userId := event.Source.UserID
	user, err := s.userRepo.FindByLineID(userId)
	if err != nil || !user.IsActive {
		s.replyText(event.ReplyToken, "❌ ยังไม่ได้รับการอนุมัติจาก admin")
		return
	}
	if !s.userRepo.HasRole(user.ID, "staff") {
		s.replyText(event.ReplyToken, "❌ คุณไม่มีสิทธิ์เช็คเอาท์ กรุณาติดต่อ admin")
		return
	}

	today := time.Now().In(bangkokTZ()).Format("2006-01-02")
	att, _ := s.attRepo.FindTodayByUser(user.ID, today)
	if att == nil {
		s.replyText(event.ReplyToken, "❌ คุณยังไม่ได้เช็คอินวันนี้")
		return
	}
	if att.CheckOutTime != nil {
		s.replyText(event.ReplyToken, "ℹ️ คุณได้เช็คเอาท์แล้ววันนี้")
		return
	}

	s.mu.Lock()
	s.states[userId] = &userState{Step: "awaiting_checkout_location"}
	s.mu.Unlock()

	s.replyText(event.ReplyToken, "📍 กด + แล้วเลือก 'ตำแหน่ง' เพื่อแชร์พิกัดสำหรับเช็คเอาท์ครับ")
}

func (s *CheckinService) replyText(replyToken, text string) {
	if _, err := s.bot.ReplyMessage(replyToken, linebot.NewTextMessage(text)).Do(); err != nil {
		log.Println("replyText error:", err)
	}
}

func (s *CheckinService) pushToGroup(groupID, text string) {
	if _, err := s.bot.PushMessage(groupID, linebot.NewTextMessage(text)).Do(); err != nil {
		log.Println("pushToGroup error:", err)
	}
}

func (s *CheckinService) replyMainMenu(replyToken string) {
	s.bot.ReplyMessage(replyToken,
		linebot.NewTextMessage("🏪 ME Bot\n\nพิมพ์คำสั่ง:\n• ลงทะเบียน\n• เช็คอิน\n• เช็คเอาท์\n• ยกเลิก"),
	).Do()
}
