package handler

import (
	"encoding/json"
	"fmt"
	"math"
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

// ── Checkin & Attendance APIs ──

func (h *UserHandler) GetShopInfoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var shop model.Shop
	if err := h.DB.First(&shop).Error; err != nil {
		http.Error(w, "Shop not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"id":       shop.ID,
		"name":     shop.Name,
		"lat":      shop.Lat,
		"lng":      shop.Lng,
		"radius_m": shop.RadiusM,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *UserHandler) GetAttendanceStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(middleware.UserContextKey).(*middleware.Claims)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	loc, _ := time.LoadLocation("Asia/Bangkok")
	now := time.Now().In(loc)
	today := now.Format("2006-01-02")

	response := map[string]interface{}{
		"has_checked_in":  false,
		"has_checked_out": false,
		"check_in_time":   nil,
		"check_out_time":  nil,
	}

	// 1. Check if there's an active unclosed shift (within the last 18 hours)
	var activeAtt model.Attendance
	errActive := h.DB.Where("user_id = ? AND check_in_time IS NOT NULL AND check_out_time IS NULL", claims.UserID).
		Order("check_in_time desc").
		First(&activeAtt).Error

	if errActive == nil && activeAtt.CheckInTime != nil {
		if now.Sub(*activeAtt.CheckInTime) <= 18*time.Hour {
			response["has_checked_in"] = true
			response["has_checked_out"] = false
			response["check_in_time"] = activeAtt.CheckInTime
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
			return
		}
	}

	// 2. Otherwise, check today's record
	var todayAtt model.Attendance
	errToday := h.DB.Where("user_id = ? AND work_date = ?", claims.UserID, today).
		Order("created_at desc").
		First(&todayAtt).Error

	if errToday == nil && todayAtt.CheckInTime != nil {
		response["has_checked_in"] = true
		response["check_in_time"] = todayAtt.CheckInTime
		if todayAtt.CheckOutTime != nil {
			response["has_checked_out"] = true
			response["check_out_time"] = todayAtt.CheckOutTime
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *UserHandler) RecordAttendanceHandler(w http.ResponseWriter, r *http.Request) {
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
		Action string  `json:"action"` // "checkin" or "checkout"
		Lat    float64 `json:"lat"`
		Lng    float64 `json:"lng"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// Fetch shop to get radius and center
	var shop model.Shop
	if err := h.DB.First(&shop).Error; err != nil {
		http.Error(w, "Shop not found", http.StatusInternalServerError)
		return
	}

	// Calculate distance
	// Haversine inline to avoid import cycles
	const R = 6371000
	toRad := func(deg float64) float64 { return deg * 3.141592653589793 / 180 }
	dLat := toRad(shop.Lat - req.Lat)
	dLng := toRad(shop.Lng - req.Lng)
	a := (math.Sin(dLat/2) * math.Sin(dLat/2)) + (math.Cos(toRad(req.Lat)) * math.Cos(toRad(shop.Lat)) * math.Sin(dLng/2) * math.Sin(dLng/2))
	distance := R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	if distance > float64(shop.RadiusM) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":    fmt.Sprintf("ระยะทางของคุณห่างจากร้านเกินไป (ห่าง %.0f เมตร / อนุญาต %d เมตร)", distance, shop.RadiusM),
			"distance": distance,
		})
		return
	}

	loc, _ := time.LoadLocation("Asia/Bangkok")
	now := time.Now().In(loc)
	today := now.Format("2006-01-02")

	if req.Action == "checkin" {
		// Check if already in an active unclosed shift (< 18h)
		var activeAtt model.Attendance
		errActive := h.DB.Where("user_id = ? AND check_in_time IS NOT NULL AND check_out_time IS NULL", claims.UserID).
			Order("check_in_time desc").
			First(&activeAtt).Error
		if errActive == nil && activeAtt.CheckInTime != nil && now.Sub(*activeAtt.CheckInTime) <= 18*time.Hour {
			http.Error(w, "คุณเช็คอินอยู่แล้ว กรุณาเช็คเอาท์ก่อน", http.StatusBadRequest)
			return
		}

		// Also check if already completed today
		var todayAtt model.Attendance
		errToday := h.DB.Where("user_id = ? AND work_date = ?", claims.UserID, today).First(&todayAtt).Error
		if errToday == nil && todayAtt.CheckInTime != nil {
			http.Error(w, "คุณเช็คอินไปแล้ววันนี้", http.StatusBadRequest)
			return
		}

		newAtt := model.Attendance{
			UserID:      claims.UserID,
			ShopID:      shop.ID,
			WorkDate:    today,
			CheckInTime: &now,
			CheckInLat:  req.Lat,
			CheckInLng:  req.Lng,
			CreatedAt:   now,
		}
		h.DB.Create(&newAtt)
	} else if req.Action == "checkout" {
		// Find active unclosed shift within 18h (can be from today or yesterday)
		var activeAtt model.Attendance
		errActive := h.DB.Where("user_id = ? AND check_in_time IS NOT NULL AND check_out_time IS NULL", claims.UserID).
			Order("check_in_time desc").
			First(&activeAtt).Error

		if errActive != nil || activeAtt.CheckInTime == nil || now.Sub(*activeAtt.CheckInTime) > 18*time.Hour {
			// Fallback: check today's record
			var todayAtt model.Attendance
			errToday := h.DB.Where("user_id = ? AND work_date = ?", claims.UserID, today).First(&todayAtt).Error
			if errToday != nil || todayAtt.CheckInTime == nil {
				http.Error(w, "ไม่พบข้อมูลการเช็คอินที่ยังไม่เช็คเอาท์", http.StatusBadRequest)
				return
			}
			if todayAtt.CheckOutTime != nil {
				http.Error(w, "คุณเช็คเอาท์ไปแล้ววันนี้", http.StatusBadRequest)
				return
			}
			activeAtt = todayAtt
		}

		// Calculate duration
		if activeAtt.CheckInTime != nil {
			duration := now.Sub(*activeAtt.CheckInTime).Minutes()
			if duration < 0 {
				duration = 0
			}
			activeAtt.WorkDurationMin = int(duration)
		}

		activeAtt.CheckOutTime = &now
		activeAtt.CheckOutLat = req.Lat
		activeAtt.CheckOutLng = req.Lng
		h.DB.Save(&activeAtt)
	} else {
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  "Success",
		"distance": distance,
	})
}

type AttendanceHistoryResponse struct {
	Month          string               `json:"month"`
	TotalWorkDays  int                  `json:"total_work_days"`
	TotalWorkHours float64              `json:"total_work_hours"`
	Records        []model.Attendance   `json:"records"`
	LeaveRecords   []model.LeaveRequest `json:"leave_records"`
}

func (h *UserHandler) GetAttendanceHistoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	claims, ok := r.Context().Value(middleware.UserContextKey).(*middleware.Claims)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	month := r.URL.Query().Get("month")
	if month == "" {
		loc, _ := time.LoadLocation("Asia/Bangkok")
		month = time.Now().In(loc).Format("2006-01")
	}

	monthPrefix := month + "%"
	var attendances []model.Attendance
	h.DB.Where("user_id = ? AND work_date LIKE ?", claims.UserID, monthPrefix).
		Order("work_date desc").
		Find(&attendances)

	var leaves []model.LeaveRequest
	h.DB.Where("user_id = ? AND (start_date LIKE ? OR end_date LIKE ?) AND status = 'approved'", claims.UserID, monthPrefix, monthPrefix).
		Order("start_date desc").
		Find(&leaves)

	totalWorkDays := len(attendances)
	totalMinutes := 0
	for _, att := range attendances {
		totalMinutes += att.WorkDurationMin
	}
	totalHours := float64(totalMinutes) / 60.0

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(AttendanceHistoryResponse{
		Month:          month,
		TotalWorkDays:  totalWorkDays,
		TotalWorkHours: totalHours,
		Records:        attendances,
		LeaveRecords:   leaves,
	})
}
