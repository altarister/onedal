import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Settings, CreditCard } from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import DrivingLogPage from './pages/DrivingLogPage';
import SettlementPage from './pages/SettlementPage';

function App() {
  const location = useLocation();

  const navigation = [
    { name: '대시보드', href: '/', icon: LayoutDashboard },
    { name: '전체 장부', href: '/log', icon: FileText },
    { name: '정산 관리', href: '/settlement', icon: CreditCard },
    { name: '설정', href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-surface border-r border-border-card flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-primary">1DAL Logbook</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/log" element={<DrivingLogPage />} />
          <Route path="/settlement" element={<SettlementPage />} />
          <Route path="/settings" element={<div className="p-8"><h1>설정 (준비중)</h1></div>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
