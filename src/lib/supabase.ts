import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 用於儲存 Supabase 金鑰的 LocalStorage Key
export const SUPABASE_CONFIG_KEY = 'pet_freeze_dried_erp_supabase_config';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
}

let supabaseInstance: SupabaseClient | null = null;

// 取得目前的 Supabase 設定
export const getSupabaseConfig = (): SupabaseConfig => {
  const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // 忽略錯誤
    }
  }
  return { url: '', anonKey: '', autoSync: false };
};

// 儲存 Supabase 設定並重置 Client 實例
export const saveSupabaseConfig = (config: SupabaseConfig): void => {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
  supabaseInstance = null; // 重置以重新初始化
};

// 取得 Supabase 用戶端實例
export const getSupabase = (): SupabaseClient | null => {
  if (supabaseInstance) return supabaseInstance;

  const config = getSupabaseConfig();
  if (config.url && config.anonKey) {
    try {
      // 防呆網址格式化：去除尾部的斜線 '/' 與多餘的 '/rest/v1' 路徑
      let cleanUrl = config.url.trim();
      cleanUrl = cleanUrl.replace(/\/rest\/v1\/?$/, '');
      if (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.slice(0, -1);
      }

      supabaseInstance = createClient(cleanUrl, config.anonKey);
      return supabaseInstance;
    } catch (e) {
      console.error('Supabase 初始化失敗', e);
      return null;
    }
  }
  return null;
};
