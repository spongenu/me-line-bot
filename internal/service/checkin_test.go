package service

import (
	"testing"
	"time"
)

func TestShiftDurationAndOvernightMark(t *testing.T) {
	loc := bangkokTZ()

	tests := []struct {
		name            string
		checkIn         time.Time
		checkOut        time.Time
		wantDurationMin int
		wantHours       int
		wantMins        int
		wantNextDayMark string
		isExceeded      bool
	}{
		{
			name:            "Normal shift same day (11:00 to 23:00)",
			checkIn:         time.Date(2026, 3, 20, 11, 0, 0, 0, loc),
			checkOut:        time.Date(2026, 3, 20, 23, 0, 0, 0, loc),
			wantDurationMin: 720,
			wantHours:       12,
			wantMins:        0,
			wantNextDayMark: "",
			isExceeded:      false,
		},
		{
			name:            "Overnight shift to 02:00 next day (11:00 to 02:00+1)",
			checkIn:         time.Date(2026, 3, 20, 11, 0, 0, 0, loc),
			checkOut:        time.Date(2026, 3, 21, 2, 0, 0, 0, loc),
			wantDurationMin: 900,
			wantHours:       15,
			wantMins:        0,
			wantNextDayMark: " (+1)",
			isExceeded:      false,
		},
		{
			name:            "Late checkin overnight shift (14:00 to 02:00+1)",
			checkIn:         time.Date(2026, 3, 20, 14, 0, 0, 0, loc),
			checkOut:        time.Date(2026, 3, 21, 2, 0, 0, 0, loc),
			wantDurationMin: 720,
			wantHours:       12,
			wantMins:        0,
			wantNextDayMark: " (+1)",
			isExceeded:      false,
		},
		{
			name:            "Late shift to 04:30 next day (11:00 to 04:30+1)",
			checkIn:         time.Date(2026, 3, 20, 11, 0, 0, 0, loc),
			checkOut:        time.Date(2026, 3, 21, 4, 30, 0, 0, loc),
			wantDurationMin: 1050,
			wantHours:       17,
			wantMins:        30,
			wantNextDayMark: " (+1)",
			isExceeded:      false,
		},
		{
			name:            "Forgot checkout and try at 11:00 next day (14:00 to 11:00+1 = 21h)",
			checkIn:         time.Date(2026, 3, 20, 14, 0, 0, 0, loc),
			checkOut:        time.Date(2026, 3, 21, 11, 0, 0, 0, loc),
			wantDurationMin: 1260,
			wantHours:       21,
			wantMins:        0,
			wantNextDayMark: " (+1)",
			isExceeded:      true, // Exceeds MaxShiftDuration (18h)
		},
		{
			name:            "Forgot checkout for multiple days (3 days = 72h)",
			checkIn:         time.Date(2026, 3, 17, 11, 0, 0, 0, loc),
			checkOut:        time.Date(2026, 3, 20, 11, 0, 0, 0, loc),
			wantDurationMin: 4320,
			wantHours:       72,
			wantMins:        0,
			wantNextDayMark: " (+1)",
			isExceeded:      true, // Exceeds MaxShiftDuration (18h)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			duration := tt.checkOut.Sub(tt.checkIn)
			if (duration > MaxShiftDuration) != tt.isExceeded {
				t.Errorf("expected isExceeded=%v, got=%v", tt.isExceeded, duration > MaxShiftDuration)
			}

			durationMin := int(duration.Minutes())
			if durationMin != tt.wantDurationMin {
				t.Errorf("expected durationMin=%d, got=%d", tt.wantDurationMin, durationMin)
			}

			hours := durationMin / 60
			mins := durationMin % 60
			if hours != tt.wantHours || mins != tt.wantMins {
				t.Errorf("expected %dh %dm, got %dh %dm", tt.wantHours, tt.wantMins, hours, mins)
			}

			checkInDate := tt.checkIn.In(loc).Format("2006-01-02")
			checkOutDate := tt.checkOut.In(loc).Format("2006-01-02")
			nextDayMark := ""
			if checkOutDate != checkInDate {
				nextDayMark = " (+1)"
			}
			if nextDayMark != tt.wantNextDayMark {
				t.Errorf("expected nextDayMark=%q, got %q", tt.wantNextDayMark, nextDayMark)
			}
		})
	}
}

func TestParseThaiDate(t *testing.T) {
	tests := []struct {
		input   string
		want    string
		wantErr bool
	}{
		{"11/03/2026", "2026-03-11", false},
		{"1/3/2026", "2026-03-01", false},
		{"11/03/26", "2026-03-11", false},
		{"invalid-date", "", true},
	}

	for _, tt := range tests {
		got, err := parseThaiDate(tt.input)
		if (err != nil) != tt.wantErr {
			t.Errorf("parseThaiDate(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			continue
		}
		if got != tt.want {
			t.Errorf("parseThaiDate(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
