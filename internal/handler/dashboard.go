package handler

import (
	"encoding/json"
	"fmt"
	"me-bot/internal/model"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

type DashboardHandler struct {
	DB *gorm.DB
}

func NewDashboardHandler(db *gorm.DB) *DashboardHandler {
	return &DashboardHandler{DB: db}
}

type CalendarEvent struct {
	Date      string `json:"date"`
	UserID    uint   `json:"user_id"`
	UserName  string `json:"user_name"`
	Type      string `json:"type"` // "absent" or "leave"
	LeaveType string `json:"leave_type,omitempty"`
}

type CalendarResponse struct {
	Month  string          `json:"month"`
	Events []CalendarEvent `json:"events"`
}

func (h *DashboardHandler) GetCalendarHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	monthParam := r.URL.Query().Get("month") // YYYY-MM
	if monthParam == "" {
		monthParam = time.Now().Format("2006-01")
	}

	yearStr := monthParam[:4]
	monthStr := monthParam[5:]
	year, _ := strconv.Atoi(yearStr)
	month, _ := strconv.Atoi(monthStr)

	// Determine start and end of month
	loc, _ := time.LoadLocation("Asia/Bangkok")
	startOfMonth := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, loc)
	endOfMonth := startOfMonth.AddDate(0, 1, -1)

	// Get all staff users
	var users []model.User
	h.DB.Joins("JOIN user_roles ur ON ur.user_id = users.id").
		Joins("JOIN roles r ON r.id = ur.role_id").
		Where("users.is_active = ? AND r.name = ?", true, "staff").
		Find(&users)

	// Get all attendances for the month
	var attendances []model.Attendance
	h.DB.Where("work_date LIKE ?", monthParam+"%").Find(&attendances)

	// Get all approved leaves for the month
	var leaves []model.LeaveRequest
	h.DB.Where("status = 'approved' AND start_date <= ? AND end_date >= ?", endOfMonth.Format("2006-01-02"), startOfMonth.Format("2006-01-02")).Find(&leaves)

	// Get all schedules
	var schedules []model.UserSchedule
	h.DB.Find(&schedules)

	var events []CalendarEvent

	todayStr := time.Now().In(loc).Format("2006-01-02")
	endDay := endOfMonth.Day()
	if monthParam == todayStr[:7] {
		endDay = time.Now().In(loc).Day()
	}

	for day := 1; day <= endDay; day++ {
		dateStr := fmt.Sprintf("%04d-%02d-%02d", year, month, day)
		dateObj := time.Date(year, time.Month(month), day, 0, 0, 0, 0, loc)
		dayOfWeek := int(dateObj.Weekday()) // 0=Sun

		for _, u := range users {
			name := u.DisplayName
			if name == "" {
				name = u.Name
			}

			// Check attendance
			hasAtt := false
			for _, a := range attendances {
				if a.UserID == u.ID && (a.WorkDate == dateStr || (a.CheckInTime != nil && a.CheckInTime.In(loc).Format("2006-01-02") == dateStr)) {
					hasAtt = true
					break
				}
			}
			if hasAtt {
				continue
			}

			// Check leave
			hasLeave := false
			var leaveType string
			for _, l := range leaves {
				if l.UserID == u.ID && l.StartDate <= dateStr && l.EndDate >= dateStr {
					hasLeave = true
					leaveType = l.LeaveType
					break
				}
			}

			if hasLeave {
				events = append(events, CalendarEvent{
					Date:      dateStr,
					UserID:    u.ID,
					UserName:  name,
					Type:      "leave",
					LeaveType: leaveType,
				})
				continue
			}

			// Check schedule
			var activeSched *model.UserSchedule
			for i := range schedules {
				s := &schedules[i]
				effStr := s.EffectiveFrom.Format("2006-01-02")
				if s.UserID == u.ID && effStr <= dateStr {
					if activeSched == nil || s.EffectiveFrom.After(activeSched.EffectiveFrom) {
						activeSched = s
					}
				}
			}

			if activeSched != nil && strings.TrimSpace(activeSched.WorkingDays) != "" {
				parts := strings.Split(activeSched.WorkingDays, ",")
				isWorkDay := false
				target := strconv.Itoa(dayOfWeek)
				for _, p := range parts {
					if strings.TrimSpace(p) == target {
						isWorkDay = true
						break
					}
				}
				if isWorkDay {
					events = append(events, CalendarEvent{
						Date:     dateStr,
						UserID:   u.ID,
						UserName: name,
						Type:     "absent",
					})
				}
			}
		}
	}

	resp := CalendarResponse{
		Month:  monthParam,
		Events: events,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
