import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import liff from '@line/liff';
import { api } from '../lib/api';

interface User {
  id: number;
  name: string;
  display_name: string;
  picture_url: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginWithLine: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithLine: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage first
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      setUser(JSON.parse(storedUser));
    }

    // Initialize LIFF
    const initLiff = async () => {
      try {
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) {
          console.error('VITE_LIFF_ID is not defined in .env');
          setLoading(false);
          return;
        }

        await liff.init({ liffId });

        if (liff.isLoggedIn()) {
          const idToken = liff.getIDToken();
          if (idToken) {
            // Verify with backend
            try {
              const res = await api.post('/auth/verify-liff', { id_token: idToken });
              const { token, user: userData } = res.data;
              
              localStorage.setItem('token', token);
              localStorage.setItem('user', JSON.stringify(userData));
              setUser(userData);
            } catch (err) {
              console.error('Failed to verify LIFF token with backend:', err);
              // หาก Token หมดอายุ หรือไม่มีสิทธิ์ ให้ Logout จาก LIFF ทันที เพื่อให้ Login ใหม่ได้
              if (liff.isLoggedIn()) {
                 liff.logout();
              }
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              setUser(null);
            }
          }
        }
      } catch (err) {
        console.error('LIFF initialization failed', err);
      } finally {
        setLoading(false);
      }
    };

    initLiff();
  }, []);

  const loginWithLine = () => {
    if (!liff.isLoggedIn()) {
      liff.login();
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    if (liff.isLoggedIn()) {
      liff.logout();
    }
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithLine, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
