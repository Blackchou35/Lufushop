// 寵物凍乾與寄賣 ERP - 側邊導覽列與角色切換元件
import React, { useState, useEffect } from 'react';
import { getCurrentUser, setCurrentUser, getDb } from '../lib/db';
import { Profile } from '../types/erp';
import { dbService } from '../services/dbService';
import { 
  LayoutDashboard, Flame, Tag, Warehouse, 
  FileSpreadsheet, Settings, User, RefreshCw, Layers 
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onUserChange: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onUserChange, onLogout }) => {
  const [currentUser, setUser] = useState<Profile>(getCurrentUser());
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [isOpen, setIsOpen] = useState(false); // 手機板選單收合

  useEffect(() => {
    // 獲取所有用戶清單
    setAllUsers(getDb().profiles);
  }, []);

  const handleUserSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = dbService.getProducts; // 只是為了觸發
    try {
      const u = setCurrentUser(e.target.value);
      setUser(u);
      onUserChange();
      // 權限變更時，若目前分頁為 STAFF/PARTNER 不可看之分頁，自動跳回儀表板
      if (u.role === 'STAFF' && activeTab === 'settings') {
        setActiveTab('dashboard');
      } else if (u.role === 'PARTNER' && (activeTab === 'production' || activeTab === 'settings')) {
        setActiveTab('dashboard');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const menuItems = [
    { id: 'dashboard', name: '營運數據儀表板', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARTNER'] },
    { id: 'production', name: '加工生產與成本', icon: Flame, roles: ['SUPER_ADMIN', 'ADMIN', 'STAFF'] },
    { id: 'pricing', name: '價格與利潤試算', icon: Tag, roles: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARTNER'] },
    { id: 'warehouse', name: '倉庫庫存與移貨', icon: Warehouse, roles: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARTNER'] },
    { id: 'reconciliation', name: '賣貨登記與算帳格子', icon: FileSpreadsheet, roles: ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'PARTNER'] },
    { id: 'settings', name: '後台設定與修改紀錄', icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] }
  ];

  // 根據角色過濾選單
  const filteredMenuItems = menuItems.filter(item => item.roles.includes(currentUser.role));

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-brand-accent/20 text-brand-accent border-brand-accent/40';
      case 'ADMIN':
        return 'bg-brand-primary/20 text-brand-primary border-brand-primary/40';
      case 'STAFF':
        return 'bg-warm-blue/20 text-warm-blue border-warm-blue/40';
      default:
        return 'bg-brand-camel/20 text-brand-camel border-brand-camel/40';
    }
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return '最高管理者';
      case 'ADMIN': return '管理員';
      case 'STAFF': return '現場員工';
      case 'PARTNER': return '寄賣夥伴';
      default: return '未知角色';
    }
  };

  return (
    <div className="w-full md:w-68 bg-canvas-alt border-b md:border-b-0 md:border-r border-brand-camel/40 flex flex-col md:min-h-screen shrink-0 p-5 justify-between">
      <div className="space-y-6">
        {/* 系統 LOGO 區 */}
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center text-canvas-bg shadow-sm">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-charcoal tracking-wide m-0 p-0 leading-none">
              Aether ERP
            </h1>
            <span className="text-[10px] text-text-charcoal/50 font-medium">
              露福簡單商店系統
            </span>
          </div>
        </div>

        {/* 目前登入使用者資訊顯示區 */}
        <div className="bg-canvas-bg rounded-2xl border border-brand-camel/50 p-4 space-y-2.5 shadow-inner">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-charcoal/60">
            <User className="w-4.5 h-4.5 text-brand-camel" />
            目前登入身分
          </div>
          <div className="space-y-1">
            <div className="font-bold text-text-charcoal text-sm">
              {currentUser.name}
            </div>
            <div className="text-[10px] text-text-charcoal/50 font-mono">
              {currentUser.email}
            </div>
            <div className={`text-[10px] border px-2 py-0.5 rounded-md text-center font-medium mt-1.5 ${getRoleBadgeColor(currentUser.role)}`}>
              權限等級: {getRoleName(currentUser.role)}
            </div>
          </div>
        </div>

        {/* 模組選單連結 */}
        <nav className="space-y-1">
          {filteredMenuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  isActive
                    ? 'bg-brand-primary text-canvas-bg shadow-sm'
                    : 'text-text-charcoal/85 hover:bg-canvas-bg hover:text-brand-primary'
                }`}
              >
                <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-canvas-bg' : 'text-brand-camel'}`} />
                {item.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 底部按鈕 */}
      <div className="mt-8 pt-4 border-t border-brand-camel/30 space-y-2">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 border border-brand-camel bg-canvas-bg hover:bg-canvas-bg/70 text-text-charcoal px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors"
        >
          🚪 登出系統
        </button>
        <button
          onClick={dbService.resetDatabase}
          className="w-full flex items-center justify-center gap-2 border border-brand-accent/30 bg-brand-accent/5 hover:bg-brand-accent/10 text-brand-accent px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重置模擬資料庫
        </button>
        <div className="text-[10px] text-text-charcoal/40 text-center font-mono">
          Antigravity ERP v1.0.0
        </div>
      </div>
    </div>
  );
};
export default Sidebar;
