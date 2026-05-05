import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";

import GeneralSettingsTab from "./settings/GeneralSettingsTab";
import PricingSettingsTab from "./settings/PricingSettingsTab";
import DeviceSettingsTab from "./settings/DeviceSettingsTab";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = "settings" | "dispatch" | "devices";

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
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="settings">기본 설정</TabsTrigger>
            <TabsTrigger value="dispatch">요율/필터</TabsTrigger>
            <TabsTrigger value="devices">기기 설정</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 outline-none">
            <GeneralSettingsTab onClose={onClose} />
          </TabsContent>

          <TabsContent value="dispatch" className="space-y-4 outline-none max-h-[60vh] overflow-y-auto pr-1">
            <PricingSettingsTab onClose={onClose} />
          </TabsContent>

          <TabsContent value="devices" className="space-y-4 outline-none">
            <DeviceSettingsTab onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
