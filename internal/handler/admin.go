package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"log"
	"me-bot/internal/config"
	"me-bot/internal/model"

	"github.com/line/line-bot-sdk-go/v7/linebot"

	"gorm.io/gorm"
)

type AdminHandler struct {
	DB  *gorm.DB
	Cfg *config.Config
	Bot *linebot.Client
}

func NewAdminHandler(db *gorm.DB, cfg *config.Config, bot *linebot.Client) *AdminHandler {
	return &AdminHandler{DB: db, Cfg: cfg, Bot: bot}
}

// ==================== USERS & ROLES ====================

func (h *AdminHandler) GetUsersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var users []model.User
	// Preload UserRoles, Role, and LeaveQuotas
	if err := h.DB.Preload("UserRoles.Role").
		Find(&users).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (h *AdminHandler) UpdateUserRoleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Assuming path is like /api/admin/users?id=1 or parse from URL param.
	// For simplicity, let's parse from query param `user_id` and `role_name` from body.
	userIDStr := r.URL.Query().Get("user_id")
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		RoleName string `json:"role_name"` // "admin", "staff", "customer"
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var role model.Role
	if err := h.DB.Where("name = ?", reqBody.RoleName).First(&role).Error; err != nil {
		http.Error(w, "Role not found", http.StatusBadRequest)
		return
	}

	// Clear existing roles and set new role (simplified for 1 role per user)
	tx := h.DB.Begin()
	tx.Where("user_id = ?", userID).Delete(&model.UserRole{})

	if reqBody.RoleName != "customer" { // If customer, they might just have no roles, or a specific customer role. Let's assume we set the role anyway.
		userRole := model.UserRole{
			UserID: uint(userID),
			RoleID: role.ID,
		}
		if err := tx.Create(&userRole).Error; err != nil {
			tx.Rollback()
			http.Error(w, "Failed to update role", http.StatusInternalServerError)
			return
		}
	}
	tx.Commit()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Role updated successfully"})
}

// ==================== ATTENDANCES ====================

func (h *AdminHandler) GetAttendancesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var attendances []model.Attendance
	query := h.DB.Preload("User").Order("created_at desc")

	// Add month filter if provided (format YYYY-MM)
	monthFilter := r.URL.Query().Get("month")
	if monthFilter != "" {
		query = query.Where("work_date LIKE ?", monthFilter+"%")
	}

	// Add user filter if provided
	userFilter := r.URL.Query().Get("user_id")
	if userFilter != "" {
		query = query.Where("user_id = ?", userFilter)
	}

	if err := query.Limit(500).Find(&attendances).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(attendances)
}

func (h *AdminHandler) UpdateAttendanceHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	attID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid attendance ID", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		CheckInTime  *string `json:"check_in_time"`
		CheckOutTime *string `json:"check_out_time"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var att model.Attendance
	if err := h.DB.First(&att, attID).Error; err != nil {
		http.Error(w, "Attendance not found", http.StatusNotFound)
		return
	}

	if reqBody.CheckInTime != nil && *reqBody.CheckInTime != "" {
		tIn, err := time.Parse(time.RFC3339, *reqBody.CheckInTime)
		if err == nil {
			att.CheckInTime = &tIn
		} else {
			http.Error(w, "Invalid check_in_time format (use RFC3339)", http.StatusBadRequest)
			return
		}
	}

	if reqBody.CheckOutTime != nil && *reqBody.CheckOutTime != "" {
		tOut, err := time.Parse(time.RFC3339, *reqBody.CheckOutTime)
		if err == nil {
			att.CheckOutTime = &tOut
		} else {
			http.Error(w, "Invalid check_out_time format (use RFC3339)", http.StatusBadRequest)
			return
		}
	} else if reqBody.CheckOutTime != nil && *reqBody.CheckOutTime == "" {
		att.CheckOutTime = nil
	}

	// Recalculate duration
	if att.CheckInTime != nil && att.CheckOutTime != nil {
		duration := att.CheckOutTime.Sub(*att.CheckInTime)
		att.WorkDurationMin = int(duration.Minutes())
	} else {
		att.WorkDurationMin = 0
	}

	if err := h.DB.Save(&att).Error; err != nil {
		http.Error(w, "Failed to update attendance", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(att)
}

// ==================== LEAVE MANAGEMENT ====================

func (h *AdminHandler) GetLeaveRequestsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var requests []model.LeaveRequest
	if err := h.DB.Preload("User").Preload("Approver").Order("created_at desc").Find(&requests).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(requests)
}

func (h *AdminHandler) UpdateLeaveStatusHandler(w http.ResponseWriter, r *http.Request) {
	// Simple approve/reject
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	idStr := r.URL.Query().Get("id")
	reqID, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid leave request ID", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		Status     string `json:"status"`      // "approved", "rejected"
		ApprovedBy uint   `json:"approved_by"` // From context in real app, simplified here
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var leaveReq model.LeaveRequest
	if err := h.DB.First(&leaveReq, reqID).Error; err != nil {
		http.Error(w, "Leave request not found", http.StatusNotFound)
		return
	}

	leaveReq.Status = reqBody.Status
	leaveReq.ApprovedBy = &reqBody.ApprovedBy

	if err := h.DB.Save(&leaveReq).Error; err != nil {
		http.Error(w, "Failed to update status", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(leaveReq)
}

// ==================== SCHEDULE MANAGEMENT ====================

func (h *AdminHandler) GetUserScheduleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userIDStr := r.URL.Query().Get("user_id")

	var schedules []model.UserSchedule
	query := h.DB.Order("effective_from desc")
	if userIDStr != "" {
		query = query.Where("user_id = ?", userIDStr)
	}
	if err := query.Find(&schedules).Error; err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(schedules)
}

func (h *AdminHandler) UpdateUserScheduleHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userIDStr := r.URL.Query().Get("user_id")
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		WorkingDays   string `json:"working_days"`   // e.g. "1,2,3,4,5"
		EffectiveFrom string `json:"effective_from"` // YYYY-MM-DD
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	effectiveDate, err := time.Parse("2006-01-02", reqBody.EffectiveFrom)
	if err != nil {
		// Default to today if invalid
		effectiveDate = time.Now().Truncate(24 * time.Hour)
	}

	// Check if a schedule with the exact same effective date exists for this user
	var existing model.UserSchedule
	err = h.DB.Where("user_id = ? AND effective_from = ?", userID, effectiveDate).First(&existing).Error
	if err == nil {
		// Update existing
		existing.WorkingDays = reqBody.WorkingDays
		h.DB.Save(&existing)
	} else {
		// Create new
		newSchedule := model.UserSchedule{
			UserID:        uint(userID),
			WorkingDays:   reqBody.WorkingDays,
			EffectiveFrom: effectiveDate,
		}
		h.DB.Create(&newSchedule)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Schedule updated successfully"})
}

// ==================== SYSTEM SETTINGS ====================

func (h *AdminHandler) GetSystemSettingsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get system open status
	var status model.SystemSetting
	h.DB.Where(model.SystemSetting{KeyName: "system_open"}).FirstOrCreate(&status, model.SystemSetting{KeyName: "system_open", Value: "true"})

	// Get LINE Quota
	var quotaUsage int64 = 0
	if h.Bot != nil {
		res, err := h.Bot.GetMessageQuotaConsumption().Do()
		if err == nil {
			quotaUsage = res.TotalUsage
		} else {
			log.Println("Error fetching LINE Quota:", err)
		}
	}

	response := map[string]interface{}{
		"system_open": status.Value == "true",
		"line_quota":  quotaUsage,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *AdminHandler) ToggleSystemHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var reqBody struct {
		SystemOpen bool `json:"system_open"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	var status model.SystemSetting
	h.DB.Where(model.SystemSetting{KeyName: "system_open"}).FirstOrCreate(&status, model.SystemSetting{KeyName: "system_open", Value: "true"})

	if reqBody.SystemOpen {
		status.Value = "true"
	} else {
		status.Value = "false"
	}

	h.DB.Save(&status)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"system_open": reqBody.SystemOpen})
}
