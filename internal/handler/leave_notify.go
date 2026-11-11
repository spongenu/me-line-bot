package handler

import (
	"fmt"
	"log"
	"strings"
	"time"

	"me-bot/internal/model"

	"github.com/line/line-bot-sdk-go/v7/linebot"
	"gorm.io/gorm"
)

func leaveEmoji(leaveType string) string {
	switch leaveType {
	case "ลาป่วย":
		return "🤒"
	case "ลาพักร้อน":
		return "🏖️"
	default:
		return "📝"
	}
}

func formatThaiSlashDate(ymd string) string {
	t, err := time.Parse("2006-01-02", ymd)
	if err != nil {
		return ymd
	}
	return t.Format("02/01/2006")
}

func formatLeaveDateDisplay(startDate, endDate string) string {
	days, err := CalculateLeaveDays(startDate, endDate)
	if err != nil || days < 1 {
		days = 1
	}
	sFmt := formatThaiSlashDate(startDate)
	if startDate == endDate {
		return fmt.Sprintf("%s (%d วัน)", sFmt, days)
	}
	eFmt := formatThaiSlashDate(endDate)
	return fmt.Sprintf("%s - %s (%d วัน)", sFmt, eFmt, days)
}

func formatStaffName(u model.User) string {
	name := strings.TrimSpace(u.Name)
	display := strings.TrimSpace(u.DisplayName)
	if name != "" && display != "" && name != display {
		return fmt.Sprintf("%s (%s)", name, display)
	}
	if display != "" {
		return display
	}
	if name != "" {
		return name
	}
	return "พนักงาน"
}

func formatAdminName(u *model.User) string {
	if u == nil {
		return "ผู้ดูแลระบบ"
	}
	if display := strings.TrimSpace(u.DisplayName); display != "" {
		return display
	}
	if name := strings.TrimSpace(u.Name); name != "" {
		return name
	}
	return "ผู้ดูแลระบบ"
}

func isGroupNotifyEnabled(db *gorm.DB) bool {
	var status model.SystemSetting
	if err := db.Where(model.SystemSetting{KeyName: "notify_group"}).
		Attrs(model.SystemSetting{Value: "true"}).
		FirstOrCreate(&status).Error; err != nil {
		return true
	}
	return status.Value == "true"
}

func getShopGroupID(db *gorm.DB, userID uint) string {
	var ur model.UserRole
	if err := db.Preload("Shop").
		Where("user_id = ? AND shop_id IS NOT NULL", userID).
		First(&ur).Error; err == nil && ur.Shop != nil && strings.TrimSpace(ur.Shop.LineGroupID) != "" {
		return strings.TrimSpace(ur.Shop.LineGroupID)
	}

	var shop model.Shop
	if err := db.Where("line_group_id <> ''").First(&shop).Error; err == nil {
		return strings.TrimSpace(shop.LineGroupID)
	}
	return ""
}

// notifyLeaveRequested pushes a notification to all admin users when an employee submits a leave request.
func notifyLeaveRequested(db *gorm.DB, bot *linebot.Client, leaveReq model.LeaveRequest) {
	if bot == nil {
		return
	}

	var staff model.User
	if err := db.First(&staff, leaveReq.UserID).Error; err != nil {
		log.Printf("notifyLeaveRequested: user %d not found: %v", leaveReq.UserID, err)
		return
	}

	var admins []model.User
	if err := db.Joins("JOIN user_roles ur ON ur.user_id = users.id").
		Joins("JOIN roles r ON r.id = ur.role_id").
		Where("r.name = ? AND users.line_user_id <> ''", "admin").
		Find(&admins).Error; err != nil {
		log.Printf("notifyLeaveRequested: failed to query admins: %v", err)
		return
	}

	reasonText := strings.TrimSpace(leaveReq.Reason)
	if reasonText == "" {
		reasonText = "-"
	}

	msg := fmt.Sprintf(
		"🔔 มีคำขอลางานใหม่!\n👤 พนักงาน: %s\n🔖 ประเภท: %s %s\n🗓️ วันที่ลา: %s\n💬 เหตุผล: %s",
		formatStaffName(staff),
		leaveReq.LeaveType,
		leaveEmoji(leaveReq.LeaveType),
		formatLeaveDateDisplay(leaveReq.StartDate, leaveReq.EndDate),
		reasonText,
	)

	seen := make(map[string]bool)
	for _, admin := range admins {
		lineID := strings.TrimSpace(admin.LineUserID)
		if lineID == "" || seen[lineID] {
			continue
		}
		seen[lineID] = true
		if _, err := bot.PushMessage(lineID, linebot.NewTextMessage(msg)).Do(); err != nil {
			log.Printf("notifyLeaveRequested: push to admin %s failed: %v", lineID, err)
		}
	}
}

// notifyLeaveStatusUpdated pushes a notification to the employee (and to the shop group if approved).
func notifyLeaveStatusUpdated(db *gorm.DB, bot *linebot.Client, leaveReq model.LeaveRequest) {
	if bot == nil {
		return
	}

	var staff model.User
	if err := db.First(&staff, leaveReq.UserID).Error; err != nil {
		log.Printf("notifyLeaveStatusUpdated: user %d not found: %v", leaveReq.UserID, err)
		return
	}

	var approverPtr *model.User
	if leaveReq.ApprovedBy != nil && *leaveReq.ApprovedBy > 0 {
		var approver model.User
		if err := db.First(&approver, *leaveReq.ApprovedBy).Error; err == nil {
			approverPtr = &approver
		}
	}

	dateDisplay := formatLeaveDateDisplay(leaveReq.StartDate, leaveReq.EndDate)
	emoji := leaveEmoji(leaveReq.LeaveType)

	switch leaveReq.Status {
	case "approved":
		year := time.Now().Year()
		if t, err := time.Parse("2006-01-02", leaveReq.StartDate); err == nil {
			year = t.Year()
		}
		totalQuota := GetUserLeaveQuota(db, leaveReq.UserID, leaveReq.LeaveType, year)
		usedDays, pendingDays := GetUserUsedAndPendingLeaveDays(db, leaveReq.UserID, leaveReq.LeaveType, year)
		remaining := totalQuota - usedDays - pendingDays
		if remaining < 0 {
			remaining = 0
		}

		if lineID := strings.TrimSpace(staff.LineUserID); lineID != "" {
			staffMsg := fmt.Sprintf(
				"✅ คำขอลางานได้รับอนุมัติแล้ว\n🔖 ประเภท: %s %s\n🗓️ วันที่ลา: %s\n📊 โควตา%sคงเหลือ: %d / %d วัน\n👮 ผู้อนุมัติ: %s",
				leaveReq.LeaveType,
				emoji,
				dateDisplay,
				leaveReq.LeaveType,
				remaining,
				totalQuota,
				formatAdminName(approverPtr),
			)
			if _, err := bot.PushMessage(lineID, linebot.NewTextMessage(staffMsg)).Do(); err != nil {
				log.Printf("notifyLeaveStatusUpdated: push approved to staff %s failed: %v", lineID, err)
			}
		}

		if isGroupNotifyEnabled(db) {
			if groupID := getShopGroupID(db, leaveReq.UserID); groupID != "" {
				groupMsg := fmt.Sprintf(
					"📢 แจ้งวันลาพนักงาน (อนุมัติแล้ว)\n👤 พนักงาน: %s\n🔖 ประเภท: %s %s\n🗓️ วันที่ลา: %s",
					formatStaffName(staff),
					leaveReq.LeaveType,
					emoji,
					dateDisplay,
				)
				if _, err := bot.PushMessage(groupID, linebot.NewTextMessage(groupMsg)).Do(); err != nil {
					log.Printf("notifyLeaveStatusUpdated: push approved to group %s failed: %v", groupID, err)
				}
			}
		}

	case "rejected":
		if lineID := strings.TrimSpace(staff.LineUserID); lineID != "" {
			reasonText := strings.TrimSpace(leaveReq.Reason)
			if reasonText == "" {
				reasonText = "-"
			}
			staffMsg := fmt.Sprintf(
				"❌ คำขอลางานไม่ได้รับการอนุมัติ\n🔖 ประเภท: %s %s\n🗓️ วันที่ขอลา: %s\n💬 เหตุผลที่ยื่น: %s\n👮 ผู้พิจารณา: %s\n*(โควตาวันลาของคุณไม่ถูกหัก)*",
				leaveReq.LeaveType,
				emoji,
				dateDisplay,
				reasonText,
				formatAdminName(approverPtr),
			)
			if _, err := bot.PushMessage(lineID, linebot.NewTextMessage(staffMsg)).Do(); err != nil {
				log.Printf("notifyLeaveStatusUpdated: push rejected to staff %s failed: %v", lineID, err)
			}
		}
	}
}
