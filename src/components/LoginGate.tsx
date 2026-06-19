// 寵物凍乾與寄賣 ERP - 全屏登入門戶組件
import React, { useState, useEffect } from 'react';
import { getDb } from '../lib/db';
import { Profile } from '../types/erp';
import { dbService } from '../services/dbService';
import { Layers, Key, AlertCircle, User, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';

interface LoginGateProps {
  onLogin: (userId: string) => void;
}

type LoginMode = 'login' | 'forgot_password' | 'recovery_super_admin' | 'recovery_regular';

export const LoginGate: React.FC<LoginGateProps> = ({ onLogin }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // 忘記密碼與救援狀態
  const [mode, setMode] = useState<LoginMode>('login');
  const [recoveryAccount, setRecoveryAccount] = useState('');
  const [recoveryUser, setRecoveryUser] = useState<Profile | null>(null);
  const [rescueCode, setRescueCode] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // 讀取最新的帳號設定
  const loadProfiles = () => {
    try {
      const db = getDb();
      setProfiles(db.profiles || []);
    } catch (e) {
      console.error('無法讀取用戶設定檔', e);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, [mode]);

  // 處理一般登入
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetUser = username.trim().toLowerCase();
    const user = profiles.find(
      p => p.id.toLowerCase() === targetUser || p.email.toLowerCase() === targetUser
    );

    if (!user) {
      setError('帳號或密碼輸入錯誤，請重新確認！');
      return;
    }

    const userPassword = user.password || '1234';
    if (password === userPassword) {
      onLogin(user.id);
    } else {
      setError('帳號或密碼輸入錯誤，請重新確認！');
    }
  };

  // 處理尋找找回密碼帳號
  const handleFindAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const targetUser = recoveryAccount.trim().toLowerCase();
    const user = profiles.find(
      p => p.id.toLowerCase() === targetUser || p.email.toLowerCase() === targetUser
    );

    if (!user) {
      setError('查無此帳號，請重新輸入！');
      return;
    }

    setRecoveryUser(user);
    if (user.role === 'SUPER_ADMIN') {
      setMode('recovery_super_admin');
    } else {
      setMode('recovery_regular');
    }
  };

  // 處理最高管理者超級救援密碼
  const handleRescueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (rescueCode.trim() === 'OwnerReset9999') {
      try {
        if (recoveryUser) {
          dbService.resetPassword(recoveryUser.id, '1234');
          setResetSuccess(true);
        } else {
          setError('系統錯誤，查無最高管理者資料。');
        }
      } catch (err: any) {
        setError(err.message || '重設密碼失敗！');
      }
    } else {
      setError('超級救援金鑰錯誤，請重新確認！');
    }
  };

  // 重設狀態並返回登入頁
  const handleResetToLogin = () => {
    setUsername('');
    setPassword('');
    setRecoveryAccount('');
    setRecoveryUser(null);
    setRescueCode('');
    setResetSuccess(false);
    setError(null);
    setMode('login');
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-brand-accent/15 text-brand-accent border-brand-accent/30';
      case 'ADMIN': return 'bg-brand-primary/15 text-brand-primary border-brand-primary/30';
      case 'STAFF': return 'bg-warm-blue/15 text-warm-blue border-warm-blue/30';
      default: return 'bg-brand-camel/15 text-brand-camel border-brand-camel/30';
    }
  };

  const getRoleName = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return '最高管理者 (Super Admin)';
      case 'ADMIN': return '管理員 (Admin)';
      case 'STAFF': return '現場員工 (Staff)';
      case 'PARTNER': return '合作商店夥伴 (Partner)';
      default: return '未知權限';
    }
  };

  return (
    <div className="min-h-screen bg-canvas-bg flex flex-col justify-center items-center p-6 select-none relative overflow-hidden font-sans">
      {/* 背景裝飾微光效果 */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-brand-primary/5 blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-brand-accent/5 blur-3xl" />

      <div className="w-full max-w-md space-y-7 z-10">
        
        {/* LOGO 與系統標題 */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-brand-primary items-center justify-center text-canvas-bg shadow-md mb-2 hover:scale-105 transition-transform duration-300">
            <Layers className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-text-charcoal tracking-wide">
            露福簡單商店系統
          </h1>
          <p className="text-xs text-text-charcoal/50 font-semibold tracking-wider uppercase">
            Aether ERP Cloud Mock System v1.0.0
          </p>
        </div>

        {/* 錯誤提示 */}
        {error && (
          <div className="bg-warm-red/10 border border-warm-red/45 text-text-charcoal rounded-xl p-3 text-xs flex gap-2 items-center shadow-xs animate-pulse">
            <AlertCircle className="w-4.5 h-4.5 text-warm-red shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* 1. 一般登入介面 */}
        {mode === 'login' && (
          <div className="bg-canvas-alt border border-brand-camel/30 rounded-2xl p-6 shadow-md space-y-5">
            <div className="space-y-1.5 text-center">
              <h2 className="text-lg font-bold text-text-charcoal">工作平台登入</h2>
              <p className="text-xs text-text-charcoal/60">請輸入您的帳密以進行先進先出庫存對帳</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text-charcoal/70 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-camel" />
                  帳號 ID 或 電子郵件 (Email)
                </label>
                <input
                  type="text"
                  placeholder="如: usr_super_admin 或 owner@antigravity.pet"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-xl px-3.5 py-2.5 text-text-charcoal focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-text-charcoal/70 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-brand-camel" />
                    登入密碼
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setMode('forgot_password');
                    }}
                    className="text-[10px] text-brand-primary font-bold hover:underline"
                  >
                    忘記密碼？
                  </button>
                </div>
                <input
                  type="password"
                  placeholder="請輸入密碼..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-xl px-3.5 py-2.5 text-text-charcoal focus:outline-none focus:ring-1 focus:ring-brand-primary text-center tracking-widest text-xs font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 text-xs shadow-sm"
              >
                確認登入系統 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-xl p-3 text-[11px] text-text-charcoal/70 leading-relaxed space-y-2">
              <div className="font-bold flex items-center gap-1 text-xs">💡 測試快速登入：</div>
              <div className="grid grid-cols-1 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setUsername('usr_super_admin');
                    setPassword('1234');
                  }}
                  className="w-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-bold py-1.5 px-3 rounded-lg text-[10px] hover:bg-brand-primary hover:text-canvas-bg transition-all text-center cursor-pointer"
                >
                  ⚡ 一鍵帶入：最高管理者 (usr_super_admin)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsername('usr_staff');
                    setPassword('1234');
                  }}
                  className="w-full bg-brand-camel/15 border border-brand-camel/30 text-text-charcoal font-bold py-1.5 px-3 rounded-lg text-[10px] hover:bg-brand-camel hover:text-canvas-bg transition-all text-center cursor-pointer"
                >
                  ⚡ 一鍵帶入：現場員工 (usr_staff)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. 忘記密碼：輸入帳號 */}
        {mode === 'forgot_password' && (
          <div className="bg-canvas-alt border border-brand-camel/30 rounded-2xl p-6 shadow-md space-y-5 animate-fade-in">
            <div className="space-y-1.5 text-center">
              <h2 className="text-lg font-bold text-text-charcoal">找回與重設密碼</h2>
              <p className="text-xs text-text-charcoal/60">請輸入需要找回的帳號以驗證對應的救援程序</p>
            </div>

            <form onSubmit={handleFindAccountSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-text-charcoal/70 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-camel" />
                  請輸入 帳號 ID 或 電子郵件
                </label>
                <input
                  type="text"
                  placeholder="請輸入帳號..."
                  value={recoveryAccount}
                  onChange={(e) => setRecoveryAccount(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-xl px-3.5 py-2.5 text-text-charcoal focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                  required
                  autoFocus
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleResetToLogin}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2.5 rounded-xl hover:bg-canvas-bg transition-colors text-xs"
                >
                  返回登入
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity text-xs"
                >
                  下一步
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 3. 一般同仁忘記密碼提示 */}
        {mode === 'recovery_regular' && recoveryUser && (
          <div className="bg-canvas-alt border border-brand-camel/30 rounded-2xl p-6 shadow-md space-y-5">
            <div className="space-y-2.5 text-center">
              <Lock className="w-10 h-10 text-brand-camel mx-auto" />
              <h2 className="text-lg font-bold text-text-charcoal">無法自行重設密碼</h2>
            </div>

            <div className="bg-canvas-bg border border-brand-camel/30 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center border-b border-brand-camel/15 pb-2">
                <span className="font-semibold text-text-charcoal/65 font-mono">{recoveryUser.id}</span>
                <span className={`text-[9px] border px-2 py-0.5 rounded font-bold ${getRoleBadgeColor(recoveryUser.role)}`}>
                  {getRoleName(recoveryUser.role).split(' ')[0]}
                </span>
              </div>
              <div className="text-text-charcoal/80 font-bold">{recoveryUser.name}</div>
              <div className="text-[10px] text-text-charcoal/50 font-mono leading-none">{recoveryUser.email}</div>
            </div>

            <div className="bg-brand-accent/5 border border-brand-accent/30 rounded-xl p-4 text-xs text-text-charcoal/85 leading-relaxed">
              ⚠️ <strong>安全提示：</strong> 本帳號為一般同仁帳號。基於安全保護，現場人員及外部合作夥伴無法自行於前端重設密碼。
              <div className="mt-2 font-bold text-brand-primary">請聯繫系統最高管理者（創辦人-阿銘），在後台「系統設定與修改紀錄」中協助您重新設定密碼。</div>
            </div>

            <button
              onClick={handleResetToLogin}
              className="w-full bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity text-xs shadow-sm"
            >
              返回登入畫面
            </button>
          </div>
        )}

        {/* 4. 最高管理者救援密碼重設 */}
        {mode === 'recovery_super_admin' && recoveryUser && (
          <div className="bg-canvas-alt border border-brand-camel/30 rounded-2xl p-6 shadow-md space-y-5">
            {!resetSuccess ? (
              <>
                <div className="space-y-1.5 text-center">
                  <h2 className="text-lg font-bold text-text-charcoal">最高管理者密碼救援</h2>
                  <p className="text-xs text-text-charcoal/60">請輸入最高管理者專屬的「超級救援金鑰」以進行密碼重設</p>
                </div>

                <div className="bg-canvas-bg border border-brand-camel/30 rounded-xl p-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-brand-primary">{recoveryUser.name}</span>
                    <span className={`text-[9px] border px-2 py-0.5 rounded font-bold ${getRoleBadgeColor(recoveryUser.role)}`}>
                      最高權限
                    </span>
                  </div>
                </div>

                <form onSubmit={handleRescueSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-text-charcoal/70 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-brand-accent" />
                      最高管理者救援金鑰
                    </label>
                    <input
                      type="password"
                      placeholder="請輸入超級救援金鑰..."
                      value={rescueCode}
                      onChange={(e) => setRescueCode(e.target.value)}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-xl px-3.5 py-2.5 text-text-charcoal focus:outline-none focus:ring-1 focus:ring-brand-accent text-center tracking-widest text-xs font-mono"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleResetToLogin}
                      className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2.5 rounded-xl hover:bg-canvas-bg transition-colors text-xs"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="w-1/2 bg-brand-accent text-canvas-bg font-bold py-2.5 rounded-xl hover:opacity-90 transition-opacity text-xs"
                    >
                      驗證並重設密碼
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="space-y-5 text-center py-2 animate-fade-in">
                <CheckCircle2 className="w-12 h-12 text-brand-primary mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-text-charcoal">🎉 密碼重設成功！</h3>
                  <p className="text-xs text-text-charcoal/70 leading-relaxed px-2">
                    最高管理者密碼已重設為預設值 <strong className="font-mono text-brand-primary text-sm">1234</strong>。請返回登入畫面使用新密碼登入，並請於登入後在系統設定內重新修改為您專屬的安全密碼。
                  </p>
                </div>

                <button
                  onClick={handleResetToLogin}
                  className="w-full bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity text-xs shadow-sm"
                >
                  返回登入頁面
                </button>
              </div>
            )}
          </div>
        )}
        
      </div>
    </div>
  );
};

export default LoginGate;
