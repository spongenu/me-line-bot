import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import liff from '@line/liff';
import { MapPin, CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';

interface ShopInfo {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

interface AttendanceStatus {
  has_checked_in: boolean;
  has_checked_out: boolean;
  check_in_time?: string;
  check_out_time?: string;
}

export default function Checkin() {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshingGps, setRefreshingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');

  // Update clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate distance inline using Haversine
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };

  const getPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง (Geolocation)'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });
  };

  const refreshLocation = async (targetShop?: ShopInfo) => {
    setRefreshingGps(true);
    setGpsError('');
    try {
      const pos = await getPosition();
      const currentCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      setCoords(currentCoords);

      const activeShop = targetShop || shop;
      if (activeShop) {
        const dist = calculateDistance(
          currentCoords.lat,
          currentCoords.lng,
          activeShop.lat,
          activeShop.lng
        );
        setDistance(dist);
      }
    } catch (err: any) {
      console.error('GPS error:', err);
      if (err.code === 1) {
        setGpsError('กรุณากด "อนุญาต (Allow)" ให้เว็บไซต์เข้าถึงตำแหน่ง GPS ของคุณ');
      } else {
        setGpsError('ไม่สามารถดึงตำแหน่ง GPS ได้ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setRefreshingGps(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [shopRes, statusRes] = await Promise.all([
        api.get('/user/shop-info'),
        api.get('/user/attendance/status'),
      ]);
      setShop(shopRes.data);
      setStatus(statusRes.data);
      await refreshLocation(shopRes.data);
    } catch (err) {
      console.error('Fetch checkin data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRecord = async (action: 'checkin' | 'checkout') => {
    if (!coords) {
      alert('ไม่พบตำแหน่ง GPS กรุณากดปุ่มรีเฟรชตำแหน่ง');
      return;
    }
    if (shop && distance !== null && distance > shop.radius_m) {
      alert(`คุณอยู่ห่างจากร้านเกิน ${shop.radius_m} เมตร ไม่สามารถลงเวลาได้`);
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/user/attendance/record', {
        action,
        lat: coords.lat,
        lng: coords.lng,
      });

      const actionText = action === 'checkin' ? 'เช็คอินเข้างาน' : 'เช็คเอาท์ออกงาน';
      setActionSuccess(`${actionText} สำเร็จแล้ว`);

      // Refresh status
      const statusRes = await api.get('/user/attendance/status');
      setStatus(statusRes.data);

      // Attempt to send a message via LIFF if available
      try {
        if (liff.isLoggedIn()) {
          await liff.sendMessages([
            {
              type: 'text',
              text: `ฉันได้ทำการ ${actionText} แล้ว (${currentTime} น.)`,
            },
          ]);
        }
      } catch (liffErr) {
        console.log('Cannot send message via LIFF (not critical)', liffErr);
      }
    } catch (err: any) {
      console.error('Record attendance error:', err);
      const errMsg = err.response?.data?.error || err.response?.data || err.message;
      alert(`บันทึกไม่สำเร็จ: ${errMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">กำลังโหลดข้อมูลและค้นหาตำแหน่ง GPS...</p>
      </div>
    );
  }

  const isWithinRadius = shop && distance !== null && distance <= shop.radius_m;

  return (
    <div className="p-4 space-y-4">
      {/* Live Time Card */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-3xl shadow-lg text-center relative overflow-hidden">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <p className="text-xs font-semibold text-blue-200 uppercase tracking-widest mb-1">
          {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <h2 className="text-4xl font-extrabold font-mono tracking-tight my-2">{currentTime || '--:--:--'}</h2>
        <div className="flex items-center justify-center space-x-1.5 text-xs text-blue-100 bg-white/15 px-3 py-1 rounded-full w-fit mx-auto mt-2">
          <Clock className="w-3.5 h-3.5" />
          <span>เวลาปัจจุบันของระบบ</span>
        </div>
      </div>

      {/* GPS Status & Distance Card */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MapPin className={`w-5 h-5 ${isWithinRadius ? 'text-green-600' : 'text-red-500'}`} />
            <h3 className="font-bold text-gray-800 text-sm">ตำแหน่งของคุณ</h3>
          </div>
          <button
            onClick={() => refreshLocation()}
            disabled={refreshingGps}
            className="flex items-center space-x-1 text-xs text-blue-600 font-medium bg-blue-50 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingGps ? 'animate-spin' : ''}`} />
            <span>{refreshingGps ? 'กำลังระบุ...' : 'รีเฟรช GPS'}</span>
          </button>
        </div>

        {gpsError ? (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{gpsError}</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">จุดหมาย:</span>
              <span className="font-semibold text-gray-800">{shop?.name || 'ร้าน'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">ระยะห่างจากร้าน:</span>
              <span className={`font-bold ${isWithinRadius ? 'text-green-600' : 'text-red-600'}`}>
                {distance !== null ? `${distance} เมตร` : 'กำลังคำนวณ...'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>รัศมีที่อนุญาต:</span>
              <span>ไม่เกิน {shop?.radius_m || 200} เมตร</span>
            </div>

            {distance !== null && (
              <div
                className={`p-2.5 rounded-xl text-xs font-medium text-center flex items-center justify-center space-x-1.5 ${
                  isWithinRadius ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {isWithinRadius ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>คุณอยู่ในพื้นที่ร้าน สามารถบันทึกเวลาได้</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span>คุณอยู่นอกรัศมีร้าน กรุณาเข้าใกล้ร้านอีกนิดครับ</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Success Alert */}
      {actionSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-2xl flex items-center space-x-3">
          <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
          <div>
            <p className="font-bold text-sm">{actionSuccess}</p>
            <p className="text-xs text-green-600">บันทึกข้อมูลเข้าสู่ระบบเรียบร้อยแล้ว</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3 pt-2">
        {!status?.has_checked_in && (
          <button
            onClick={() => handleRecord('checkin')}
            disabled={submitting || !isWithinRadius}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold py-4 rounded-2xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center space-y-1"
          >
            <span className="text-lg tracking-wide">🟢 บันทึกเวลาเข้างาน (Check-in)</span>
            <span className="text-xs font-normal text-green-100">
              {isWithinRadius ? 'กดเพื่อเริ่มทำงานวันนี้' : 'ปุ่มจะเปิดใช้งานเมื่ออยู่ในรัศมีร้าน'}
            </span>
          </button>
        )}

        {status?.has_checked_in && !status?.has_checked_out && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 flex justify-between items-center">
              <span>เวลาที่เข้างานวันนี้:</span>
              <span className="font-bold text-sm text-blue-900">
                {status.check_in_time ? new Date(status.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'บันทึกแล้ว'} น.
              </span>
            </div>

            <button
              onClick={() => handleRecord('checkout')}
              disabled={submitting || !isWithinRadius}
              className="w-full bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-bold py-4 rounded-2xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center space-y-1"
            >
              <span className="text-lg tracking-wide">🔴 บันทึกเวลาออกงาน (Check-out)</span>
              <span className="text-xs font-normal text-red-100">
                {isWithinRadius ? 'กดเพื่อสิ้นสุดกะการทำงาน' : 'ปุ่มจะเปิดใช้งานเมื่ออยู่ในรัศมีร้าน'}
              </span>
            </button>
          </div>
        )}

        {status?.has_checked_in && status?.has_checked_out && (
          <div className="p-5 bg-gray-100 rounded-2xl text-center space-y-2 border border-gray-200">
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
            <h4 className="font-bold text-gray-800">วันนี้ลงเวลาเข้า-ออกครบแล้ว</h4>
            <div className="flex justify-center space-x-4 text-xs text-gray-600 pt-1">
              <span>
                เข้า: <strong>{status.check_in_time ? new Date(status.check_in_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
              </span>
              <span>•</span>
              <span>
                ออก: <strong>{status.check_out_time ? new Date(status.check_out_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
