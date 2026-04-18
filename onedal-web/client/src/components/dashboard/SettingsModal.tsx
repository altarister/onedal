import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../api/apiClient";
import { VEHICLE_OPTIONS } from "@onedal/shared";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { logout } = useAuth();
  const [vehicleType, setVehicleType] = useState<string>("1t");
  const [defaultPriority, setDefaultPriority] = useState<string>("RECOMMEND");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/settings');
      setVehicleType(data.vehicleType || "1t");
      setDefaultPriority(data.defaultPriority || 'RECOMMEND');
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      await apiClient.put('/settings', { vehicleType, defaultPriority });
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
      alert("설정 저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-6">사용자 설정</h2>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* 차량 타입 선택 */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">내 차량 종류 (배차 탐색 기준)</label>
              <select
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-3 outline-none focus:border-violet-500 transition-colors"
              >
                {VEHICLE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* 경로 탐색 옵션 */}
            <div>
              <label className="block text-sm font-semibold text-gray-400 mb-2">기본 경로 탐색 옵션</label>
              <select
                value={defaultPriority}
                onChange={(e) => setDefaultPriority(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-3 outline-none focus:border-violet-500 transition-colors"
              >
                <option value="RECOMMEND">추천 경로 (RECOMMEND)</option>
                <option value="TIME">최단 시간 (TIME)</option>
                <option value="DISTANCE">최단 거리 (DISTANCE)</option>
              </select>
            </div>

            {/* 저장 버튼 */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={logout}
                className="text-sm text-red-500 hover:text-red-400 font-semibold underline underline-offset-2"
              >
                로그아웃
              </button>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-500 transition-colors"
                >
                  저장하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
