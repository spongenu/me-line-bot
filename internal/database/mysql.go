package database

import (
	"fmt"
	"log"
	"me-bot/internal/config"
	"me-bot/internal/model"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(cfg *config.Config) *gorm.DB {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.DBUser,
		cfg.DBPassword,
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBName,
	)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	log.Println("Database connected")

	// Auto migrate models
	if err := db.AutoMigrate(
		&model.Shop{},
		&model.Role{},
		&model.User{},
		&model.UserRole{},
		&model.Attendance{},
		&model.LeaveQuota{},
		&model.LeaveRequest{},
		&model.UserSchedule{},
		&model.SystemSetting{},
	); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Seed default roles and settings
	seedRoles(db)
	seedSettings(db)

	log.Println("Database migrated")
	return db
}

// seedRoles สร้าง role เริ่มต้นถ้ายังไม่มี
func seedRoles(db *gorm.DB) {
	roles := []model.Role{
		{Name: "customer"},
		{Name: "staff"},
		{Name: "admin"},
	}
	for _, r := range roles {
		db.Where(model.Role{Name: r.Name}).FirstOrCreate(&r)
	}
	log.Println("Roles seeded: customer, staff, admin")
}

// seedSettings สร้างค่าเริ่มต้นของระบบถ้ายังไม่มี
func seedSettings(db *gorm.DB) {
	defaults := []model.SystemSetting{
		{KeyName: "default_quota_ลาป่วย", Value: "30"},
		{KeyName: "default_quota_ลากิจ", Value: "3"},
		{KeyName: "default_quota_ลาพักร้อน", Value: "6"},
	}
	for _, s := range defaults {
		var existing model.SystemSetting
		if err := db.Where("key_name = ?", s.KeyName).First(&existing).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				db.Create(&s)
			}
		}
	}
	log.Println("Default leave settings seeded")
}

