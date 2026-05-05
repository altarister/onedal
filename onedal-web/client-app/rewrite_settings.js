const fs = require('fs');
let code = fs.readFileSync('src/components/dashboard/SettingsModal.tsx', 'utf8');

// Add imports
const imports = `import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
`;
code = code.replace(/import \{ VEHICLE_OPTIONS \}.*?;/, match => match + '\n' + imports);

// Remove if (!isOpen) return null;
code = code.replace('if (!isOpen) return null;', '');

// Replace outer wrapper
code = code.replace(/<div className="fixed inset-0 z-\[100\].*?>[\s\S]*?<div className="relative bg-gray-900.*?>/, 
`<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-800 text-white p-6">`);

// Replace renderPinOverlay to be inside DialogContent
code = code.replace(/\{renderPinOverlay\(\)\}/, '{renderPinOverlay()}');

// Replace Header
code = code.replace(/<div className="flex justify-between items-center mb-4">[\s\S]*?<h2.*?>사용자 설정<\/h2>[\s\S]*?<button[\s\S]*?onClick=\{\(\) => \{[\s\S]*?logout\(\);[\s\S]*?onClose\(\);[\s\S]*?\}\}[\s\S]*?>[\s\S]*?로그아웃[\s\S]*?<\/button>[\s\S]*?<\/div>/,
`<DialogHeader className="mb-4">
          <DialogTitle className="flex justify-between items-center text-xl font-bold text-white">
            사용자 설정
            <Button variant="destructive" size="sm" onClick={() => { logout(); onClose(); }}>
              로그아웃
            </Button>
          </DialogTitle>
        </DialogHeader>`);

// Replace Tabs Navigation
code = code.replace(/<div className="flex gap-1 mb-5 bg-gray-950 p-1 rounded-lg">[\s\S]*?<\/div>\n\n\s*\{\/\* ═══ 기본 설정 탭 ═══ \*\/\}/,
`<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-5 bg-gray-950">
            <TabsTrigger value="settings">기본 설정</TabsTrigger>
            <TabsTrigger value="dispatch">요율/필터</TabsTrigger>
            <TabsTrigger value="devices">기기 설정</TabsTrigger>
          </TabsList>
          {/* ═══ 기본 설정 탭 ═══ */}`);

// Replace Tab Conditionals
code = code.replace(/\{activeTab === "settings" && \(/g, `<TabsContent value="settings" className="mt-0 outline-none">
        {(`);
code = code.replace(/\{activeTab === "dispatch" && \(/g, `<TabsContent value="dispatch" className="mt-0 outline-none">
        {(`);
code = code.replace(/\{activeTab === "devices" && \(/g, `<TabsContent value="devices" className="mt-0 outline-none">
        {(`);

// Replace Switch
code = code.replace(/<label className="relative inline-flex items-center cursor-pointer">[\s\S]*?<input[\s\S]*?checked=\{isActive\}[\s\S]*?onChange=\{\(e\) => setIsActive\(e\.target\.checked\)\}[\s\S]*?\/>[\s\S]*?<div[\s\S]*?><\/div>[\s\S]*?<\/label>/g,
`<Switch checked={isActive} onCheckedChange={setIsActive} />`);

// Replace <input> with <Input> where className contains border
code = code.replace(/<input\n([\s\S]*?className="[\s\S]*?)>/g, (match, p1) => {
    if (p1.includes('type="range"')) return match;
    if (p1.includes('type="checkbox"')) return match;
    return `<Input\n${p1} />`.replace(/className="[^"]*"/, 'className="bg-gray-950 border-gray-800 text-white"');
});

// Close TabsContent
code = code.replace(/(\s*)\)\s*\}/g, '$1)}\n          </TabsContent>');

// Close Dialog
code = code.replace(/<\/div>\n\s*<\/div>\n\s*\);\n\}/, `\n        </Tabs>\n      </DialogContent>\n    </Dialog>\n  );\n}`);

// Button replacements
code = code.replace(/<button\s+onClick=\{onClose\}\s+className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 transition-colors"\s*>\s*취소\s*<\/button>/g,
`<Button variant="secondary" onClick={onClose}>취소</Button>`);

code = code.replace(/<button\s+onClick=\{handleSaveSettings\}\s+className="px-4 py-2 rounded-lg bg-accent text-white font-bold hover:bg-violet-500 transition-colors"\s*>\s*설정 저장\s*<\/button>/g,
`<Button onClick={handleSaveSettings}>설정 저장</Button>`);

code = code.replace(/<button\s+onClick=\{handleSavePricing\}\s+className="px-4 py-2 rounded-lg bg-accent text-white font-bold hover:bg-violet-500 transition-colors"\s*>\s*설정 저장\s*<\/button>/g,
`<Button onClick={handleSavePricing}>설정 저장</Button>`);

fs.writeFileSync('src/components/dashboard/SettingsModal.tsx', code);
