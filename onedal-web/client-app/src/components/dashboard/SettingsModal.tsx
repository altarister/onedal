import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

import GeneralSettingsTab from "./settings/GeneralSettingsTab";
import PricingSettingsTab from "./settings/PricingSettingsTab";
import JudgmentSettingsTab from './settings/JudgmentSettingsTab';
import ScreenSettingsTab from "./settings/ScreenSettingsTab";
import DeviceSettingsTab from "./settings/DeviceSettingsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "settings" | "screen" | "dispatch" | "judgment" | "devices";

interface TabMeta {
  id: TabType;
  icon: string;
  label: string;
  domain: string;
  desc: string;
}

const TAB_META: Record<TabType, TabMeta> = {
  settings: {
    id: "settings",
    icon: "⚙️",
    label: "기본",
    domain: "운영 환경",
    desc: "내 차종, 홈 주소 및 3대 배차망(인성·화물24시·픽커)별 고유 안전 대기 시간을 설정합니다."
  },
  screen: {
    id: "screen",
    icon: "🖥️",
    label: "화면",
    domain: "동작 감지",
    desc: "주행(20km/h 초과) 및 정차(5km/h 미만) 시 시트가 자동으로 접히고 펴지는 전환 시간을 설정합니다."
  },
  dispatch: {
    id: "dispatch",
    icon: "💰",
    label: "필터",
    domain: "단가·기준",
    desc: "콜을 잡기 전 원천 차단하는 차종별 km당 적정 단가표, 자동 반경 기준거리 및 수수료율을 관리합니다."
  },
  judgment: {
    id: "judgment",
    icon: "🎯",
    label: "판정",
    domain: "5대 채점표",
    desc: "수집된 콜에 대해 🔵꿀 · 🟢보통 · 🟡똥 · 🔴사고 색상과 점수를 산출하는 5대 사후 채점 기준입니다."
  },
  devices: {
    id: "devices",
    icon: "📱",
    label: "기기",
    domain: "스캔앱 연동",
    desc: "원달 안드로이드 스캔앱과의 실시간 양방향 연동 PIN 코드 발급 및 등록 기기를 관리합니다."
  }
};

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("settings");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90dvh] w-[95vw] overflow-hidden flex flex-col bg-surface border-border-card text-text-primary p-4 sm:p-5">
        <DialogHeader className="mb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
              ⚙️ 사용자 및 관제 설정
            </DialogTitle>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}
              className="w-full flex-1 min-h-0 flex flex-col">
          {/* 5개 탭 헤더 — 아이콘 + 명확한 도메인 구분 */}
          <TabsList className="grid w-full grid-cols-5 p-1 bg-surface-alt/40 border border-border-card rounded-lg h-auto mb-2">
            {(Object.values(TAB_META)).map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center justify-center gap-1 sm:gap-1.5 py-1.5 px-2 text-xs font-semibold rounded-md transition-all data-[state=active]:bg-surface data-[state=active]:text-primary data-[state=active]:shadow-sm data-[state=active]:border-border-card"
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="font-bold">{tab.label}</span>
                <span className="hidden md:inline-block text-[10px] text-text-muted font-normal">({tab.domain})</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* 탭 안내 배너 */}
          <div className="bg-surface-alt/25 border border-border-card/60 rounded-md px-3 py-1.5 text-[11px] text-text-muted mb-2.5 flex items-center gap-1.5">
            <span className="font-bold text-text-primary">안내:</span>
            <span>{TAB_META[activeTab].desc}</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <TabsContent value="settings" className="outline-none m-0">
              <GeneralSettingsTab onClose={onClose} />
            </TabsContent>

            <TabsContent value="screen" className="outline-none m-0">
              <ScreenSettingsTab />
            </TabsContent>

            <TabsContent value="dispatch" className="outline-none m-0">
              <PricingSettingsTab onClose={onClose} />
            </TabsContent>

            <TabsContent value="judgment" className="outline-none m-0">
              <JudgmentSettingsTab />
            </TabsContent>

            <TabsContent value="devices" className="outline-none m-0">
              <DeviceSettingsTab onClose={onClose} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
