package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"me-bot/internal/middleware"
	"me-bot/internal/model"

	"gorm.io/gorm"
)

type UserHandler struct {
	DB *gorm.DB
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{DB: db}
}

type LeaveBalanceItem struct {
	LeaveType     string `json:"leave_type"`
	Year          int    `json:"year"`
	TotalDays     int    `json:"total_days"`
	UsedDays      int    `json:"used_days"`
	PendingDays   int    `json:"pending_days"`
	RemainingDays int    `json:"remaining_days"`
}

// CalculateLeaveDays counts inclusive days between two YYYY-MM-DD dates
func CalculateLeaveDays(startDateStr, endDateStr string) (int, error) {
	start, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		return 0, err
	}
	end, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		return 0, err
	}
	if end.Before(start) {
		return 0, fmt.Errorf("วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น")
	}
	days := int(end.Sub(start).Hours()/24) + 1
	return days, nil
}

func GetUserLeaveQuota(db *gorm.DB, userID uint, leaveType string, year int) int {
	var quota model.LeaveQuota
	if err := db.Where("user_id = ? AND leave_type = ? AND year = ?", userID, leaveType, year).First(&quota).Error; err == nil {
		return quota.TotalDays
	}

	// Fallback to default in SystemSetting
	var setting model.SystemSetting
	keyName := fmt.Sprintf("default_quota_%s", leaveType)
	if err := db.Where("key_name = ?", keyName).First(&setting).Error; err == nil {
		if val, err := strconv.Atoi(setting.Value); err == nil {
			return val
		}
	}

	// Hardcoded fallback
	switch leaveType {
	case "ลาป่วย":
		return 30
	case "ลากิจ":
		return 3
	case "ลาพักร้อน":
		return 6
	default:
		return 0
	}
}

func GetUserUsedAndPendingLeaveDays(db *gorm.DB, userID uint, leaveType string, year int) (int, int) {
	yearStart := fmt.Sprintf("%04d-01-01", year)
	yearEnd := fmt.Sprintf("%04d-12-31", year)

	var requests []model.LeaveRequest
	db.Where("user_id = ? AND leave_type = ? AND start_date >= ? AND start_date <= ? AND status IN ('approved', 'pending')",
		userID, leaveType, yearStart, yearEnd).Find(&requests)

	usedDays := 0
	pendingDays := 0
	for _, req := range requests {
		days, err := CalculateLeaveDays(req.StartDate, req.EndDate)
		if err != nil {
			continue
		}
		if req.Status == "approved" {
			usedDays += days
		} else if req.Status == "pending" {
			pendingDays += days
		}
	}
	return usedDays, pendingDays
}

func (h *UserHandler) GetUserLeaveBalancesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(middleware.UserContextKey).(*middleware.Claims)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	year := time.Now().Year()
	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		if parsedYear, err := strconv.Atoi(yearStr); err == nil {
			year = parsedYear
		}
	}

	leaveTypes := []string{"ลาป่วย", "ลากิจ", "ลาพักร้อน"}
	balances := make([]LeaveBalanceItem, 0, len(leaveTypes))

	for _, lt := range leaveTypes {
		total := GetUserLeaveQuota(h.DB, claims.UserID, lt, year)
		used, pending := GetUserUsedAndPendingLeaveDays(h.DB, claims.UserID, lt, year)
		remaining := total - used - pending
		if remaining < 0 {
			remaining = 0
		}

		balances = append(balances, LeaveBalanceItem{
			LeaveType:     lt,
			Year:          year,
			TotalDays:     total,
			UsedDays:      used,
			PendingDays:   pending,
			RemainingDays: remaining,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(balances)
}

func (h *UserHandler) CreateLeaveRequestHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(middleware.UserContextKey).(*middleware.Claims)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		LeaveType string `json:"leave_type"`
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
		Reason    string `json:"reason"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	if req.LeaveType == "" || req.StartDate == "" || req.EndDate == "" {
		http.Error(w, "กรุณากรอกข้อมูลให้ครบถ้วน", http.StatusBadRequest)
		return
	}

	requestedDays, err := CalculateLeaveDays(req.StartDate, req.EndDate)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	startDateObj, _ := time.Parse("2006-01-02", req.StartDate)
	year := startDateObj.Year()

	totalQuota := GetUserLeaveQuota(h.DB, claims.UserID, req.LeaveType, year)
	usedDays, pendingDays := GetUserUsedAndPendingLeaveDays(h.DB, claims.UserID, req.LeaveType, year)
	remainingQuota := totalQuota - usedDays - pendingDays

	if requestedDays > remainingQuota {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": fmt.Sprintf("โควตา%sไม่เพียงพอ (เหลือ %d วัน แต่ต้องการขอยื่น %d วัน)", req.LeaveType, remainingQuota, requestedDays),
		})
		return
	}

	leaveReq := model.LeaveRequest{
		UserID:    claims.UserID,
		LeaveType: req.LeaveType,
		StartDate: req.StartDate,
		EndDate:   req.EndDate,
		Reason:    req.Reason,
		Status:    "pending",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := h.DB.Create(&leaveReq).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(leaveReq)
}

