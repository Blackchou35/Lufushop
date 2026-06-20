// 寵物凍乾與寄賣 ERP - 系統進入點主架構元件
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { LoginGate } from './components/LoginGate';
import { Dashboard } from './views/Dashboard';
import { ProductionManager } from './views/ProductionManager';
import { PricingSimulator } from './views/PricingSimulator';
import { WarehouseManager } from './views/WarehouseManager';
import { ConsignmentReconciliation } from './views/ConsignmentReconciliation';
import { SettingsAndAuditing } from './views/SettingsAndAuditing';
import { getCurrentUser } from './lib/db';
import { ShieldAlert, Menu, X, Calendar } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [refreshKey, setRefreshKey] = useState(0); // 用於切換角色時刷新全局視窗數據
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // 啟動時自動從雲端載入並同步本地資料庫，並且解析快捷分享連結
  useEffect(() => {
    const parseUrlConfig = () => {
      const params = new URLSearchParams(window.location.search);
      const url = params.get('sb_url');
      const key = params.get('sb_key');
      if (url && key) {
        try {
          const config = {
            url: decodeURIComponent(url),
            anonKey: decodeURIComponent(key),
            autoSync: true
          };
          localStorage.setItem('pet_freeze_dried_erp_supabase_config', JSON.stringify(config));
          alert('✨ 已成功透過快速同步連結設定 Supabase 雲端資料庫！系統將自動載入雲端資料並重新整理...');
          // 清除網址列參數，避免重複提示
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
          return true;
        } catch (err) {
          console.error('解析快速同步連結失敗', err);
        }
      }
      return false;
    };

    if (parseUrlConfig()) return;

    const initCloudDb = async () => {
      try {
        const { loadDbFromCloud } = await import('./lib/db');
        const cloudDb = await loadDbFromCloud();
        if (cloudDb) {
          setCurrentUser(getCurrentUser());
          setRefreshKey(prev => prev + 1);
        }
      } catch (e) {
        console.error('背景自動載入雲端資料庫失敗：', e);
      }
    };
    initCloudDb();
  }, []);
  
  // 管理登入狀態：若 localStorage 中沒有紀錄，則初始為 null
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('pet_freeze_dried_erp_current_user');
    return saved ? getCurrentUser() : null;
  });

  // 登入處理
  const handleLogin = (userId: string) => {
    localStorage.setItem('pet_freeze_dried_erp_current_user', userId);
    setCurrentUser(getCurrentUser());
    setRefreshKey(prev => prev + 1);
  };

  // 登出處理
  const handleLogout = () => {
    localStorage.removeItem('pet_freeze_dried_erp_current_user');
    setCurrentUser(null);
    setActiveTab('dashboard'); // 登出後重置分頁為儀表板
  };

  // 登入角色變更回呼 (測試主控台等使用)
  const handleUserChange = () => {
    setCurrentUser(getCurrentUser());
    setRefreshKey(prev => prev + 1);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard key={refreshKey} />;
      case 'production':
        return <ProductionManager key={refreshKey} />;
      case 'pricing':
        return <PricingSimulator key={refreshKey} />;
      case 'warehouse':
        return <WarehouseManager key={refreshKey} />;
      case 'reconciliation':
        return <ConsignmentReconciliation key={refreshKey} />;
      case 'settings':
        return <SettingsAndAuditing key={refreshKey} />;
      default:
        return <Dashboard key={refreshKey} />;
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard': return '營運數據中心';
      case 'production': return '生產加工與成本';
      case 'pricing': return '多方案定價模擬';
      case 'warehouse': return '庫存調撥與倉儲';
      case 'reconciliation': return '銷售紀錄與對帳';
      case 'settings': return '系統後台設定';
      default: return '營運數據中心';
    }
  };

  // 尚未登入時，顯示全屏登入門戶
  if (!currentUser) {
    return <LoginGate onLogin={handleLogin} />;
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-canvas-bg text-text-charcoal antialiased">
      
      {/* 側邊導覽列 (列印時隱藏) */}
      <div className="no-print hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          onUserChange={handleUserChange} 
          onLogout={handleLogout}
        />
      </div>

      {/* 手機板頂部 Header */}
      <div className="no-print md:hidden bg-canvas-alt border-b border-brand-camel/30 p-4 flex justify-between items-center z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-primary flex items-center justify-center text-canvas-bg font-bold">
            L
          </div>
          <div>
            <h1 className="text-sm font-black m-0 leading-none">Aether ERP</h1>
            <span className="text-[9px] text-text-charcoal/50">露福簡單商店系統</span>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="text-brand-primary p-1 rounded hover:bg-canvas-bg"
        >
          {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* 手機板抽屜式選單 */}
      {isMobileOpen && (
        <div className="no-print md:hidden fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs z-30" onClick={() => setIsMobileOpen(false)}>
          <div className="w-68 bg-canvas-alt h-full p-5 shadow-lg flex flex-col justify-between" onClick={e => e.stopPropagation()}>
            <Sidebar 
              activeTab={activeTab} 
              setActiveTab={(tab) => {
                setActiveTab(tab);
                setIsMobileOpen(false);
              }} 
              onUserChange={handleUserChange} 
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      {/* 右側主工作區 */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* 頂部營運狀態條 (列印時隱藏) */}
        <header className="no-print bg-canvas-bg border-b border-brand-camel/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">
              System Console
            </span>
            <h2 className="text-lg font-black text-text-charcoal m-0 p-0 leading-none">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 bg-canvas-alt border border-brand-camel/30 px-3 py-1.5 rounded-xl font-medium text-text-charcoal/75">
              <Calendar className="w-4 h-4 text-brand-camel" />
              營運基準日: 2026-06-06 (六)
            </div>
            
            <div className="bg-brand-primary/10 border border-brand-primary/20 text-brand-primary px-3 py-1.5 rounded-xl font-bold">
              登入者: {currentUser.name}
            </div>
          </div>
        </header>

        {/* 核心工作畫布 */}
        <main className="flex-1 p-6 overflow-y-auto print:p-0">
          <div className="max-w-6.5xl mx-auto print:max-w-none">
            {renderActiveView()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
