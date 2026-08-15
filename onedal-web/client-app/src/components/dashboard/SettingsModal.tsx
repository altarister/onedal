import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";

import GeneralSettingsTab from "./settings/GeneralSettingsTab";
import PricingSettingsTab from "./settings/PricingSettingsTab";
import JudgmentSettingsTab from './settings/JudgmentSettingsTab';
import DeviceSettingsTab from "./settings/DeviceSettingsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "settings" | "dispatch" | "devices" | 'judgment';

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("settings");

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-surface border-border-card text-text-primary">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex justify-between items-center text-xl font-bold">
            사용자 설정
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                logout();
                onClose();
              }}
            >
              로그아웃
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
          {/* 🎯 「판정 기준」은 **콜 필터와 다른 층**이다 (기사님 2026-08-16).
              🔍 필터 팝업 = 콜을 **집기 전** 조건 · 여기 = **집은 뒤** 색을 매기는 기준.
              화면이 갈리는 것 자체가 그 구분을 몸으로 가르쳐 준다.
              이름을 `판정/필터` 로 하지 않은 이유: `요율/필터` 와 한 글자 차이라 헷갈린다 */}
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="settings">기본 설정</TabsTrigger>
            <TabsTrigger value="dispatch">요율/필터</TabsTrigger>
            <TabsTrigger value="judgment">판정 기준</TabsTrigger>
            <TabsTrigger value="devices">기기 설정</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 outline-none">
            <GeneralSettingsTab onClose={onClose} />
          </TabsContent>

          <TabsContent value="dispatch" className="space-y-4 outline-none max-h-[60vh] overflow-y-auto pr-1">
            <PricingSettingsTab onClose={onClose} />
          </TabsContent>

          <TabsContent value="judgment" className="space-y-4 outline-none max-h-[60vh] overflow-y-auto pr-1">
            <JudgmentSettingsTab />
          </TabsContent>

          <TabsContent value="devices" className="space-y-4 outline-none">
            <DeviceSettingsTab onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
