package handler

import (
	"encoding/json"
	"me-bot/internal/model"
	"net/http"
	"strconv"
	"strings"
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

// isScheduledDay checks if dayOfWeek (0=Sun, 1=Mon, ..., 6=Sat) is in workingDaysStr (e.g. "1,2,3,4,5")
func isScheduledDay(workingDaysStr string, dayOfWeek int) bool {
	if workingDaysStr == "" {
		// Default to Monday-Friday
		return dayOfWeek >= 1 && dayOfWeek <= 5
	}
	parts := strings.Split(workingDaysStr, ",")
	target := strconv.Itoa(dayOfWeek)
	for _, p := range parts {
		if strings.TrimSpace(p) == target {
			return true
		}
	}
	return false
}

func (h *IoTHandler) GetDailyStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	loc, _ := time.LoadLocation("Asia/Bangkok")
	now := time.Now().In(loc)
	todayStr := now.Format("2006-01-02")
	dayOfWeek := int(now.Weekday()) // 0=Sunday, 1=Monday... 6=Saturday

	// Get all active users who have the 'staff' role
	var users []model.User
	h.DB.Joins("JOIN user_roles ur ON ur.user_id = users.id").
		Joins("JOIN roles r ON r.id = ur.role_id").
		Where("users.is_active = ? AND r.name = ?", true, "staff").
		Find(&users)

	var staffList []StaffStatus
	var checkedInCount, workingCount, leaveCount int

	for _, u := range users {
		name := u.DisplayName
		if name == "" {
			name = u.Name
		}

		status := StaffStatus{
			Name:   name,
			Status: "absent",
			In:     "",
			Out:    "",
		}

		// 1. Check if they have an attendance record today
		var att model.Attendance
		errAtt := h.DB.Where("user_id = ? AND work_date = ?", u.ID, todayStr).First(&att).Error
		if errAtt == nil && att.CheckInTime != nil {
			status.In = att.CheckInTime.In(loc).Format("15:04")
			checkedInCount++
			if att.CheckOutTime != nil {
				status.Out = att.CheckOutTime.In(loc).Format("15:04")
				status.Status = "completed"
			} else {
				status.Status = "working"
				workingCount++
			}
			staffList = append(staffList, status)
			continue
		}

		// 2. Check for approved leave today
		var leave model.LeaveRequest
		errLeave := h.DB.Where("user_id = ? AND start_date <= ? AND end_date >= ? AND status = 'approved'", u.ID, todayStr, todayStr).First(&leave).Error
		if errLeave == nil {
			status.Status = "leave"
			status.In = "ลา"
			leaveCount++
			staffList = append(staffList, status)
			continue
		}

		// 3. Check their work schedule for today
		var schedule model.UserSchedule
		errSched := h.DB.Where("user_id = ? AND effective_from <= ?", u.ID, todayStr).
			Order("effective_from desc").
			First(&schedule).Error

		scheduledToday := false
		if errSched == nil {
			scheduledToday = isScheduledDay(schedule.WorkingDays, dayOfWeek)
		} else {
			// Default schedule is Mon-Fri if not explicitly configured
			scheduledToday = isScheduledDay("1,2,3,4,5", dayOfWeek)
		}

		// If today is a scheduled work day and they haven't checked in / taken leave -> Absent
		if scheduledToday {
			status.Status = "absent"
			staffList = append(staffList, status)
		}
		// If not scheduled today (Day Off) and no attendance, they are omitted from the list
	}

	response := map[string]interface{}{
		"date":             todayStr,
		"time":             now.Format("15:04"),
		"total_staff":      len(staffList),
		"checked_in_count": checkedInCount,
		"working_count":    workingCount,
		"leave_count":      leaveCount,
		"staff":            staffList,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
