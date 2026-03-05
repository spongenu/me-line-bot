package service

import (
	"log"
	"me-bot/internal/model"

	"github.com/line/line-bot-sdk-go/v7/linebot"
)

// handleRegisterStart เริ่ม flow ลงทะเบียน
func (s *CheckinService) handleRegisterStart(event *linebot.Event) {
	userId := event.Source.UserID

	existing, _ := s.userRepo.FindByLineID(userId)
	if existing != nil {
		s.replyText(event.ReplyToken, "ℹ️ คุณลงทะเบียนไว้แล้ว\n👤 ชื่อ: "+existing.Name)
		return
	}

	s.mu.Lock()
	s.states[userId] = &userState{Step: "awaiting_name"}
	s.mu.Unlock()

	s.replyText(event.ReplyToken, "📝 ลงทะเบียน\n\nกรุณาพิมพ์ชื่อ-นามสกุลของคุณ")
}

// handleRegisterName รับชื่อแล้วบันทึก user
func (s *CheckinService) handleRegisterName(event *linebot.Event, name string) {
	userId := event.Source.UserID

	// ดึง LINE Profile
	displayName := name
	pictureURL := ""
	profile, err := s.bot.GetProfile(userId).Do()
	if err == nil {
		displayName = profile.DisplayName
		pictureURL = profile.PictureURL
	}

	user := &model.User{
		LineUserID:  userId,
		Name:        name,
		DisplayName: displayName,
		PictureURL:  pictureURL,
		IsActive:    false,
	}

	if err := s.userRepo.Create(user); err != nil {
		log.Println("Create user error:", err)
		s.replyText(event.ReplyToken, "❌ เกิดข้อผิดพลาด กรุณาลองใหม่")
		return
	}

	// กำหนด role customer อัตโนมัติ
	role, err := s.userRepo.FindRoleByName("customer")
	if err == nil {
		s.userRepo.AddRole(user.ID, role.ID, nil)
	}

	// Assign Rich Menu A
	if s.richMenuSvc != nil {
		go s.richMenuSvc.AssignMenu(userId, RichMenuA)
	}

	s.mu.Lock()
	delete(s.states, userId)
	s.mu.Unlock()

	s.replyText(event.ReplyToken,
		"✅ ลงทะเบียนสำเร็จ! คุณ"+name+"\n\n⏳ รอการอนุมัติจาก admin ก่อนนะครับ")

	log.Printf("New user registered: %s (%s) - pending approval", name, userId)
}

// AssignMenuByRole กำหนด Rich Menu ตาม role
func (s *CheckinService) AssignMenuByRole(lineUserID string, userID uint) {
	if s.richMenuSvc == nil {
		return
	}
	if s.userRepo.HasRole(userID, "admin") {
		s.richMenuSvc.AssignMenu(lineUserID, RichMenuC)
	} else if s.userRepo.HasRole(userID, "staff") {
		s.richMenuSvc.AssignMenu(lineUserID, RichMenuB)
	} else {
		s.richMenuSvc.AssignMenu(lineUserID, RichMenuA)
	}
}

// syncProfile sync ชื่อและรูป profile จาก LINE (background)
func (s *CheckinService) syncProfile(userID uint, lineUserID string) {
	profile, err := s.bot.GetProfile(lineUserID).Do()
	if err != nil {
		return
	}
	s.userRepo.UpdateProfile(userID, profile.DisplayName, profile.PictureURL)
}
