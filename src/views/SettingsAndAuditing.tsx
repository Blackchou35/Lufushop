// 寵物凍乾與寄賣 ERP - 系統參數設定、手動盤點調整與操作日誌稽核頁面 (含一鍵測試控制台)
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { getDb, getCurrentUser, saveDb, syncDbWithCloud, loadDbFromCloud } from '../lib/db';
import { getSupabaseConfig, saveSupabaseConfig } from '../lib/supabase';
import { SystemConfig, Profile, Warehouse, WarehouseStock, InventoryAdjustment, AuditLog, Material, Product, BomRecipe } from '../types/erp';
import { TestConsole } from '../components/TestConsole';
import { translateChineseName } from '../utils/idTranslator';
import { 
  Settings, UserCheck, ShieldAlert, History, 
  ArrowRightLeft, FileText, CheckCircle, AlertCircle, HelpCircle,
  Pencil, Trash2, X, Plus, Trash, Download, Upload, Database, FileSpreadsheet
} from 'lucide-react';

export const SettingsAndAuditing: React.FC = () => {
  const user = getCurrentUser();
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stocks, setStocks] = useState<WarehouseStock[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // 基礎資料管理狀態
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bomRecipes, setBomRecipes] = useState<BomRecipe[]>([]);
  const [masterTab, setMasterTab] = useState<'material' | 'product' | 'warehouse'>('material');

  // 編輯對象狀態
  const [editingMat, setEditingMat] = useState<Material | null>(null);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [editingProdRecipes, setEditingProdRecipes] = useState<{ material_id: string; quantity_required: number }[]>([]);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);

  // 新增基礎資料狀態
  const [isAddingMat, setIsAddingMat] = useState(false);
  const [newMat, setNewMat] = useState({ material_id: '', name: '', type: 'RAW_WET' as const, category: '蔬菜類', min_stock_alert: 20, is_tax_free: false });
  
  const [isAddingProd, setIsAddingProd] = useState(false);
  const [newProd, setNewProd] = useState({ product_id: '', name: '', sku_spec: '', default_price: 150, min_stock_alert: 30, is_tax_free: false });
  const [newProdRecipes, setNewProdRecipes] = useState<{ material_id: string; quantity_required: number }[]>([]);

  const [isAddingWh, setIsAddingWh] = useState(false);
  const [newWh, setNewWh] = useState({ warehouse_id: '', name: '', type: 'CONSIGNMENT' as const, fee_type: 'NONE' as const, fee_value: 0 });

  // 帳號與權限 CRUD 狀態
  const [isAddingProfile, setIsAddingProfile] = useState(false);
  const [newProfile, setNewProfile] = useState({ id: '', name: '', email: '', role: 'STAFF' as Profile['role'], password: '' });
  const [isProfileIdEdited, setIsProfileIdEdited] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  // 1. 系統參數暫存
  const [taxRate, setTaxRate] = useState('0.05');
  const [yellowDays, setYellowDays] = useState('60');
  const [redDays, setRedDays] = useState('30');
  const [stockMultiplier, setStockMultiplier] = useState('1.0');
  const [loginPasscode, setLoginPasscode] = useState('1234');
  
  // Supabase 雲端同步設定狀態
  const [supabaseConfig, setSupabaseConfig] = useState(() => getSupabaseConfig());
  const [isTestingCloud, setIsTestingCloud] = useState(false);

  // 自動測試控制台收摺
  const [isTestConsoleOpen, setIsTestConsoleOpen] = useState(false);

  // 2. 手動庫存調整表單狀態
  const [adjustmentForm, setAdjustmentForm] = useState({
    warehouseId: '',
    productId: '',
    batchNo: '',
    adjustedQuantity: -1,
    reason: '盤點盈虧'
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadData = () => {
    const cfgs = dbService.getConfigs();
    setConfigs(cfgs);
    
    const tr = cfgs.find(c => c.config_key === 'TAX_RATE')?.config_value || '0.05';
    const yd = cfgs.find(c => c.config_key === 'ALERT_EXPIRY_YELLOW')?.config_value || '60';
    const rd = cfgs.find(c => c.config_key === 'ALERT_EXPIRY_RED')?.config_value || '30';
    const sm = cfgs.find(c => c.config_key === 'STOCK_MULTIPLIER')?.config_value || '1.0';
    const lp = cfgs.find(c => c.config_key === 'LOGIN_PASSCODE')?.config_value || '1234';
    setTaxRate(tr);
    setYellowDays(yd);
    setRedDays(rd);
    setStockMultiplier(sm);
    setLoginPasscode(lp);

    setProfiles(getDb().profiles);
    setWarehouses(dbService.getWarehouses());
    setStocks(dbService.getWarehouseStocks());
    setAdjustments(dbService.getInventoryAdjustments());
    setAuditLogs(dbService.getAuditLogs());
    
    setMaterials(dbService.getMaterials());
    setProducts(dbService.getProducts());
    setBomRecipes(dbService.getBomRecipes());
  };

  useEffect(() => {
    loadData();
  }, []);

  // 儲存系統配置
  const handleSaveConfigs = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      dbService.updateConfig('TAX_RATE', taxRate);
      dbService.updateConfig('ALERT_EXPIRY_YELLOW', yellowDays);
      dbService.updateConfig('ALERT_EXPIRY_RED', redDays);
      dbService.updateConfig('STOCK_MULTIPLIER', stockMultiplier);
      if (user.role === 'SUPER_ADMIN') {
        dbService.updateConfig('LOGIN_PASSCODE', loginPasscode);
      }
      
      setNotification({ type: 'success', message: '系統全局參數配置保存成功！已寫入操作稽核日誌。' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 帳號與權限管理的 CRUD 處理器
  const handleProfileNameChange = (name: string) => {
    if (isProfileIdEdited) {
      setNewProfile(prev => ({ ...prev, name }));
    } else {
      const cleanInitials = translateChineseName(name).join('').toLowerCase();
      const suggestedId = cleanInitials ? `usr_${cleanInitials}` : '';
      setNewProfile(prev => ({ ...prev, name, id: suggestedId }));
    }
  };

  const handleAddProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newProfile.id.trim() || !newProfile.name.trim() || !newProfile.email.trim()) {
        throw new Error('請填寫完整帳號 ID、名稱與 Email！');
      }
      dbService.addProfile({
        id: newProfile.id.trim(),
        name: newProfile.name.trim(),
        email: newProfile.email.trim(),
        role: newProfile.role,
        password: newProfile.password ? newProfile.password.trim() : '1234'
      });
      setNotification({ type: 'success', message: `成功建立帳號 [${newProfile.name}]！` });
      setIsAddingProfile(false);
      setIsProfileIdEdited(false);
      setNewProfile({ id: '', name: '', email: '', role: 'STAFF' as Profile['role'], password: '' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleEditProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    try {
      const updateData: Partial<Profile> = {
        name: editingProfile.name.trim(),
        email: editingProfile.email.trim(),
        role: editingProfile.role
      };
      if (editingProfile.password !== undefined && editingProfile.password.trim() !== '') {
        updateData.password = editingProfile.password.trim();
      }
      dbService.editProfile(editingProfile.id, updateData);
      setNotification({ type: 'success', message: `成功更新帳號 [${editingProfile.name}]！` });
      setEditingProfile(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleDeleteProfile = (profileId: string) => {
    const targetProf = profiles.find(p => p.id === profileId);
    if (!targetProf) return;
    if (!window.confirm(`確定要刪除使用者帳號 [${targetProf.name}] 嗎？刪除後此帳號將無法登入系統。`)) return;
    try {
      dbService.deleteProfile(profileId);
      setNotification({ type: 'success', message: `已成功刪除帳號 [${targetProf.name}]！` });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 提交手動庫存調整 (盤點)
  const handleAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!adjustmentForm.warehouseId || !adjustmentForm.productId || !adjustmentForm.batchNo) {
        throw new Error('請選擇調整分倉、品項與對應批號！');
      }

      dbService.adjustStockManually(
        adjustmentForm.warehouseId,
        adjustmentForm.batchNo,
        adjustmentForm.productId,
        adjustmentForm.adjustedQuantity,
        adjustmentForm.reason
      );

      setNotification({ 
        type: 'success', 
        message: `庫存手動調整完成！已成功記錄變更並更新在庫量。` 
      });

      setAdjustmentForm({
        ...adjustmentForm,
        adjustedQuantity: -1,
        reason: '盤點盈虧'
      });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // --- 物料/商品/分倉 CRUD 事件處理器 ---

  // 新增物料資材
  const handleAddMatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newMat.material_id.trim() || !newMat.name.trim()) {
        throw new Error('請填寫完整物料 ID 與名稱！');
      }
      dbService.addMaterial({
        material_id: newMat.material_id.trim().toUpperCase(),
        name: newMat.name.trim(),
        type: newMat.type,
        category: newMat.category,
        min_stock_alert: Number(newMat.min_stock_alert),
        is_tax_free: !!newMat.is_tax_free
      });
      setNotification({ type: 'success', message: `成功新增物料 [${newMat.name}]！` });
      setIsAddingMat(false);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // A. 物料資材編輯與刪除
  const handleEditMatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMat) return;
    try {
      dbService.editMaterial(editingMat.material_id, {
        name: editingMat.name,
        type: editingMat.type,
        category: editingMat.category,
        min_stock_alert: Number(editingMat.min_stock_alert),
        is_tax_free: !!editingMat.is_tax_free
      });
      setNotification({ type: 'success', message: `成功更新物料 [${editingMat.name}]！` });
      setEditingMat(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleDeleteMat = (id: string) => {
    if (!window.confirm('確定要刪除此物料嗎？刪除後將無法復原。')) return;
    try {
      dbService.deleteMaterial(id);
      setNotification({ type: 'success', message: '已成功刪除該物料資材！' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 新增商品成品與配方
  const handleAddProdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newProd.product_id.trim() || !newProd.name.trim()) {
        throw new Error('請填寫完整商品 ID 與名稱！');
      }
      dbService.addProduct(
        {
          product_id: newProd.product_id.trim().toUpperCase(),
          name: newProd.name.trim(),
          sku_spec: newProd.sku_spec.trim(),
          default_price: Number(newProd.default_price),
          min_stock_alert: Number(newProd.min_stock_alert),
          is_tax_free: !!newProd.is_tax_free
        },
        newProdRecipes
      );
      setNotification({ type: 'success', message: `成功新增商品 [${newProd.name}] 與其 BOM 配方！` });
      setIsAddingProd(false);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // B. 商品成品與 BOM 編輯與刪除
  const handleStartEditProd = (prod: Product) => {
    setEditingProd(prod);
    const recipesForProd = bomRecipes
      .filter(r => r.product_id === prod.product_id)
      .map(r => ({ material_id: r.material_id, quantity_required: r.quantity_required }));
    setEditingProdRecipes(recipesForProd);
  };

  const handleAddRecipeRow = () => {
    setEditingProdRecipes([...editingProdRecipes, { material_id: '', quantity_required: 1 }]);
  };

  const handleRemoveRecipeRow = (idx: number) => {
    setEditingProdRecipes(editingProdRecipes.filter((_, i) => i !== idx));
  };

  const handleRecipeChange = (idx: number, field: 'material_id' | 'quantity_required', val: any) => {
    const next = [...editingProdRecipes];
    next[idx] = { ...next[idx], [field]: val };
    setEditingProdRecipes(next);
  };

  const handleEditProdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProd) return;
    try {
      dbService.editProduct(
        editingProd.product_id,
        {
          name: editingProd.name,
          sku_spec: editingProd.sku_spec,
          default_price: Number(editingProd.default_price),
          min_stock_alert: Number(editingProd.min_stock_alert),
          is_tax_free: !!editingProd.is_tax_free
        },
        editingProdRecipes
      );
      setNotification({ type: 'success', message: `成功更新商品 [${editingProd.name}] 與其 BOM 配方！` });
      setEditingProd(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleDeleteProd = (id: string) => {
    if (!window.confirm('確定要刪除此商品成品嗎？這將會一併刪除其關聯之 BOM 配方。')) return;
    try {
      dbService.deleteProduct(id);
      setNotification({ type: 'success', message: '已成功刪除該商品成品！' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 新增分倉商店
  const handleAddWhSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newWh.warehouse_id.trim() || !newWh.name.trim()) {
        throw new Error('請填寫完整分倉 ID 與名稱！');
      }
      dbService.addWarehouse({
        warehouse_id: newWh.warehouse_id.trim().toUpperCase(),
        name: newWh.name.trim(),
        type: newWh.type,
        fee_type: newWh.fee_type,
        fee_value: Number(newWh.fee_value)
      });
      setNotification({ type: 'success', message: `成功新增分倉商店 [${newWh.name}]！` });
      setIsAddingWh(false);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // C. 合作商店/分倉編輯與刪除
  const handleEditWhSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWh) return;
    try {
      dbService.editWarehouse(editingWh.warehouse_id, {
        name: editingWh.name,
        type: editingWh.type,
        fee_type: editingWh.fee_type,
        fee_value: Number(editingWh.fee_value)
      });
      setNotification({ type: 'success', message: `成功更新分倉/管道 [${editingWh.name}]！` });
      setEditingWh(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const handleDeleteWh = (id: string) => {
    if (id === 'WH_MAIN') {
      alert('無法刪除總部防潮主倉庫！');
      return;
    }
    if (!window.confirm('確定要刪除此合作分倉/管道嗎？')) return;
    try {
      dbService.deleteWarehouse(id);
      setNotification({ type: 'success', message: '已成功刪除該分倉商店！' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // --- Supabase 雲端資料庫同步處理器 ---
  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseConfig.url || !supabaseConfig.anonKey) {
      alert('⚠️ 請先填寫 Supabase URL 與 Anon Key！');
      return;
    }
    try {
      saveSupabaseConfig(supabaseConfig);
      setNotification({ type: 'success', message: '已成功儲存 Supabase 雲端設定！' });
      alert('💾 已成功儲存 Supabase 雲端連線設定！');
      
      // 如果啟用了自動同步，立刻嘗試將目前的本地資料備份上傳一次，作為雲端資料庫初始化
      if (supabaseConfig.autoSync) {
        syncDbWithCloud(getDb())
          .then(() => {
            setNotification({ type: 'success', message: '已成功儲存並同步初始資料至雲端！' });
            alert('📤 雲端資料初始化上傳成功！');
          })
          .catch(err => {
            setNotification({ type: 'error', message: `儲存成功但雲端同步失敗: ${err.message}` });
            alert(`⚠️ 儲存成功，但與雲端同步時失敗：\n${err.message}\n請確認您 Supabase 的 RLS 政策與 SQL 語法是否有正確執行。`);
          });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: `設定失敗: ${err.message}` });
      alert(`❌ 設定失敗: ${err.message}`);
    }
  };

  const handleCopySyncLink = () => {
    if (!supabaseConfig.url || !supabaseConfig.anonKey) {
      alert('⚠️ 請先填寫完整的 Supabase URL 與 Anon Key 才能複製分享連結！');
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}?sb_url=${encodeURIComponent(supabaseConfig.url)}&sb_key=${encodeURIComponent(supabaseConfig.anonKey)}`;
    
    // 優先使用 Web Share API 彈出原生分享 (包含 AirDrop)
    if (navigator.share) {
      navigator.share({
        title: '寵物凍乾 ERP 雲端同步設定',
        text: '點此連結即可在 iPhone/iPad 上一秒自動完成 Supabase 雲端資料庫同步設定！',
        url: shareUrl
      })
      .then(() => console.log('分享成功'))
      .catch(err => {
        // 使用者取消分享不報錯
        if (err.name !== 'AbortError') {
          copyToClipboardFallback(shareUrl);
        }
      });
    } else {
      copyToClipboardFallback(shareUrl);
    }
  };

  const copyToClipboardFallback = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('🔗 已成功複製快速同步連結！\n\n您可以將此連結透過 LINE / WeChat 或 AirDrop 傳送到手機或 iPad 開啟，即可一秒完成設定！');
      })
      .catch(() => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          alert('🔗 已成功複製快速同步連結 (備用通道)！\n\n您可以將此連結透過 LINE / WeChat 或 AirDrop 傳送到手機或 iPad 開啟，即可一秒完成設定！');
        } catch (err) {
          alert('複製連結失敗，請手動複製網址列。');
        }
        document.body.removeChild(textArea);
      });
  };

  const handleManualUploadToCloud = async () => {
    setIsTestingCloud(true);
    try {
      await syncDbWithCloud(getDb());
      setNotification({ type: 'success', message: '已手動將本地資料庫完全上傳至 Supabase 雲端！' });
      alert('📤 成功手動將本地資料上傳至 Supabase 雲端資料庫！');
    } catch (err: any) {
      setNotification({ type: 'error', message: `上傳雲端失敗: ${err.message}` });
      alert(`❌ 上傳雲端失敗：\n${err.message}`);
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleManualDownloadFromCloud = async () => {
    if (!confirm('⚠️ 警告：從雲端載入資料庫將會完全「覆蓋並清除」您這台設備目前的本地資料！\n\n確定要繼續嗎？')) {
      return;
    }
    setIsTestingCloud(true);
    try {
      const cloudDb = await loadDbFromCloud();
      if (cloudDb) {
        setNotification({ type: 'success', message: '已成功從 Supabase 下載並還原最新資料庫！系統即將重新載入...' });
        alert('📥 已成功從雲端下載最新資料庫！系統將自動重新載入網頁...');
        window.location.reload();
      } else {
        setNotification({ type: 'error', message: '從雲端載入失敗，請確認您的雲端資料庫已有資料且連線金鑰正確。' });
        alert('❌ 從雲端載入失敗！\n\n請確認您的雲端資料庫中已經有先前上傳的資料，且 Project URL 與 Anon Key 是正確的。');
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: `從雲端下載失敗: ${err.message}` });
      alert(`❌ 從雲端下載失敗：\n${err.message}`);
    } finally {
      setIsTestingCloud(false);
    }
  };

  // --- 資料備份與復原處理器 ---
  const handleExportDb = () => {
    const db = getDb();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    downloadAnchor.setAttribute("download", `aether_erp_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setNotification({ type: 'success', message: '系統資料庫 JSON 備份檔案下載成功！' });
  };

  const handleImportDb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsedDb = JSON.parse(event.target?.result as string);
          const requiredKeys = ['profiles', 'materials', 'products', 'bom_recipes', 'inventory_batches', 'warehouses', 'warehouse_stocks', 'sales_orders', 'sales_order_items', 'system_configs', 'inventory_adjustments', 'audit_logs'];
          const hasAllKeys = requiredKeys.every(k => k in parsedDb);
          if (!hasAllKeys) {
            throw new Error('匯入的 JSON 檔案結構不符，缺少核心資料表！');
          }
          saveDb(parsedDb);
          setNotification({ type: 'success', message: '資料庫復原成功！系統將在 1.5 秒後自動重新載入頁面...' });
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (err: any) {
          setNotification({ type: 'error', message: `還原失敗：${err.message}` });
        }
      };
    }
  };

  const handleResetDb = () => {
    if (!window.confirm('確定要載入測試模擬資料嗎？這將會覆寫目前的資料庫，並還原預設的模擬測試數據（包含測試雞胸肉、牛肉、南瓜分裝及銷售對帳單）！')) return;
    dbService.resetDatabase();
    setNotification({ type: 'success', message: '模擬測試資料載入成功！系統將在 1.5 秒後自動重新載入頁面...' });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleClearDb = () => {
    if (!window.confirm('⚠️ 重大警告：確定要清空所有營運資料嗎？這將會刪除所有自訂的原物料、商品規格、BOM配方、庫存批次與對帳單，使系統恢復全新空白乾淨狀態！此操作不可復原！')) return;
    dbService.clearDatabase();
    setNotification({ type: 'success', message: '資料庫清空成功！系統將在 1.5 秒後自動重新載入頁面...' });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  // --- 日誌匯出與清空處理器 ---
  const handleExportLogsCsv = () => {
    try {
      const headers = ['日誌編號', '操作時間', '操作人', '動作類型', '異動資料表', '項目ID', '備註內容'];
      const rows = auditLogs.map(log => {
        const executor = profiles.find(p => p.id === log.user_id);
        const executorName = executor ? executor.name : log.user_id;
        const actionName = getActionName(log.action_type);
        return [
          log.log_id,
          new Date(log.created_at).toLocaleString('zh-TW'),
          executorName,
          actionName,
          log.target_table,
          log.target_id,
          log.reason || '無備註說明'
        ];
      });

      const csvContent = [
        '\uFEFF' + headers.join(','),
        ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `aether_erp_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setNotification({ type: 'success', message: '操作稽核日誌 CSV 匯出成功！' });
    } catch (err: any) {
      setNotification({ type: 'error', message: `匯出失敗：${err.message}` });
    }
  };

  const handleClearAuditLogs = () => {
    if (user.role !== 'SUPER_ADMIN') {
      alert('僅最高管理者有權限清空稽核日誌！');
      return;
    }
    if (!window.confirm('警告：確定要清空並歸檔歷史日誌嗎？這將會刪除當前所有的修改歷史，僅保留一筆歸檔紀錄！')) return;
    try {
      const db = getDb();
      db.audit_logs = [
        {
          log_id: 1,
          user_id: user.id,
          action_type: 'UPDATE_CONFIG',
          target_table: 'audit_logs',
          target_id: 'ALL',
          old_values: null,
          new_values: null,
          reason: `操作日誌歷史歸檔清空，由最高管理者 [${user.name}] 於 ${new Date().toLocaleString('zh-TW')} 執行歸檔。`,
          created_at: new Date().toISOString()
        }
      ];
      saveDb(db);
      setNotification({ type: 'success', message: '歷史日誌已清空並完成歸檔！' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'UNLOCK_ORDER':
        return 'bg-warm-red/20 text-warm-red border-warm-red/40';
      case 'ADJUST_STOCK':
        return 'bg-warm-yellow/20 text-warm-yellow border-warm-yellow/40';
      case 'UPDATE_COST':
        return 'bg-brand-accent/20 text-brand-accent border-brand-accent/40';
      default:
        return 'bg-brand-primary/20 text-brand-primary border-brand-primary/40';
    }
  };

  const getActionName = (action: string) => {
    switch (action) {
      case 'UNLOCK_ORDER': return '解鎖帳單';
      case 'ADJUST_STOCK': return '手動調整庫存';
      case 'UPDATE_COST': return '修改商品成本';
      case 'UPDATE_CONFIG': return '更新系統設定';
      case 'CREATE_PRODUCT': return '新增成品';
      case 'CREATE_MATERIAL': return '新增原料';
      case 'ADD_STOCK': return '生產成品';
      default: return action;
    }
  };

  return (
    <div className="space-y-6">
      {/* 標頭 */}
      <div>
        <h2 className="text-2xl font-black text-text-charcoal flex items-center gap-2">
          ⚙️ 後台設定與修改紀錄
        </h2>
        <p className="text-sm text-text-charcoal/70">
          在這裡可以設定稅率、調整黃紅燈警示天數，管理夥伴的權限，或是手動修改庫存與記錄調整原因。下方的修改紀錄（日誌流）會完整保存所有對帳單解鎖與庫存調整的足跡。
        </p>
      </div>

      {/* 通知 */}
      {notification && (
        <div className={`p-4 rounded-xl border flex gap-3 text-sm ${
          notification.type === 'success' ? 'bg-warm-green/10 border-warm-green/45 text-text-charcoal' : 'bg-warm-red/10 border-warm-red/45 text-text-charcoal'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-warm-green shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-warm-red shrink-0 mt-0.5" />
          )}
          <div className="font-medium">{notification.message}</div>
        </div>
      )}

      {/* 第一區：參數設定與人員角色 (並排) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. 系統參數管理 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-brand-primary" />
            一般參數設定
          </h3>
          
          <form onSubmit={handleSaveConfigs} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">預估營業稅率 (如 0.05)</label>
                <input
                  type="number"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">安全水位倍率係數</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={stockMultiplier}
                  onChange={(e) => setStockMultiplier(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  placeholder="如 1.0 或 1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">黃燈到期前警告 (天)</label>
                <input
                  type="number"
                  value={yellowDays}
                  onChange={(e) => setYellowDays(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">紅燈到期前警告 (天)</label>
                <input
                  type="number"
                  value={redDays}
                  onChange={(e) => setRedDays(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>
            </div>

            <div className="bg-brand-primary/5 border border-brand-primary/25 rounded-xl p-3.5 text-xs text-text-charcoal/80 leading-relaxed">
              💡 <strong>安全設定提示：</strong> 系統登入門戶密碼已全面升級為<strong>「個人獨立密碼」</strong>。若需要修改或重設任何同仁（包含您自己）的登入密碼，請直接於下方「權限與帳號管理」列表中點選對應帳號右側的 ✏️ <strong>編輯按鈕</strong> 進行重設。
            </div>

            <button
              type="submit"
              className="w-full bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
            >
              儲存參數設定
            </button>
          </form>
        </div>

        {/* 2. 用戶權限與帳號管理面板 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
            <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
              <UserCheck className="w-4.5 h-4.5 text-brand-camel" />
              權限與帳號管理
            </h3>
            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
              <button
                onClick={() => {
                  setIsAddingProfile(true);
                  setNewProfile({ id: '', name: '', email: '', role: 'STAFF', password: '' });
                  setIsProfileIdEdited(false);
                }}
                className="bg-brand-primary text-canvas-bg text-[10px] font-bold py-1.5 px-3 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> 新增帳號
              </button>
            )}
          </div>
          
          <div className="space-y-2.5 max-h-52 overflow-y-auto">
            {profiles.map(p => (
              <div key={p.id} className="bg-canvas-bg border border-brand-camel/30 rounded-xl p-3 flex justify-between items-center text-xs">
                <div>
                  <div className="flex items-center">
                    <span className="font-bold text-text-charcoal">{p.name}</span>
                    {p.role === 'SUPER_ADMIN' && (
                      <span className="bg-brand-accent/10 text-brand-accent text-[9px] font-bold px-1.5 py-0.5 rounded border border-brand-accent/20 ml-2">最高管理</span>
                    )}
                    {p.role === 'ADMIN' && (
                      <span className="bg-brand-primary/10 text-brand-primary text-[9px] font-bold px-1.5 py-0.5 rounded border border-brand-primary/20 ml-2">管理員</span>
                    )}
                    {p.role === 'STAFF' && (
                      <span className="bg-warm-blue/10 text-warm-blue text-[9px] font-bold px-1.5 py-0.5 rounded border border-warm-blue/20 ml-2">現場員工</span>
                    )}
                    {p.role === 'PARTNER' && (
                      <span className="bg-brand-camel/20 text-text-charcoal/70 text-[9px] font-bold px-1.5 py-0.5 rounded border border-brand-camel/30 ml-2">合作商店</span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-charcoal/50 block font-mono mt-0.5">{p.email} <span className="text-[9px] text-text-charcoal/30 font-sans">({p.id})</span></span>
                </div>
                
                <div className="inline-flex gap-2">
                  {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                    <>
                      <button
                        onClick={() => setEditingProfile(p)}
                        className="p-1.5 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                        title="編輯帳號與角色"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(p.id)}
                        className="p-1.5 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                        title="刪除帳號"
                        disabled={p.id === user.id}
                        style={{ opacity: p.id === user.id ? 0.35 : 1 }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN' && (
            <div className="text-[10px] text-brand-accent bg-brand-accent/5 border border-brand-accent/15 rounded-lg p-2.5 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              僅管理員與最高管理者能維護管理帳號與變更權限角色。
            </div>
          )}
        </div>

      </div>

      {/* 備份與還原面板 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
          <Database className="w-4.5 h-4.5 text-brand-primary" />
          資料備份與系統復原工具
        </h3>
        <p className="text-xs text-text-charcoal/70 leading-relaxed">
          為了防範瀏覽器自動清除 LocalStorage 導致資料遺失，您可以定期下載資料庫備份。系統也支援一鍵還原或重置為出廠設定。
        </p>
        <div className="flex flex-wrap gap-3.5">
          <button
            onClick={handleExportDb}
            className="flex items-center gap-1.5 bg-brand-primary text-canvas-bg text-xs font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-sm"
          >
            <Download className="w-4 h-4" /> 下載 JSON 資料庫備份
          </button>
          
          <label className="flex items-center gap-1.5 bg-brand-camel text-text-charcoal text-xs font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity cursor-pointer shadow-sm border border-brand-camel/30">
            <Upload className="w-4 h-4" /> 匯入復原資料庫 (JSON)
            <input
              type="file"
              accept=".json"
              onChange={handleImportDb}
              className="hidden"
            />
          </label>

          {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
            <>
              <button
                onClick={handleClearDb}
                className="flex items-center gap-1.5 bg-warm-red/10 border border-warm-red/30 text-warm-red text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-warm-red/20 transition-colors shadow-sm"
              >
                <Trash className="w-4 h-4" /> 🧹 清空所有營運資料 (全新空白)
              </button>

              <button
                onClick={handleResetDb}
                className="flex items-center gap-1.5 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-brand-primary/20 transition-colors shadow-sm"
              >
                <Database className="w-4 h-4" /> 🎁 載入測試模擬資料 (預設數據)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Supabase 雲端資料庫同步設定面板 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4 text-xs">
        <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
          <Database className="w-4.5 h-4.5 text-brand-primary" />
          🌐 Supabase 雲端即時同步設定
        </h3>
        <p className="text-xs text-text-charcoal/70 leading-relaxed">
          輸入您的 Supabase 連線資訊以將這台設備的資料與雲端自動同步，實現電腦與手機/iPad 的跨裝置資料雙向連線。
        </p>

        <form onSubmit={handleSaveSupabaseConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1 text-text-charcoal/70">1. Supabase Project URL</label>
              <input
                type="text"
                placeholder="例如: https://xxxxxx.supabase.co"
                value={supabaseConfig.url}
                onChange={(e) => setSupabaseConfig({ ...supabaseConfig, url: e.target.value.trim() })}
                className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-text-charcoal/70">2. Supabase Anon Key (公用金鑰)</label>
              <input
                type="password"
                placeholder="請貼上 anon public 金鑰..."
                value={supabaseConfig.anonKey}
                onChange={(e) => setSupabaseConfig({ ...supabaseConfig, anonKey: e.target.value.trim() })}
                className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono tracking-widest text-center"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-canvas-bg p-3.5 rounded-xl border border-brand-camel/30 max-w-fit">
            <input
              type="checkbox"
              id="chkAutoSync"
              checked={supabaseConfig.autoSync}
              onChange={(e) => setSupabaseConfig({ ...supabaseConfig, autoSync: e.target.checked })}
              className="w-4 h-4 cursor-pointer accent-brand-primary"
            />
            <label htmlFor="chkAutoSync" className="font-semibold text-text-charcoal/80 cursor-pointer select-none">
              開啟「自動即時雲端同步」(每次修改資料將自動寫入雲端，開機自動下載更新)
            </label>
          </div>

          <div className="flex flex-wrap gap-3.5 pt-2">
            <button
              type="submit"
              className="bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-sm"
            >
              💾 儲存並連接雲端
            </button>

            {supabaseConfig.url && supabaseConfig.anonKey && (
              <>
                <button
                  type="button"
                  onClick={handleManualUploadToCloud}
                  disabled={isTestingCloud}
                  className="bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-bold py-2.5 px-4 rounded-xl hover:bg-brand-primary/20 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isTestingCloud ? '同步中...' : '📤 手動上傳：將本地覆蓋至雲端'}
                </button>

                <button
                  type="button"
                  onClick={handleManualDownloadFromCloud}
                  disabled={isTestingCloud}
                  className="bg-brand-camel/20 border border-brand-camel/40 text-text-charcoal font-bold py-2.5 px-4 rounded-xl hover:bg-brand-camel/30 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isTestingCloud ? '載入中...' : '📥 手動下載：將雲端覆蓋至本地'}
                </button>

                <button
                  type="button"
                  onClick={handleCopySyncLink}
                  className="bg-brand-camel text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity shadow-sm"
                >
                  🔗 複製手機/iPad 快速同步連結
                </button>
              </>
            )}
          </div>
        </form>

        <div className="bg-brand-primary/5 border border-brand-primary/15 rounded-xl p-4 leading-relaxed space-y-2 mt-4 text-[11px] text-text-charcoal/70 text-left">
          <div className="font-bold text-text-charcoal text-xs">💡 首次建立 Supabase 指南 (SQL Editor 語法)</div>
          <div>在您建立好 Supabase 專案後，請前往左側選單的 **SQL Editor** ➔ 貼上並執行 (Run) 以下 SQL 語句建立資料表，系統才能正常連線：</div>
          <pre className="bg-canvas-bg p-3 rounded-lg border border-brand-camel/30 text-[10px] text-brand-primary font-mono overflow-x-auto max-h-40 text-left select-all cursor-pointer" title="點擊三下可全選">
{`create table erp_sync_store (
  id integer primary key default 1,
  db_json jsonb not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

insert into erp_sync_store (id, db_json) 
values (1, '{"profiles":[], "materials":[], "products":[], "bom_recipes":[], "inventory_batches":[], "warehouses":[], "warehouse_stocks":[], "sales_orders":[], "sales_order_items":[], "system_configs":[], "inventory_adjustments":[], "audit_logs":[]}')
on conflict (id) do nothing;

alter table erp_sync_store enable row level security;
create policy "Allow public read and write" on erp_sync_store for all using (true) with check (true);`}
          </pre>
        </div>
      </div>

      {/* 基礎資料維護 (CRUD) 區 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-camel/20 pb-3">
          <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-brand-primary" />
            基礎資料維護管理 (編輯與刪除)
          </h3>
          {/* 子頁籤與新增按鈕 */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5 bg-canvas-bg p-1 rounded-xl border border-brand-camel/30 text-[11px] font-bold">
              <button
                onClick={() => setMasterTab('material')}
                className={`px-3 py-1 rounded-lg transition-colors ${masterTab === 'material' ? 'bg-brand-primary text-canvas-bg' : 'text-text-charcoal/70 hover:text-brand-primary'}`}
              >
                原料與耗材資材
              </button>
              <button
                onClick={() => setMasterTab('product')}
                className={`px-3 py-1 rounded-lg transition-colors ${masterTab === 'product' ? 'bg-brand-primary text-canvas-bg' : 'text-text-charcoal/70 hover:text-brand-primary'}`}
              >
                商品規格與 BOM
              </button>
              <button
                onClick={() => setMasterTab('warehouse')}
                className={`px-3 py-1 rounded-lg transition-colors ${masterTab === 'warehouse' ? 'bg-brand-primary text-canvas-bg' : 'text-text-charcoal/70 hover:text-brand-primary'}`}
              >
                通路與分倉商店
              </button>
            </div>

            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
              <button
                onClick={() => {
                  if (masterTab === 'material') {
                    setIsAddingMat(true);
                    setNewMat({ material_id: '', name: '', type: 'RAW_WET', category: '蔬菜類', min_stock_alert: 20, is_tax_free: false });
                  } else if (masterTab === 'product') {
                    setIsAddingProd(true);
                    setNewProd({ product_id: '', name: '', sku_spec: '', default_price: 150, min_stock_alert: 30, is_tax_free: false });
                    setNewProdRecipes([]);
                  } else if (masterTab === 'warehouse') {
                    setIsAddingWh(true);
                    setNewWh({ warehouse_id: '', name: '', type: 'CONSIGNMENT', fee_type: 'NONE', fee_value: 0 });
                  }
                }}
                className="bg-brand-primary text-canvas-bg text-[11px] font-bold py-1.5 px-3 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> 新增{masterTab === 'material' ? '物料' : masterTab === 'product' ? '商品成品' : '分倉商店'}
              </button>
            )}
          </div>
        </div>

        {/* 物料管理清單 */}
        {masterTab === 'material' && (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-text-charcoal">
              <thead>
                <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50">
                  <th className="py-2.5 px-3">物料 ID</th>
                  <th className="py-2.5 px-3">名稱</th>
                  <th className="py-2.5 px-3">類型</th>
                  <th className="py-2.5 px-3">分類</th>
                  <th className="py-2.5 px-3 text-right">警示水位</th>
                  <th className="py-2.5 px-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-camel/15">
                {materials.map(m => (
                  <tr key={m.material_id} className="hover:bg-canvas-bg/35">
                    <td className="py-2.5 px-3 font-mono text-[10px] text-text-charcoal/60">{m.material_id}</td>
                    <td className="py-2.5 px-3 font-bold">{m.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="bg-brand-primary/10 text-brand-primary text-[10px] px-1.5 py-0.5 rounded">
                        {m.type === 'RAW_WET' ? '生鮮原料' : m.type === 'RAW_DRY' ? '乾半成品' : '消耗包材'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{m.category}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-brand-accent">
                      {m.min_stock_alert} {m.type === 'CONSUMABLE' ? '個' : 'KG'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => setEditingMat(m)}
                          className="p-1 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                          title="編輯物料"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteMat(m.material_id)}
                          className="p-1 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                          title="刪除物料"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 商品與 BOM 管理清單 */}
        {masterTab === 'product' && (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-text-charcoal">
              <thead>
                <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50">
                  <th className="py-2.5 px-3">商品 ID</th>
                  <th className="py-2.5 px-3">品項名稱</th>
                  <th className="py-2.5 px-3">規格</th>
                  <th className="py-2.5 px-3 text-right">預設零售價</th>
                  <th className="py-2.5 px-3 text-right">警示水位</th>
                  <th className="py-2.5 px-3">BOM 配方內容</th>
                  <th className="py-2.5 px-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-camel/15">
                {products.map(p => {
                  const recipes = bomRecipes.filter(r => r.product_id === p.product_id);
                  return (
                    <tr key={p.product_id} className="hover:bg-canvas-bg/35">
                      <td className="py-2.5 px-3 font-mono text-[10px] text-text-charcoal/60">{p.product_id}</td>
                      <td className="py-2.5 px-3 font-bold">{p.name}</td>
                      <td className="py-2.5 px-3 text-text-charcoal/60">{p.sku_spec}</td>
                      <td className="py-2.5 px-3 text-right font-mono">${p.default_price}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-brand-primary">{p.min_stock_alert} 包</td>
                      <td className="py-2.5 px-3 max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {recipes.length === 0 ? (
                            <span className="text-[10px] text-warm-red bg-warm-red/10 px-1.5 py-0.5 rounded font-bold">無配方</span>
                          ) : (
                            recipes.map((r, idx) => {
                              const mat = materials.find(m => m.material_id === r.material_id);
                              return (
                                <span key={idx} className="bg-canvas-bg border border-brand-camel/35 text-[9px] px-1.5 py-0.5 rounded text-text-charcoal/70">
                                  {mat?.name || r.material_id} × {r.quantity_required}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleStartEditProd(p)}
                            className="p-1 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                            title="編輯商品與配方"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteProd(p.product_id)}
                            className="p-1 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                            title="刪除商品"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分倉/合作商店管理清單 */}
        {masterTab === 'warehouse' && (
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left text-text-charcoal">
              <thead>
                <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50">
                  <th className="py-2.5 px-3">倉庫 ID</th>
                  <th className="py-2.5 px-3">店名/管道名稱</th>
                  <th className="py-2.5 px-3">類型</th>
                  <th className="py-2.5 px-3">通路費方式</th>
                  <th className="py-2.5 px-3 text-right">通路費率/金額</th>
                  <th className="py-2.5 px-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-camel/15">
                {warehouses.map(w => (
                  <tr key={w.warehouse_id} className="hover:bg-canvas-bg/35">
                    <td className="py-2.5 px-3 font-mono text-[10px] text-text-charcoal/60">{w.warehouse_id}</td>
                    <td className="py-2.5 px-3 font-bold">{w.name}</td>
                    <td className="py-2.5 px-3">
                      <span className="bg-brand-camel/20 text-text-charcoal text-[10px] px-1.5 py-0.5 rounded font-medium">
                        {w.type === 'CONSIGNMENT' ? '線下寄賣點' : w.type === 'PLATFORM' ? '線上電商平台' : '總部直營倉'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">{w.fee_type === 'FLAT' ? '每包固定扣費' : w.fee_type === 'PERCENT' ? '電商比例抽成' : '免通路費'}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      {w.fee_type === 'PERCENT' ? `${(w.fee_value * 100).toFixed(1)}%` : w.fee_type === 'FLAT' ? `$${w.fee_value}` : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => setEditingWh(w)}
                          className="p-1 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                          title="編輯分倉"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {w.warehouse_id !== 'WH_MAIN' && (
                          <button
                            onClick={() => handleDeleteWh(w.warehouse_id)}
                            className="p-1 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                            title="刪除分倉"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 第二區：手動盤點與庫存調整表單 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
          <ArrowRightLeft className="w-4.5 h-4.5 text-brand-accent" />
          手動修正庫存與損耗登記 (盤點)
        </h3>

        <form onSubmit={handleAdjustmentSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          <div>
            <label className="block font-semibold mb-1 text-text-charcoal/75">1. 選擇倉庫/商店</label>
            <select
              value={adjustmentForm.warehouseId}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, warehouseId: e.target.value })}
              className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              required
            >
              <option value="">-- 選擇倉庫/商店 --</option>
              {warehouses.map(w => (
                <option key={w.warehouse_id} value={w.warehouse_id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-text-charcoal/75">2. 選擇商品或原料</label>
            <select
              value={adjustmentForm.productId}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, productId: e.target.value, batchNo: '' })}
              className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              required
            >
              <option value="">-- 選擇商品或原料 --</option>
              {/* 同時列出成品與物料資材 */}
              <optgroup label="成品商品 (包)">
                {getDb().products.map(p => (
                  <option key={p.product_id} value={p.product_id}>{p.name}</option>
                ))}
              </optgroup>
              <optgroup label="原料/耗材 (KG/個)">
                {getDb().materials.map(m => (
                  <option key={m.material_id} value={m.material_id}>{m.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-text-charcoal/75">3. 選擇批號</label>
            <select
              value={adjustmentForm.batchNo}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, batchNo: e.target.value })}
              className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              required
            >
              <option value="">-- 選擇批號 --</option>
              {/* 篩選與所選品項及倉儲對應的在庫批次 */}
              {stocks
                .filter(s => s.warehouse_id === adjustmentForm.warehouseId && s.product_or_material_id === adjustmentForm.productId)
                .map(s => {
                  const dbBatches = getDb().inventory_batches || [];
                  const b = dbBatches.find(batch => batch.batch_no === s.batch_no && batch.item_id === s.product_or_material_id);
                  const dateInfo = b ? ` | 效期: ${b.expiry_date}` : '';
                  return (
                    <option key={s.batch_no} value={s.batch_no}>
                      批號: {s.batch_no} (在庫: {s.quantity}{dateInfo})
                    </option>
                  );
                })}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1 text-text-charcoal/75">調整數量 (增加填正數，減少填負數)</label>
            <input
              type="number"
              placeholder="如 -3 代表減少3包, 5代表增加5KG"
              value={adjustmentForm.adjustedQuantity}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, adjustedQuantity: Number(e.target.value) })}
              className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
              required
            />
          </div>

          <div>
            <label className="block font-semibold mb-1 text-text-charcoal/75">請選擇調整原因</label>
            <select
              value={adjustmentForm.reason}
              onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
              className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
            >
              <option value="盤點盈虧">盤盈盤虧 (庫存數量不對)</option>
              <option value="過期銷毀">過期銷毀 (商品過期)</option>
              <option value="碎料損耗">碎料損耗 (商品包裝破損)</option>
              <option value="登記錯誤修正">登記錯誤修正</option>
            </select>
          </div>

          <div className="lg:col-span-5 pt-2">
            <button
              type="submit"
              className="w-full bg-brand-accent text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
            >
              確認調整庫存並記錄日誌
            </button>
          </div>
        </form>
      </div>

      {/* 第三區：稽核日誌流 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-camel/20 pb-3">
          <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
            <History className="w-5 h-5 text-brand-primary" />
            防修改日誌流 (所有修改歷史)
          </h3>
          <div className="flex gap-2 text-[11px] font-bold">
            <button
              onClick={handleExportLogsCsv}
              className="flex items-center gap-1 bg-brand-camel border border-brand-camel/40 text-text-charcoal px-3 py-1.5 rounded-xl hover:bg-canvas-bg transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-brand-primary" /> 匯出日誌 CSV
            </button>
            {user.role === 'SUPER_ADMIN' && (
              <button
                onClick={handleClearAuditLogs}
                className="flex items-center gap-1 bg-warm-red/10 border border-warm-red/25 text-warm-red px-3 py-1.5 rounded-xl hover:bg-warm-red/20 transition-colors shadow-sm"
              >
                <Trash className="w-3.5 h-3.5" /> 清空歸檔歷史日誌
              </button>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-text-charcoal">
            <thead>
              <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50">
                <th className="py-2.5 px-3">操作時間</th>
                <th className="py-2.5 px-3">操作人</th>
                <th className="py-2.5 px-3">動作類型</th>
                <th className="py-2.5 px-3">修改的表單</th>
                <th className="py-2.5 px-3">修改的項目 ID</th>
                <th className="py-2.5 px-3">修改原因與詳細內容</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-camel/15">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-text-charcoal/45">目前沒有任何修改日誌。</td>
                </tr>
              ) : (
                auditLogs.map(log => {
                  const executor = profiles.find(p => p.id === log.user_id);
                  return (
                    <tr key={log.log_id} className="hover:bg-canvas-bg/35">
                      <td className="py-2.5 px-3 font-mono text-[10px] text-text-charcoal/65">
                        {new Date(log.created_at).toLocaleString('zh-TW')}
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        {executor ? executor.name : log.user_id}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center border text-[9px] px-2 py-0.5 rounded font-medium ${getActionBadgeColor(log.action_type)}`}>
                          {getActionName(log.action_type)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-text-charcoal/60 text-[10px]">{log.target_table}</td>
                      <td className="py-2.5 px-3 font-mono text-text-charcoal/80 font-semibold">{log.target_id}</td>
                      <td className="py-2.5 px-3 text-text-charcoal/80 leading-normal max-w-sm">
                        {log.reason || '無備註說明'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 第四區：一鍵自動化測試與除錯控制台 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsTestConsoleOpen(!isTestConsoleOpen)}>
          <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2 select-none">
            🚀 系統功能自動化測試控制台
          </h3>
          <span className="text-xs text-text-charcoal/50 font-bold">
            {isTestConsoleOpen ? '收摺 ▲' : '展開 ▼'}
          </span>
        </div>
        
        {isTestConsoleOpen && (
          <div className="border-t border-brand-camel/20 pt-4">
            <TestConsole />
          </div>
        )}
      </div>

      {/* 編輯物料 Modal */}
      {editingMat && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-brand-primary" />
                編輯物料基礎設定
              </h3>
              <button onClick={() => setEditingMat(null)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleEditMatSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料名稱</label>
                <input
                  type="text"
                  value={editingMat.name}
                  onChange={(e) => setEditingMat({ ...editingMat, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料類型</label>
                <select
                  value={editingMat.type}
                  onChange={(e) => setEditingMat({ ...editingMat, type: e.target.value as any })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="RAW_WET">生鮮原料 (需代工烘乾)</option>
                  <option value="RAW_DRY">乾半成品 (做貨直接包裝)</option>
                  <option value="CONSUMABLE">消耗耗材 (袋、標籤、乾燥劑)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料分類</label>
                <select
                  value={editingMat.category}
                  onChange={(e) => setEditingMat({ ...editingMat, category: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="蔬菜類">蔬菜類</option>
                  <option value="肉類">肉類</option>
                  <option value="海鮮類">海鮮類</option>
                  <option value="包材類">包材類</option>
                  <option value="貼紙類">貼紙類</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">安全水位警示天數/數量</label>
                <input
                  type="number"
                  value={editingMat.min_stock_alert}
                  onChange={(e) => setEditingMat({ ...editingMat, min_stock_alert: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="edit_is_tax_free_mat"
                  checked={!!editingMat.is_tax_free}
                  onChange={(e) => setEditingMat({ ...editingMat, is_tax_free: e.target.checked })}
                  className="w-4 h-4 rounded border-brand-camel text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <label htmlFor="edit_is_tax_free_mat" className="font-bold text-text-charcoal/75 cursor-pointer">
                  農產品免稅品項 (營業稅 0%)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMat(null)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯商品 Modal */}
      {editingProd && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-brand-primary" />
                編輯商品規格與 BOM 配方
              </h3>
              <button onClick={() => setEditingProd(null)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleEditProdSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">商品名稱</label>
                  <input
                    type="text"
                    value={editingProd.name}
                    onChange={(e) => setEditingProd({ ...editingProd, name: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">包裝規格</label>
                  <input
                    type="text"
                    value={editingProd.sku_spec}
                    onChange={(e) => setEditingProd({ ...editingProd, sku_spec: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">預設零售單價 ($)</label>
                  <input
                    type="number"
                    value={editingProd.default_price}
                    onChange={(e) => setEditingProd({ ...editingProd, default_price: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">安全庫存警戒量 (包)</label>
                  <input
                    type="number"
                    value={editingProd.min_stock_alert}
                    onChange={(e) => setEditingProd({ ...editingProd, min_stock_alert: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="edit_is_tax_free_prod"
                  checked={!!editingProd.is_tax_free}
                  onChange={(e) => setEditingProd({ ...editingProd, is_tax_free: e.target.checked })}
                  className="w-4 h-4 rounded border-brand-camel text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <label htmlFor="edit_is_tax_free_prod" className="font-bold text-text-charcoal/75 cursor-pointer">
                  農產品免稅品項 (營業稅 0%)
                </label>
              </div>

              {/* BOM 配方動態管理 */}
              <div className="space-y-2.5 border-t border-brand-camel/20 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-text-charcoal text-[11px] block">BOM 配方原料/耗材比例設定</span>
                  <button
                    type="button"
                    onClick={handleAddRecipeRow}
                    className="flex items-center gap-1 text-brand-primary font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> ➕ 增加消耗列
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {editingProdRecipes.map((r, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={r.material_id}
                        onChange={(e) => handleRecipeChange(idx, 'material_id', e.target.value)}
                        className="flex-1 bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal text-[11px]"
                        required
                      >
                        <option value="">-- 選擇消耗原料/包材 --</option>
                        {materials.map(m => (
                          <option key={m.material_id} value={m.material_id}>
                            {m.name} ({m.type === 'CONSUMABLE' ? '包材' : '半成品'})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="消耗量..."
                        value={r.quantity_required}
                        onChange={(e) => handleRecipeChange(idx, 'quantity_required', Number(e.target.value))}
                        className="w-24 bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono text-center text-[11px]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipeRow(idx)}
                        className="p-1.5 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {editingProdRecipes.length === 0 && (
                    <p className="text-[10px] text-text-charcoal/50 text-center py-2">目前沒有設定任何 BOM 配方，量產時將不會自動扣庫。</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingProd(null)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  儲存商品配方
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯分倉 Modal */}
      {editingWh && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-brand-primary" />
                編輯合作分倉與費率
              </h3>
              <button onClick={() => setEditingWh(null)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleEditWhSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">分倉/商店名稱</label>
                <input
                  type="text"
                  value={editingWh.name}
                  onChange={(e) => setEditingWh({ ...editingWh, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">通路費率類型</label>
                <select
                  value={editingWh.fee_type}
                  onChange={(e) => setEditingWh({ ...editingWh, fee_type: e.target.value as any })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="FLAT">FLAT (固定每包扣費)</option>
                  <option value="PERCENT">PERCENT (電商抽成比例)</option>
                  <option value="NONE">NONE (無通路費)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">費率設定值 (元 或 比例)</label>
                <input
                  type="number"
                  step="0.001"
                  value={editingWh.fee_value}
                  onChange={(e) => setEditingWh({ ...editingWh, fee_value: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">分倉商店類型</label>
                <select
                  value={editingWh.type}
                  onChange={(e) => setEditingWh({ ...editingWh, type: e.target.value as any })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="CONSIGNMENT">線下據點寄賣點</option>
                  <option value="PLATFORM">平台線上電商</option>
                  <option value="INTERNAL">公司內部實體倉</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWh(null)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增物料 Modal */}
      {isAddingMat && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-brand-primary" />
                新增物料資材
              </h3>
              <button onClick={() => setIsAddingMat(false)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleAddMatSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料 ID (如 MAT_EGG)</label>
                <input
                  type="text"
                  placeholder="限英文與底線，如 MAT_EGG"
                  value={newMat.material_id}
                  onChange={(e) => setNewMat({ ...newMat, material_id: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料名稱</label>
                <input
                  type="text"
                  placeholder="如：生鮮雞蛋"
                  value={newMat.name}
                  onChange={(e) => setNewMat({ ...newMat, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料類型</label>
                <select
                  value={newMat.type}
                  onChange={(e) => setNewMat({ ...newMat, type: e.target.value as any })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="RAW_WET">生鮮原料 (需代工烘乾)</option>
                  <option value="RAW_DRY">乾半成品 (做貨直接包裝)</option>
                  <option value="CONSUMABLE">消耗耗材 (袋、標籤、乾燥劑)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">物料分類</label>
                <select
                  value={newMat.category}
                  onChange={(e) => setNewMat({ ...newMat, category: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="蔬菜類">蔬菜類</option>
                  <option value="肉類">肉類</option>
                  <option value="海鮮類">海鮮類</option>
                  <option value="包材類">包材類</option>
                  <option value="貼紙類">貼紙類</option>
                  <option value="其他">其他</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">安全水位警示天數/數量</label>
                <input
                  type="number"
                  value={newMat.min_stock_alert}
                  onChange={(e) => setNewMat({ ...newMat, min_stock_alert: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="add_is_tax_free_mat"
                  checked={newMat.is_tax_free}
                  onChange={(e) => setNewMat({ ...newMat, is_tax_free: e.target.checked })}
                  className="w-4 h-4 rounded border-brand-camel text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <label htmlFor="add_is_tax_free_mat" className="font-bold text-text-charcoal/75 cursor-pointer">
                  農產品免稅品項 (營業稅 0%)
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingMat(false)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增商品 Modal */}
      {isAddingProd && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-brand-primary" />
                新增商品規格與 BOM 配方
              </h3>
              <button onClick={() => setIsAddingProd(false)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleAddProdSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">商品 ID (如 PROD_EGG)</label>
                  <input
                    type="text"
                    placeholder="限英文與底線，如 PROD_EGG"
                    value={newProd.product_id}
                    onChange={(e) => setNewProd({ ...newProd, product_id: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono uppercase"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">商品名稱</label>
                  <input
                    type="text"
                    placeholder="如：產地直送鮮雞蛋"
                    value={newProd.name}
                    onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">包裝規格</label>
                  <input
                    type="text"
                    placeholder="如：10顆裝"
                    value={newProd.sku_spec}
                    onChange={(e) => setNewProd({ ...newProd, sku_spec: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">預設零售單價 ($)</label>
                  <input
                    type="number"
                    value={newProd.default_price}
                    onChange={(e) => setNewProd({ ...newProd, default_price: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">安全庫存警戒量 (包)</label>
                  <input
                    type="number"
                    value={newProd.min_stock_alert}
                    onChange={(e) => setNewProd({ ...newProd, min_stock_alert: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="add_is_tax_free_prod"
                  checked={newProd.is_tax_free}
                  onChange={(e) => setNewProd({ ...newProd, is_tax_free: e.target.checked })}
                  className="w-4 h-4 rounded border-brand-camel text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <label htmlFor="add_is_tax_free_prod" className="font-bold text-text-charcoal/75 cursor-pointer">
                  農產品免稅品項 (營業稅 0%)
                </label>
              </div>

              {/* BOM 配方動態管理 */}
              <div className="space-y-2.5 border-t border-brand-camel/20 pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-text-charcoal text-[11px] block">BOM 配方原料/耗材比例設定</span>
                  <button
                    type="button"
                    onClick={() => setNewProdRecipes([...newProdRecipes, { material_id: '', quantity_required: 1 }])}
                    className="flex items-center gap-1 text-brand-primary font-bold hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> ➕ 增加消耗列
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {newProdRecipes.map((r, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={r.material_id}
                        onChange={(e) => {
                          const next = [...newProdRecipes];
                          next[idx].material_id = e.target.value;
                          setNewProdRecipes(next);
                        }}
                        className="flex-1 bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal text-[11px]"
                        required
                      >
                        <option value="">-- 選擇消耗原料/包材 --</option>
                        {materials.map(m => (
                          <option key={m.material_id} value={m.material_id}>
                            {m.name} ({m.type === 'CONSUMABLE' ? '包材' : '半成品'})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="消耗量..."
                        value={r.quantity_required}
                        onChange={(e) => {
                          const next = [...newProdRecipes];
                          next[idx].quantity_required = Number(e.target.value);
                          setNewProdRecipes(next);
                        }}
                        className="w-24 bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono text-center text-[11px]"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setNewProdRecipes(newProdRecipes.filter((_, i) => i !== idx))}
                        className="p-1.5 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {newProdRecipes.length === 0 && (
                    <p className="text-[10px] text-text-charcoal/50 text-center py-2">目前沒有設定任何 BOM 配方，量產時將不會自動扣庫。</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddingProd(false)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增分倉 Modal */}
      {isAddingWh && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-brand-primary" />
                新增合作分倉商店
              </h3>
              <button onClick={() => setIsAddingWh(false)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleAddWhSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">分倉 ID (如 WH_VET_XYZ)</label>
                <input
                  type="text"
                  placeholder="限英文與底線，如 WH_VET_XYZ"
                  value={newWh.warehouse_id}
                  onChange={(e) => setNewWh({ ...newWh, warehouse_id: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">分倉/商店名稱</label>
                <input
                  type="text"
                  placeholder="如：信義寵物沙龍"
                  value={newWh.name}
                  onChange={(e) => setNewWh({ ...newWh, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">分倉商店類型</label>
                <select
                  value={newWh.type}
                  onChange={(e) => setNewWh({ ...newWh, type: e.target.value as any })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="CONSIGNMENT">線下據點寄賣點</option>
                  <option value="PLATFORM">平台線上電商</option>
                  <option value="INTERNAL">公司內部實體倉</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">通路費率類型</label>
                <select
                  value={newWh.fee_type}
                  onChange={(e) => setNewWh({ ...newWh, fee_type: e.target.value as any })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="FLAT">FLAT (固定每包扣費)</option>
                  <option value="PERCENT">PERCENT (電商抽成比例)</option>
                  <option value="NONE">NONE (無通路費)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">費率設定值 (元 或 比例)</label>
                <input
                  type="number"
                  step="0.001"
                  value={newWh.fee_value}
                  onChange={(e) => setNewWh({ ...newWh, fee_value: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingWh(false)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增帳號 Modal */}
      {isAddingProfile && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-brand-primary" />
                新增系統帳號與權限
              </h3>
              <button onClick={() => setIsAddingProfile(false)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleAddProfileSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">中文姓名</label>
                <input
                  type="text"
                  placeholder="如：出貨專員-小美"
                  value={newProfile.name}
                  onChange={(e) => handleProfileNameChange(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">帳號 ID (如 usr_xiaomei)</label>
                <input
                  type="text"
                  placeholder="限小寫英文與底線"
                  value={newProfile.id}
                  onChange={(e) => {
                    setNewProfile({ ...newProfile, id: e.target.value });
                    setIsProfileIdEdited(true);
                  }}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">電子信箱 Email</label>
                <input
                  type="email"
                  placeholder="xiaomei@antigravity.pet"
                  value={newProfile.email}
                  onChange={(e) => setNewProfile({ ...newProfile, email: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">權限角色級別</label>
                <select
                  value={newProfile.role}
                  onChange={(e) => setNewProfile({ ...newProfile, role: e.target.value as Profile['role'] })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="SUPER_ADMIN">最高管理者 (Super Admin)</option>
                  <option value="ADMIN">一般管理員 (Admin)</option>
                  <option value="STAFF">現場員工 (Staff)</option>
                  <option value="PARTNER">合作商店帳號 (Partner)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">登入密碼 (留空預設為 1234)</label>
                <input
                  type="password"
                  placeholder="請輸入密碼..."
                  value={newProfile.password}
                  onChange={(e) => setNewProfile({ ...newProfile, password: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingProfile(false)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯帳號 Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-text-charcoal/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-canvas-alt border border-brand-camel/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-brand-primary" />
                編輯帳號與權限變更
              </h3>
              <button onClick={() => setEditingProfile(null)} className="text-text-charcoal/40 hover:text-text-charcoal">
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleEditProfileSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">帳號 ID (不可變更)</label>
                <input
                  type="text"
                  value={editingProfile.id}
                  disabled
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono opacity-60"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">中文姓名</label>
                <input
                  type="text"
                  value={editingProfile.name}
                  onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">電子信箱 Email</label>
                <input
                  type="email"
                  value={editingProfile.email}
                  onChange={(e) => setEditingProfile({ ...editingProfile, email: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">權限角色級別</label>
                <select
                  value={editingProfile.role}
                  onChange={(e) => setEditingProfile({ ...editingProfile, role: e.target.value as Profile['role'] })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="SUPER_ADMIN">最高管理者 (Super Admin)</option>
                  <option value="ADMIN">一般管理員 (Admin)</option>
                  <option value="STAFF">現場員工 (Staff)</option>
                  <option value="PARTNER">合作商店帳號 (Partner)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">重設密碼 (留空則不修改)</label>
                <input
                  type="password"
                  placeholder="請輸入新密碼..."
                  value={editingProfile.password || ''}
                  onChange={(e) => setEditingProfile({ ...editingProfile, password: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="w-1/2 border border-brand-camel text-text-charcoal/70 font-semibold py-2 rounded-xl hover:bg-canvas-bg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg font-bold py-2 rounded-xl hover:opacity-90 transition-opacity"
                >
                  確認儲存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SettingsAndAuditing;
