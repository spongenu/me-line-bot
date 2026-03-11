package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

// parseThaiDate แปลง "11/03/2026" หรือ "11/03/26" → "2026-03-11"
func parseThaiDate(input string) (string, error) {
	input = strings.TrimSpace(input)
	formats := []string{
		"02/01/2006",
		"02/1/2006",
		"2/01/2006",
		"2/1/2006",
		"02/01/06",
		"2/1/06",
	}
	for _, f := range formats {
		t, err := time.ParseInLocation(f, input, bangkokTZ())
		if err == nil {
			return t.Format("2006-01-02"), nil
		}
	}
	return "", fmt.Errorf("invalid date format")
}

// handleSummaryToday สรุปการทำงานวันนี้ (admin เท่านั้น)
func (s *CheckinService) handleSummaryToday(event *linebot.Event) {
	userId := event.Source.UserID

	user, err := s.userRepo.FindByLineID(userId)
	if err != nil || !user.IsActive {
		s.replyText(event.ReplyToken, "❌ ไม่พบข้อมูลผู้ใช้")
		return
	}

	if !s.userRepo.HasRole(user.ID, "admin") {
		s.replyText(event.ReplyToken, "❌ คำสั่งนี้สำหรับ admin เท่านั้น")
		return
	}

	today := time.Now().In(bangkokTZ()).Format("2006-01-02")
	thaiDate := time.Now().In(bangkokTZ()).Format("02/01/2006")
	s.buildSummaryMessage(event.ReplyToken, today, thaiDate)
}

// HandleSummaryInGroup สรุปวันนี้จาก group (reply กลับใน group)
func (s *CheckinService) HandleSummaryInGroup(event *linebot.Event, msg string) {
	userId := event.Source.UserID

	// เช็คว่าเป็น admin
	user, err := s.userRepo.FindByLineID(userId)
	if err != nil || !user.IsActive {
		s.replyText(event.ReplyToken, "❌ ไม่พบข้อมูลผู้ใช้")
		return
	}
	if !s.userRepo.HasRole(user.ID, "admin") {
		s.replyText(event.ReplyToken, "❌ คำสั่งนี้สำหรับ admin เท่านั้น")
		return
	}

	// เช็คว่าขึ้นต้นด้วย "สรุป " ไหม
	if strings.HasPrefix(msg, "สรุป ") {
		dateStr := strings.TrimPrefix(msg, "สรุป ")
		s.handleSummaryByDate(event, dateStr)
	} else {
		today := time.Now().In(bangkokTZ()).Format("2006-01-02")
		thaiDate := time.Now().In(bangkokTZ()).Format("02/01/2006")
		s.buildSummaryMessage(event.ReplyToken, today, thaiDate)
	}
}

// handleSummaryByDate สรุปตามวันที่ระบุ
func (s *CheckinService) handleSummaryByDate(event *linebot.Event, dateStr string) {
	userId := event.Source.UserID

	user, err := s.userRepo.FindByLineID(userId)
	if err != nil || !user.IsActive {
		s.replyText(event.ReplyToken, "❌ ไม่พบข้อมูลผู้ใช้")
		return
	}
	if !s.userRepo.HasRole(user.ID, "admin") {
		s.replyText(event.ReplyToken, "❌ คำสั่งนี้สำหรับ admin เท่านั้น")
		return
	}

	date, err := parseThaiDate(dateStr)
	if err != nil {
		s.replyText(event.ReplyToken, "❌ รูปแบบวันที่ไม่ถูกต้อง\nตัวอย่าง: สรุป 11/03/2026")
		return
	}

	// แปลงกลับเป็น dd/mm/yyyy สำหรับแสดงผล
	t, _ := time.ParseInLocation("2006-01-02", date, bangkokTZ())
	thaiDate := t.Format("02/01/2006")

	s.buildSummaryMessage(event.ReplyToken, date, thaiDate)
}

func (s *CheckinService) buildSummaryMessage(replyToken, date, displayDate string) {
	records, err := s.attRepo.SummaryByDate(date)
	if err != nil || len(records) == 0 {
		s.replyText(replyToken, fmt.Sprintf("📊 ไม่มีข้อมูลการทำงานวันที่ %s", displayDate))
		return
	}

	msg := fmt.Sprintf("📊 สรุปการทำงานวันที่ %s\n", displayDate)
	msg += fmt.Sprintf("🏪 %s\n\n", records[0].Shop.Name)

	for _, att := range records {
		checkInStr := "-"
		checkOutStr := "-"
		durationStr := "-"

		if att.CheckInTime != nil {
			checkInStr = att.CheckInTime.In(bangkokTZ()).Format("15:04")
		}
		if att.CheckOutTime != nil {
			checkOutStr = att.CheckOutTime.In(bangkokTZ()).Format("15:04")
			checkInDate := att.CheckInTime.In(bangkokTZ()).Format("2006-01-02")
			checkOutDate := att.CheckOutTime.In(bangkokTZ()).Format("2006-01-02")
			if checkOutDate != checkInDate {
				checkOutStr += " (+1)"
			}
			hours := att.WorkDurationMin / 60
			mins := att.WorkDurationMin % 60
			durationStr = fmt.Sprintf("%dชม. %dนาที", hours, mins)
		}

		msg += fmt.Sprintf("👤 %s\n", att.User.DisplayName)
		msg += fmt.Sprintf("   🕗 เข้า: %s\n", checkInStr)
		msg += fmt.Sprintf("   🕔 ออก: %s\n", checkOutStr)
		msg += fmt.Sprintf("   ⏱ รวม: %s\n\n", durationStr)
	}

	msg += fmt.Sprintf("รวมพนักงานวันนี้: %d คน", len(records))
	s.replyText(replyToken, msg)
}
