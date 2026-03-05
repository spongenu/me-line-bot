package repository

import (
	"me-bot/internal/model"

	"gorm.io/gorm"
)

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

// FindByLineID หา user พร้อม roles
func (r *UserRepository) FindByLineID(lineUserID string) (*model.User, error) {
	var user model.User
	err := r.db.
		Preload("UserRoles.Role").
		Preload("UserRoles.Shop").
		Where("line_user_id = ?", lineUserID).
		First(&user).Error
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// Create สร้าง user ใหม่
func (r *UserRepository) Create(user *model.User) error {
	return r.db.Create(user).Error
}

// AddRole เพิ่ม role ให้ user
func (r *UserRepository) AddRole(userID uint, roleID uint, shopID *uint) error {
	userRole := model.UserRole{
		UserID: userID,
		RoleID: roleID,
		ShopID: shopID,
	}
	return r.db.Where(model.UserRole{UserID: userID, RoleID: roleID}).
		FirstOrCreate(&userRole).Error
}

// FindRoleByName หา role id จากชื่อ
func (r *UserRepository) FindRoleByName(name string) (*model.Role, error) {
	var role model.Role
	err := r.db.Where("name = ?", name).First(&role).Error
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// HasRole เช็คว่า user มี role นี้ไหม
func (r *UserRepository) HasRole(userID uint, roleName string) bool {
	var count int64
	r.db.Table("user_roles").
		Joins("JOIN roles ON roles.id = user_roles.role_id").
		Where("user_roles.user_id = ? AND roles.name = ?", userID, roleName).
		Count(&count)
	return count > 0
}

// GetStaffShop หา shop ของ user ที่เป็น staff
func (r *UserRepository) GetStaffShop(userID uint) (*model.Shop, error) {
	var userRole model.UserRole
	err := r.db.
		Preload("Shop").
		Joins("JOIN roles ON roles.id = user_roles.role_id").
		Where("user_roles.user_id = ? AND roles.name = ? AND user_roles.shop_id IS NOT NULL", userID, "staff").
		First(&userRole).Error
	if err != nil {
		return nil, err
	}
	return userRole.Shop, nil
}

func (r *UserRepository) UpdateProfile(userID uint, displayName, pictureURL string) error {
	return r.db.Model(&model.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"display_name": displayName,
			"picture_url":  pictureURL,
		}).Error
}

func (r *UserRepository) FindAllActive(users *[]model.User) error {
	return r.db.Where("is_active = ?", true).Find(users).Error
}
