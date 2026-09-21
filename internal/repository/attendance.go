package repository

import (
	"me-bot/internal/model"
	"time"

	"gorm.io/gorm"
)

type AttendanceRepository struct {
	db *gorm.DB
}

func NewAttendanceRepository(db *gorm.DB) *AttendanceRepository {
	return &AttendanceRepository{db: db}
}

func (r *AttendanceRepository) FindTodayByUser(userID uint, date string) (*model.Attendance, error) {
	var att model.Attendance
	err := r.db.Where("user_id = ? AND work_date = ?", userID, date).First(&att).Error
	if err != nil {
		return nil, err
	}
	return &att, nil
}

// FindLatestOpenByUser หารายการเช็คอินล่าสุดที่ยังไม่ได้เช็คเอาท์
func (r *AttendanceRepository) FindLatestOpenByUser(userID uint) (*model.Attendance, error) {
	var att model.Attendance
	err := r.db.Where("user_id = ? AND check_out_time IS NULL", userID).
		Order("check_in_time DESC").
		First(&att).Error
	if err != nil {
		return nil, err
	}
	return &att, nil
}

func (r *AttendanceRepository) CreateCheckIn(userID uint, shopID uint, lat, lng float64, t time.Time) error {
	att := &model.Attendance{
		UserID:      userID,
		ShopID:      shopID,
		CheckInTime: &t,
		CheckInLat:  lat,
		CheckInLng:  lng,
		WorkDate:    t.Format("2006-01-02"),
	}
	return r.db.Create(att).Error
}

func (r *AttendanceRepository) UpdateCheckOut(id uint, lat, lng float64, t time.Time, durationMin int) error {
	return r.db.Model(&model.Attendance{}).Where("id = ?", id).Updates(map[string]interface{}{
		"check_out_time":    t,
		"check_out_lat":     lat,
		"check_out_lng":     lng,
		"work_duration_min": durationMin,
	}).Error
}

// SummaryByDate ดึงข้อมูล attendance ทั้งหมดของวันนั้น พร้อม user
func (r *AttendanceRepository) SummaryByDate(date string) ([]model.Attendance, error) {
	var records []model.Attendance
	err := r.db.
		Preload("User").
		Preload("Shop").
		Where("work_date = ?", date).
		Order("check_in_time ASC").
		Find(&records).Error
	return records, err
}
