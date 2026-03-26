package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"me-bot/internal/model"
	"me-bot/internal/repository"
	"net/http"
	"os"
)

const (
	RichMenuA = "menu_a" // Register
	RichMenuB = "menu_b" // Staff
	RichMenuC = "menu_c" // Admin
)

type RichMenuService struct {
	accessToken string
	MenuIDs     map[string]string
}

func NewRichMenuService(accessToken string) *RichMenuService {
	return &RichMenuService{
		accessToken: accessToken,
		MenuIDs:     make(map[string]string),
	}
}

// Setup สร้าง Rich Menu ทั้ง 3 แบบ
func (s *RichMenuService) Setup(menuAImg, menuBImg, menuCImg string) error {
	menus := []struct {
		key     string
		imgPath string
		body    map[string]interface{}
	}{
		{RichMenuA, menuAImg, s.buildMenuA()},
		{RichMenuB, menuBImg, s.buildMenuB()},
		{RichMenuC, menuCImg, s.buildMenuC()},
	}

	for _, m := range menus {
		id, err := s.createMenu(m.body)
		if err != nil {
			return fmt.Errorf("create %s: %w", m.key, err)
		}
		if err := s.uploadImage(id, m.imgPath); err != nil {
			return fmt.Errorf("upload %s: %w", m.key, err)
		}
		s.MenuIDs[m.key] = id
		log.Printf("Rich Menu %s created: %s", m.key, id)
	}
	return nil
}

// AssignMenu กำหนด Rich Menu ให้ user
func (s *RichMenuService) AssignMenu(lineUserID, menuKey string) error {
	menuID, ok := s.MenuIDs[menuKey]
	if !ok {
		return fmt.Errorf("menu %s not found", menuKey)
	}
	url := fmt.Sprintf("https://api.line.me/v2/bot/user/%s/richmenu/%s", lineUserID, menuID)
	req, _ := http.NewRequest("POST", url, nil)
	req.Header.Set("Authorization", "Bearer "+s.accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("assign failed: %s", string(b))
	}
	log.Printf("Assigned %s to %s", menuKey, lineUserID)
	return nil
}

// createMenu สร้าง Rich Menu แล้วคืน richMenuId
func (s *RichMenuService) createMenu(body map[string]interface{}) (string, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest("POST", "https://api.line.me/v2/bot/richmenu", bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		RichMenuID string `json:"richMenuId"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.RichMenuID == "" {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("empty richMenuId: %s", string(b))
	}
	return result.RichMenuID, nil
}

// uploadImage อัปโหลดรูปเข้า Rich Menu
func (s *RichMenuService) uploadImage(richMenuID, imgPath string) error {
	data, err := os.ReadFile(imgPath)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("https://api-data.line.me/v2/bot/richmenu/%s/content", richMenuID)
	req, _ := http.NewRequest("POST", url, bytes.NewReader(data))
	req.Header.Set("Authorization", "Bearer "+s.accessToken)
	req.Header.Set("Content-Type", "image/png")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("upload failed: %s", string(b))
	}
	return nil
}

// AssignMenuToExistingUsers assign menu ให้ user ที่มีอยู่แล้วทุกคน
func (s *RichMenuService) AssignMenuToExistingUsers(userRepo *repository.UserRepository) {
	var users []model.User
	userRepo.FindAllActive(&users)

	for _, u := range users {
		if userRepo.HasRole(u.ID, "admin") {
			s.AssignMenu(u.LineUserID, RichMenuC)
		} else if userRepo.HasRole(u.ID, "staff") {
			s.AssignMenu(u.LineUserID, RichMenuB)
		} else {
			s.AssignMenu(u.LineUserID, RichMenuA)
		}
		log.Printf("Assigned menu to %s (%s)", u.Name, u.LineUserID)
	}
}

// ── Menu Layouts ──

func (s *RichMenuService) buildMenuA() map[string]interface{} {
	return map[string]interface{}{
		"size":        map[string]int{"width": 2500, "height": 843},
		"selected":    true,
		"name":        "Menu A - Register",
		"chatBarText": "Menu",
		"areas": []map[string]interface{}{
			{
				"bounds": map[string]int{"x": 0, "y": 0, "width": 2500, "height": 843},
				"action": map[string]string{"type": "message", "text": "ลงทะเบียน"},
			},
		},
	}
}

func (s *RichMenuService) buildMenuB() map[string]interface{} {
	return map[string]interface{}{
		"size":        map[string]int{"width": 2500, "height": 843},
		"selected":    true,
		"name":        "Menu B - Staff",
		"chatBarText": "Menu",
		"areas": []map[string]interface{}{
			{
				"bounds": map[string]int{"x": 0, "y": 0, "width": 1250, "height": 843},
				"action": map[string]string{"type": "message", "text": "เช็คอิน"},
			},
			{
				"bounds": map[string]int{"x": 1250, "y": 0, "width": 1250, "height": 843},
				"action": map[string]string{"type": "message", "text": "เช็คเอาท์"},
			},
		},
	}
}

func (s *RichMenuService) buildMenuC() map[string]interface{} {
	return map[string]interface{}{
		"size":        map[string]int{"width": 2500, "height": 843},
		"selected":    true,
		"name":        "Menu C - Admin",
		"chatBarText": "Menu",
		"areas": []map[string]interface{}{
			{
				"bounds": map[string]int{"x": 0, "y": 0, "width": 833, "height": 843},
				"action": map[string]string{"type": "message", "text": "เช็คอิน"},
			},
			{
				"bounds": map[string]int{"x": 833, "y": 0, "width": 833, "height": 843},
				"action": map[string]string{"type": "message", "text": "เช็คเอาท์"},
			},
			{
				"bounds": map[string]int{"x": 1666, "y": 0, "width": 834, "height": 843},
				"action": map[string]string{"type": "message", "text": "สรุปวันนี้"},
			},
		},
	}
}
