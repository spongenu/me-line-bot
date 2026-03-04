package service

import (
	"fmt"
	"time"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

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

	records, err := s.attRepo.SummaryByDate(today)
	if err != nil || len(records) == 0 {
		s.replyText(event.ReplyToken, "📊 ยังไม่มีข้อมูลการทำงานวันนี้")
		return
	}

	msg := fmt.Sprintf("📊 สรุปการทำงานวันที่ %s\n", thaiDate)
	if len(records) > 0 {
		msg += fmt.Sprintf("🏪 %s\n\n", records[0].Shop.Name)
	}

	for _, att := range records {
		checkInStr := "-"
		checkOutStr := "-"
		durationStr := "-"

		if att.CheckInTime != nil {
			checkInStr = att.CheckInTime.In(bangkokTZ()).Format("15:04") + " น."
		}
		if att.CheckOutTime != nil {
			checkOutStr = att.CheckOutTime.In(bangkokTZ()).Format("15:04") + " น."
			hours := att.WorkDurationMin / 60
			mins := att.WorkDurationMin % 60
			durationStr = fmt.Sprintf("%d ชม. %d นาที", hours, mins)
		}

		msg += fmt.Sprintf("👤 %s\n", att.User.DisplayName)
		msg += fmt.Sprintf("   🕗 เข้า: %s\n", checkInStr)
		msg += fmt.Sprintf("   🕔 ออก: %s\n", checkOutStr)
		msg += fmt.Sprintf("   ⏱ รวม: %s\n\n", durationStr)
	}

	msg += fmt.Sprintf("รวมพนักงานวันนี้: %d คน", len(records))
	s.replyText(event.ReplyToken, msg)
}
