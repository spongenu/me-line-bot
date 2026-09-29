package handler

import (
	"encoding/json"
	"me-bot/internal/model"
	"net/http"
	"time"

	"gorm.io/gorm"
)

type IoTHandler struct {
	DB *gorm.DB
}

func NewIoTHandler(db *gorm.DB) *IoTHandler {
	return &IoTHandler{DB: db}
}

type StaffStatus struct {
	Name   string `json:"name"`
	Status string `json:"status"` // "working", "completed", "leave", "absent"
	In     string `json:"in"`     // HH:mm or ""
	Out    string `json:"out"`    // HH:mm or ""
}

func (h *IoTHandler) GetDailyStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	loc, _ := time.LoadLocation("Asia/Bangkok")
	now := time.Now().In(loc)
	todayStr := now.Format("2006-01-02")

	// Get all active users who have the 'staff' role
	var users []model.User
	h.DB.Joins("JOIN user_roles ur ON ur.user_id = users.id").
		Joins("JOIN roles r ON r.id = ur.role_id").
		Where("users.is_active = ? AND r.name = ?", true, "staff").
		Find(&users)

	var staffList []StaffStatus
	var totalStaff = len(users)
	var checkedInCount, workingCount, leaveCount int

	for _, u := range users {
		status := StaffStatus{
			Name:   u.DisplayName,
			Status: "absent",
		}
		if status.Name == "" {
			status.Name = u.Name
		}

		// Check for leave today
		var leave model.LeaveRequest
		err := h.DB.Where("user_id = ? AND start_date <= ? AND end_date >= ? AND status = 'approved'", u.ID, todayStr, todayStr).First(&leave).Error
		if err == nil {
			status.Status = "leave"
			status.In = "ลา"
			leaveCount++
			staffList = append(staffList, status)
			continue
		}

		// Check attendance today
		var att model.Attendance
		err = h.DB.Where("user_id = ? AND work_date = ?", u.ID, todayStr).First(&att).Error
		if err == nil {
			if att.CheckInTime != nil {
				status.In = att.CheckInTime.In(loc).Format("15:04")
				status.Status = "working"
				checkedInCount++
				workingCount++
			}
			if att.CheckOutTime != nil {
				status.Out = att.CheckOutTime.In(loc).Format("15:04")
				status.Status = "completed"
				workingCount-- // They finished working
			}
		}

		staffList = append(staffList, status)
	}

	response := map[string]interface{}{
		"date":             todayStr,
		"time":             now.Format("15:04"),
		"total_staff":      totalStaff,
		"checked_in_count": checkedInCount,
		"working_count":    workingCount,
		"leave_count":      leaveCount,
		"staff":            staffList,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
