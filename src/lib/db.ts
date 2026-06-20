// 寵物凍乾與寄賣 ERP - 本地 Mock 資料庫 (模擬 Supabase/PostgreSQL CRUD 與 RLS 權限)
import { 
  Profile, Material, Product, BomRecipe, InventoryBatch, 
  Warehouse, WarehouseStock, SalesOrder, SalesOrderItem, 
  SystemConfig, InventoryAdjustment, AuditLog, UserRole,
  ProcessingJob
} from '../types/erp';

import { getSupabase, getSupabaseConfig } from './supabase';

interface ErpDatabase {
  profiles: Profile[];
  materials: Material[];
  products: Product[];
  bom_recipes: BomRecipe[];
  inventory_batches: InventoryBatch[];
  warehouses: Warehouse[];
  warehouse_stocks: WarehouseStock[];
  sales_orders: SalesOrder[];
  sales_order_items: SalesOrderItem[];
  system_configs: SystemConfig[];
  inventory_adjustments: InventoryAdjustment[];
  audit_logs: AuditLog[];
  processing_jobs: ProcessingJob[];
}

const LOCAL_STORAGE_KEY = 'pet_freeze_dried_erp_db';
const CURRENT_USER_KEY = 'pet_freeze_dried_erp_current_user';

// 初始測試帳號
export const DEFAULT_PROFILES: Profile[] = [
  { id: 'usr_super_admin', email: 'owner@antigravity.pet', role: 'SUPER_ADMIN', name: '創辦人-阿銘', password: '1234', created_at: new Date().toISOString() },
  { id: 'usr_admin', email: 'manager@antigravity.pet', role: 'ADMIN', name: '廠長-小華', password: '1234', created_at: new Date().toISOString() },
  { id: 'usr_staff', email: 'staff@antigravity.pet', role: 'STAFF', name: '現場人員-大雄', password: '1234', created_at: new Date().toISOString() },
  { id: 'usr_partner', email: 'vet@gaomei.pet', role: 'PARTNER', name: '高美醫院-陳院長', password: '1234', created_at: new Date().toISOString() },
];

// 初始化資料庫種子數據
const INITIAL_DATABASE: ErpDatabase = {
  profiles: DEFAULT_PROFILES,
  materials: [
    { material_id: 'MAT_WET_CHICKEN', name: '生鮮大成雞胸肉', type: 'RAW_WET', category: '肉類', min_stock_alert: 20, created_at: new Date().toISOString() },
    { material_id: 'MAT_WET_BEEF', name: '生鮮澳洲草飼牛', type: 'RAW_WET', category: '肉類', min_stock_alert: 20, created_at: new Date().toISOString() },
    { material_id: 'MAT_DRY_CHICKEN', name: '雞肉乾肉半成品', type: 'RAW_DRY', category: '肉類', min_stock_alert: 5, created_at: new Date().toISOString() },
    { material_id: 'MAT_DRY_BEEF', name: '牛肉乾肉半成品', type: 'RAW_DRY', category: '肉類', min_stock_alert: 5, created_at: new Date().toISOString() },
    { material_id: 'MAT_BAG_S', name: '防潮小夾鏈袋', type: 'CONSUMABLE', category: '包材類', min_stock_alert: 100, created_at: new Date().toISOString() },
    { material_id: 'MAT_BAG_L', name: '防潮大夾鏈袋', type: 'CONSUMABLE', category: '包材類', min_stock_alert: 100, created_at: new Date().toISOString() },
    { material_id: 'MAT_CAN_L', name: '拉環食品易開罐', type: 'CONSUMABLE', category: '包材類', min_stock_alert: 100, created_at: new Date().toISOString() },
    { material_id: 'MAT_DESICCANT', name: '食品級乾燥劑', type: 'CONSUMABLE', category: '其他', min_stock_alert: 200, created_at: new Date().toISOString() },
    { material_id: 'MAT_STICKER', name: '品牌標籤貼紙', type: 'CONSUMABLE', category: '貼紙類', min_stock_alert: 200, created_at: new Date().toISOString() },
  ],
  products: [
    { product_id: 'PROD_CHICKEN_S', name: '極鮮雞肉凍乾 (小包)', sku_spec: '小包100g', default_price: 150, min_stock_alert: 30, created_at: new Date().toISOString() },
    { product_id: 'PROD_CHICKEN_L', name: '極鮮雞肉凍乾 (大包)', sku_spec: '大包500g', default_price: 600, min_stock_alert: 15, created_at: new Date().toISOString() },
    { product_id: 'PROD_BEEF_S', name: '極鮮牛肉凍乾 (小包)', sku_spec: '小包100g', default_price: 180, min_stock_alert: 30, created_at: new Date().toISOString() },
  ],
  bom_recipes: [
    { recipe_id: 1, product_id: 'PROD_CHICKEN_S', material_id: 'MAT_DRY_CHICKEN', quantity_required: 0.1 },
    { recipe_id: 2, product_id: 'PROD_CHICKEN_S', material_id: 'MAT_BAG_S', quantity_required: 1 },
    { recipe_id: 3, product_id: 'PROD_CHICKEN_S', material_id: 'MAT_DESICCANT', quantity_required: 1 },
    { recipe_id: 4, product_id: 'PROD_CHICKEN_S', material_id: 'MAT_STICKER', quantity_required: 2 },
    { recipe_id: 5, product_id: 'PROD_CHICKEN_L', material_id: 'MAT_DRY_CHICKEN', quantity_required: 0.5 },
    { recipe_id: 6, product_id: 'PROD_CHICKEN_L', material_id: 'MAT_BAG_L', quantity_required: 1 },
    { recipe_id: 7, product_id: 'PROD_CHICKEN_L', material_id: 'MAT_DESICCANT', quantity_required: 1 },
    { recipe_id: 8, product_id: 'PROD_CHICKEN_L', material_id: 'MAT_STICKER', quantity_required: 2 },
    { recipe_id: 9, product_id: 'PROD_BEEF_S', material_id: 'MAT_DRY_BEEF', quantity_required: 0.1 },
    { recipe_id: 10, product_id: 'PROD_BEEF_S', material_id: 'MAT_BAG_S', quantity_required: 1 },
    { recipe_id: 11, product_id: 'PROD_BEEF_S', material_id: 'MAT_DESICCANT', quantity_required: 1 },
    { recipe_id: 12, product_id: 'PROD_BEEF_S', material_id: 'MAT_STICKER', quantity_required: 2 },
  ],
  inventory_batches: [
    { batch_no: 'LOT-20260501-CHICK-WET', item_id: 'MAT_WET_CHICKEN', item_type: 'MATERIAL', manufacture_date: '2026-05-01', expiry_date: '2026-11-01', unit_cost: 120, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260515-BEEF-WET', item_id: 'MAT_WET_BEEF', item_type: 'MATERIAL', manufacture_date: '2026-05-15', expiry_date: '2026-11-15', unit_cost: 200, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260501-BAG-S', item_id: 'MAT_BAG_S', item_type: 'MATERIAL', manufacture_date: '2026-05-01', expiry_date: '2029-05-01', unit_cost: 2, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260501-BAG-L', item_id: 'MAT_BAG_L', item_type: 'MATERIAL', manufacture_date: '2026-05-01', expiry_date: '2029-05-01', unit_cost: 5, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260501-CAN-L', item_id: 'MAT_CAN_L', item_type: 'MATERIAL', manufacture_date: '2026-05-01', expiry_date: '2029-05-01', unit_cost: 10, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260501-DESI', item_id: 'MAT_DESICCANT', item_type: 'MATERIAL', manufacture_date: '2026-05-01', expiry_date: '2028-05-01', unit_cost: 0.5, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260501-STICK', item_id: 'MAT_STICKER', item_type: 'MATERIAL', manufacture_date: '2026-05-01', expiry_date: '2028-05-01', unit_cost: 1, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260510-CHICK-DRY', item_id: 'MAT_DRY_CHICKEN', item_type: 'MATERIAL', manufacture_date: '2026-05-10', expiry_date: '2026-11-10', unit_cost: 480, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260520-BEEF-DRY', item_id: 'MAT_DRY_BEEF', item_type: 'MATERIAL', manufacture_date: '2026-05-20', expiry_date: '2026-11-20', unit_cost: 750, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260512-CHICK-S-01', item_id: 'PROD_CHICKEN_S', item_type: 'PRODUCT', manufacture_date: '2026-05-12', expiry_date: '2026-11-12', unit_cost: 55, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260525-CHICK-L-01', item_id: 'PROD_CHICKEN_L', item_type: 'PRODUCT', manufacture_date: '2026-05-25', expiry_date: '2026-11-25', unit_cost: 250, created_at: new Date().toISOString() },
    { batch_no: 'LOT-20260522-BEEF-S-01', item_id: 'PROD_BEEF_S', item_type: 'PRODUCT', manufacture_date: '2026-05-22', expiry_date: '2026-11-22', unit_cost: 82, created_at: new Date().toISOString() },
  ],
  warehouses: [
    { warehouse_id: 'WH_MAIN', name: '總部防潮防蟲主倉庫', type: 'INTERNAL', fee_type: 'NONE', fee_value: 0, created_at: new Date().toISOString() },
    { warehouse_id: 'WH_VET_GAOMEI', name: '高美動物醫院', type: 'CONSIGNMENT', fee_type: 'FLAT', fee_value: 5, created_at: new Date().toISOString() },
    { warehouse_id: 'WH_GROOM_MENG', name: '萌寵美容沙龍店', type: 'CONSIGNMENT', fee_type: 'PERCENT', fee_value: 0.10, created_at: new Date().toISOString() },
    { warehouse_id: 'WH_SHOPEE', name: '蝦皮線上官方賣場', type: 'PLATFORM', fee_type: 'PERCENT', fee_value: 0.085, created_at: new Date().toISOString() },
  ],
  warehouse_stocks: [
    { stock_id: 1, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260501-CHICK-WET', product_or_material_id: 'MAT_WET_CHICKEN', quantity: 80.0 },
    { stock_id: 2, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260515-BEEF-WET', product_or_material_id: 'MAT_WET_BEEF', quantity: 50.0 },
    { stock_id: 3, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260510-CHICK-DRY', product_or_material_id: 'MAT_DRY_CHICKEN', quantity: 12.5 },
    { stock_id: 4, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260520-BEEF-DRY', product_or_material_id: 'MAT_DRY_BEEF', quantity: 8.0 },
    { stock_id: 5, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260501-BAG-S', product_or_material_id: 'MAT_BAG_S', quantity: 800 },
    { stock_id: 6, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260501-BAG-L', product_or_material_id: 'MAT_BAG_L', quantity: 450 },
    { stock_id: 16, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260501-CAN-L', product_or_material_id: 'MAT_CAN_L', quantity: 300 },
    { stock_id: 7, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260501-DESI', product_or_material_id: 'MAT_DESICCANT', quantity: 950 },
    { stock_id: 8, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260501-STICK', product_or_material_id: 'MAT_STICKER', quantity: 1800 },
    { stock_id: 9, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260512-CHICK-S-01', product_or_material_id: 'PROD_CHICKEN_S', quantity: 50 },
    { stock_id: 10, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260525-CHICK-L-01', product_or_material_id: 'PROD_CHICKEN_L', quantity: 20 },
    { stock_id: 11, warehouse_id: 'WH_MAIN', batch_no: 'LOT-20260522-BEEF-S-01', product_or_material_id: 'PROD_BEEF_S', quantity: 40 },
    { stock_id: 12, warehouse_id: 'WH_VET_GAOMEI', batch_no: 'LOT-20260512-CHICK-S-01', product_or_material_id: 'PROD_CHICKEN_S', quantity: 15 },
    { stock_id: 13, warehouse_id: 'WH_VET_GAOMEI', batch_no: 'LOT-20260522-BEEF-S-01', product_or_material_id: 'PROD_BEEF_S', quantity: 10 },
    { stock_id: 14, warehouse_id: 'WH_GROOM_MENG', batch_no: 'LOT-20260512-CHICK-S-01', product_or_material_id: 'PROD_CHICKEN_S', quantity: 10 },
    { stock_id: 15, warehouse_id: 'WH_GROOM_MENG', batch_no: 'LOT-20260525-CHICK-L-01', product_or_material_id: 'PROD_CHICKEN_L', quantity: 8 },
  ],
  sales_orders: [
    {
      order_id: 'SLS-20260528-001',
      warehouse_id: 'WH_SHOPEE',
      order_date: '2026-05-28',
      gross_revenue: 1350.00,
      total_channel_fee: 114.75,
      net_receivable: 1235.25,
      payment_status: 'PAID',
      tax_amount_est: 67.50,
      created_at: new Date(2026, 4, 28, 14, 30).toISOString()
    },
    {
      order_id: 'SLS-20260530-001',
      warehouse_id: 'WH_VET_GAOMEI',
      order_date: '2026-05-30',
      gross_revenue: 1110.00,
      total_channel_fee: 35.00,
      net_receivable: 1075.00,
      payment_status: 'UNPAID',
      tax_amount_est: 55.50,
      created_at: new Date(2026, 4, 30, 18, 0).toISOString()
    }
  ],
  sales_order_items: [
    { item_id: 1, order_id: 'SLS-20260528-001', product_id: 'PROD_CHICKEN_S', batch_no: 'LOT-20260512-CHICK-S-01', quantity: 5, unit_price: 150, calculated_cost: 275, specific_date: '2026-05-28' },
    { item_id: 2, order_id: 'SLS-20260528-001', product_id: 'PROD_CHICKEN_L', batch_no: 'LOT-20260525-CHICK-L-01', quantity: 1, unit_price: 600, calculated_cost: 250, specific_date: '2026-05-28' },
    { item_id: 3, order_id: 'SLS-20260530-001', product_id: 'PROD_CHICKEN_S', batch_no: 'LOT-20260512-CHICK-S-01', quantity: 6, unit_price: 150, calculated_cost: 330, specific_date: '2026-05-30' },
    { item_id: 4, order_id: 'SLS-20260530-001', product_id: 'PROD_BEEF_S', batch_no: 'LOT-20260522-BEEF-S-01', quantity: 1, unit_price: 210, calculated_cost: 82, specific_date: '2026-05-30' }
  ],
  system_configs: [
    { config_key: 'TAX_RATE', config_value: '0.05', description: '估計營業稅率 (5% 為 0.05)', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'ALERT_EXPIRY_YELLOW', config_value: '60', description: '效期黃燈警示天數 (低於此天數顯示黃色)', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'ALERT_EXPIRY_RED', config_value: '30', description: '效期紅燈警示天數 (低於此天數顯示紅色)', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'LOGIN_PASSCODE', config_value: '1234', description: '系統登入門戶安全驗證密碼', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'STOCK_MULTIPLIER', config_value: '1.0', description: '安全庫存水位全局放大倍率係數', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'SYSTEM_TITLE', config_value: 'Aether ERP', description: '系統中/英文名稱', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'SYSTEM_SUBTITLE', config_value: '露福簡單商店系統', description: '系統副標題', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' }
  ],
  inventory_adjustments: [],
  audit_logs: [
    { log_id: 1, user_id: 'usr_super_admin', action_type: 'UPDATE_CONFIG', target_table: 'system_configs', target_id: 'TAX_RATE', old_values: null, new_values: { TAX_RATE: '0.05' }, reason: '初始化系統營業稅率為 5%', created_at: new Date().toISOString() }
  ],
  processing_jobs: []
};

// 取得資料庫
export const getDb = (): ErpDatabase => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!data) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DATABASE));
    return INITIAL_DATABASE;
  }
  try {
    const db = JSON.parse(data) as ErpDatabase;
    let hasMigration = false;
    
    // 進行密碼資料庫遷移
    if (db.profiles && Array.isArray(db.profiles)) {
      db.profiles.forEach(p => {
        if (!p.password) {
          p.password = '1234';
          hasMigration = true;
        }
      });
    }
    
    // 進行乾燥劑類別遷移
    if (db.materials && Array.isArray(db.materials)) {
      const desiccant = db.materials.find(m => m.material_id === 'MAT_DESICCANT');
      if (desiccant && desiccant.category === '包材類') {
        desiccant.category = '其他';
        hasMigration = true;
      }
    }

    // 進行 BOM 配方缺失的成品遷移
    if (db.products && Array.isArray(db.products) && db.bom_recipes && Array.isArray(db.bom_recipes)) {
      db.products.forEach(p => {
        const hasRecipe = db.bom_recipes.some(r => r.product_id === p.product_id);
        if (!hasRecipe) {
          // 缺失配方，自動補建
          // 1. 尋找對應的乾半成品
          let rawPrefix = p.name;
          if (p.name.includes('分裝')) {
            rawPrefix = p.name.split('分裝')[0].trim();
          } else if (p.name.includes('凍乾')) {
            rawPrefix = p.name.split('凍乾')[0].trim();
          } else if (p.name.includes('(')) {
            rawPrefix = p.name.split('(')[0].trim();
          } else if (p.name.includes('（')) {
            rawPrefix = p.name.split('（')[0].trim();
          }
          // 移除 "極鮮" 等修飾詞
          rawPrefix = rawPrefix.replace(/^極鮮/, '');

          // 在 materials 中尋找 type === 'RAW_DRY' 且名稱包含 rawPrefix 的
          let semiMat = db.materials.find(m => m.type === 'RAW_DRY' && m.name.includes(rawPrefix));
          if (!semiMat) {
            // 如果找不到，就找第一個 RAW_DRY
            semiMat = db.materials.find(m => m.type === 'RAW_DRY');
          }
          
          if (semiMat) {
            // 解析規格中的重量
            const match = p.sku_spec.match(/(\d+)\s*(g|克)/i) || p.name.match(/(\d+)\s*(g|克)/i);
            let dryQty = 0.1; // 預設 100g = 0.1 KG
            if (match) {
              const value = parseInt(match[1], 10);
              if (!isNaN(value)) {
                dryQty = value / 1000;
              }
            }

            // 包裝袋型號: 預設大包用 MAT_BAG_L，小包用 MAT_BAG_S，罐裝用 MAT_CAN_L
            let bagId = 'MAT_BAG_S';
            if (p.sku_spec.includes('大包') || p.name.includes('大包')) {
              bagId = 'MAT_BAG_L';
            } else if (p.sku_spec.includes('罐裝') || p.name.includes('罐裝')) {
              bagId = 'MAT_CAN_L';
            }

            const recipeItems = [
              { material_id: semiMat.material_id, quantity_required: dryQty },
              { material_id: bagId, quantity_required: 1 },
              { material_id: 'MAT_DESICCANT', quantity_required: 1 },
              { material_id: 'MAT_STICKER', quantity_required: 2 }
            ];

            recipeItems.forEach(item => {
              const nextRecipeId = db.bom_recipes.length > 0 ? Math.max(...db.bom_recipes.map(r => r.recipe_id)) + 1 : 1;
              db.bom_recipes.push({
                recipe_id: nextRecipeId,
                product_id: p.product_id,
                material_id: item.material_id,
                quantity_required: item.quantity_required
              });
            });
            hasMigration = true;
          }
        }
      });
    }

    if (hasMigration) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    }
    return db;
  } catch (e) {
    console.error('LocalStorage DB 解析錯誤，已重置為初始資料。', e);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DATABASE));
    return INITIAL_DATABASE;
  }
};

// 為 Promise 加上超時控制，並利用原生 Promise 包裹，避免手機端 (iOS) 的 thenable 掛起與網路阻塞
const withTimeout = <T>(promise: Promise<T>, ms: number = 10000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('連線超時（10秒無回應），請確認您的行動數據網路是否通暢，或 Supabase 專案已被暫停。')), ms)
    )
  ]);
};

// 雲端同步狀態控制與互斥鎖，防止手機端併發上傳 JSON 造成網路塞車
let isSyncing = false;
let hasPendingSync = false;
let syncTimeoutId: any = null;

// 非同步將本地資料庫同步至 Supabase 雲端
export const syncDbWithCloud = async (db: ErpDatabase): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return; // 即使沒開自動同步，手動同步也要能上傳

  // 互斥鎖：如果目前已經在同步中，則標記有 pending 任務並直接返回
  if (isSyncing) {
    hasPendingSync = true;
    console.log('⏳ 雲端同步已在進行中，最新資料已排程至稍後自動執行...');
    return;
  }

  isSyncing = true;
  hasPendingSync = false;

  try {
    const timestamp = new Date().toISOString();
    // 使用 IIFE wrapping 確保回傳真正的原生 Promise
    const response = await withTimeout(
      (async () => {
        return await supabase
          .from('erp_sync_store')
          .upsert({
            id: 1,
            db_json: db,
            updated_at: timestamp
          }, { onConflict: 'id' });
      })(),
      10000 // 10 秒超時
    );

    const error = (response as any).error;

    if (error) {
      console.error('Supabase 雲端資料同步失敗：', error);
      throw error;
    } else {
      console.log('資料已成功即時同步至雲端 Supabase 資料表。時間：', timestamp);
      localStorage.setItem('pet_erp_last_upload_time', timestamp);
      localStorage.setItem('pet_erp_last_cloud_time', timestamp);
    }
  } catch (e) {
    console.error('Supabase 雲端同步連線異常：', e);
    throw e;
  } finally {
    isSyncing = false;
    // 如果在同步進行期間有新的資料庫變動，在結束後自動以最新狀態再同步一次
    if (hasPendingSync) {
      console.log('🔄 偵測到同步期間有新資料更新，啟動排程雲端同步...');
      syncDbWithCloud(getDb()).catch(err => console.error('背景排程雲端同步失敗：', err));
    }
  }
};

// 從 Supabase 下載最新雲端資料庫並覆蓋本地
export const loadDbFromCloud = async (): Promise<ErpDatabase | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    // 使用 IIFE wrapping 與超時防護包裹 select
    const response = await withTimeout(
      (async () => {
        return await supabase
          .from('erp_sync_store')
          .select('db_json, updated_at')
          .eq('id', 1)
          .single();
      })(),
      10000 // 10 秒超時
    );

    const error = (response as any).error;
    const data = (response as any).data;

    if (error) {
      console.error('自雲端 Supabase 下載資料庫失敗：', error);
      throw error;
    }

    if (data && data.db_json) {
      const parsedDb = data.db_json as ErpDatabase;
      const requiredKeys = ['profiles', 'materials', 'products', 'bom_recipes', 'inventory_batches', 'warehouses', 'warehouse_stocks', 'sales_orders', 'sales_order_items', 'system_configs', 'inventory_adjustments', 'audit_logs'];
      const hasAllKeys = requiredKeys.every(k => k in parsedDb);
      if (hasAllKeys) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(parsedDb));
        console.log('已自動從雲端 Supabase 資料庫更新本地資料，最後同步時間：', data.updated_at);
        localStorage.setItem('pet_erp_last_download_time', new Date().toISOString());
        if (data.updated_at) {
          localStorage.setItem('pet_erp_last_cloud_time', data.updated_at);
        }
        return parsedDb;
      }
    }
  } catch (e) {
    console.error('自雲端 Supabase 連線下載異常：', e);
    throw e;
  }
  return null;
};

// 儲存資料庫
export const saveDb = (db: ErpDatabase): void => {
  // 1. 毫秒級寫入本地 localStorage，確保使用者操作時完全不卡頓，立刻反應！
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
  
  // 2. 背景防抖自動同步雲端（延遲 2.5 秒執行，避免連續修改造成手機網路堵塞與無限 pending）
  const config = getSupabaseConfig();
  if (config.autoSync) {
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
    }
    syncTimeoutId = setTimeout(() => {
      syncTimeoutId = null;
      console.log('⏳ 偵測到操作停止，開始執行背景防抖雲端同步...');
      syncDbWithCloud(db).catch(err => console.error('背景雲端自動同步失敗：', err));
    }, 2500);
  }
};

// 檢查當前是否有同步在執行或排程中，用以防止使用者關閉網頁造成資料遺失
export const isDbSyncing = (): boolean => {
  return isSyncing || hasPendingSync || syncTimeoutId !== null;
};

// 取得目前模擬登入之使用者
export const getCurrentUser = (): Profile => {
  const currentUserId = localStorage.getItem(CURRENT_USER_KEY) || 'usr_super_admin';
  const db = getDb();
  const user = db.profiles.find(p => p.id === currentUserId);
  if (!user) {
    // 若找不到，重置為第一個
    const fallback = db.profiles[0] || DEFAULT_PROFILES[0];
    localStorage.setItem(CURRENT_USER_KEY, fallback.id);
    return fallback;
  }
  return user;
};

// 切換模擬登入之使用者
export const setCurrentUser = (userId: string): Profile => {
  const db = getDb();
  const user = db.profiles.find(p => p.id === userId);
  if (!user) throw new Error('用戶不存在');
  localStorage.setItem(CURRENT_USER_KEY, userId);
  return user;
};

// RLS 模擬安全過濾器與寫入日誌包裝
export const dbQuery = {
  // 檢查是否具有特定操作權限
  checkPermission: (action: AuditLog['action_type'], targetTable: string, targetId: string) => {
    const user = getCurrentUser();
    
    // STAFF 權限限制
    if (user.role === 'STAFF') {
      if (
        action === 'UPDATE_CONFIG' || 
        action === 'UPDATE_COST' || 
        action === 'UNLOCK_ORDER' || 
        action === 'DELETE_ORDER'
      ) {
        throw new Error(`權限不足：[${user.role} - ${user.name}] 無權對 ${targetTable} 執行 ${action}。`);
      }
    }
    
    // PARTNER 權限限制
    if (user.role === 'PARTNER') {
      if (
        action === 'UPDATE_CONFIG' || 
        action === 'UPDATE_COST' || 
        action === 'UNLOCK_ORDER' || 
        action === 'DELETE_ORDER' ||
        action === 'ADJUST_STOCK' ||
        action === 'CREATE_MATERIAL' ||
        action === 'CREATE_PRODUCT'
      ) {
        throw new Error(`權限不足：寄賣夥伴 [${user.name}] 無權進行系統管理或進銷項結構異動。`);
      }
    }
  },

  // 寫入稽核日誌
  writeAuditLog: (
    action: AuditLog['action_type'], 
    targetTable: string, 
    targetId: string, 
    oldValues: any, 
    newValues: any, 
    reason?: string
  ) => {
    const db = getDb();
    const user = getCurrentUser();
    const newLog: AuditLog = {
      log_id: db.audit_logs.length > 0 ? Math.max(...db.audit_logs.map(l => l.log_id)) + 1 : 1,
      user_id: user.id,
      action_type: action,
      target_table: targetTable,
      target_id: targetId,
      old_values: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
      new_values: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
      reason,
      created_at: new Date().toISOString()
    };
    db.audit_logs.unshift(newLog); // 最新的日誌排在最前面
    saveDb(db);
  },

  // RLS 篩選資料讀取
  filterData: {
    warehouseStocks: (stocks: WarehouseStock[]): WarehouseStock[] => {
      const user = getCurrentUser();
      if (user.role === 'PARTNER') {
        // PARTNER 僅能讀取高美醫院庫存
        return stocks.filter(s => s.warehouse_id === 'WH_VET_GAOMEI');
      }
      return stocks;
    },
    salesOrders: (orders: SalesOrder[]): SalesOrder[] => {
      const user = getCurrentUser();
      if (user.role === 'PARTNER') {
        // PARTNER 僅能讀取高美醫院相關銷售對帳單
        return orders.filter(o => o.warehouse_id === 'WH_VET_GAOMEI');
      }
      return orders;
    },
    auditLogs: (logs: AuditLog[]): AuditLog[] => {
      const user = getCurrentUser();
      if (user.role === 'STAFF' || user.role === 'PARTNER') {
        // STAFF 與 PARTNER 無權限檢視稽核日誌
        return [];
      }
      return logs;
    }
  }
};

// 初始乾淨的空白資料庫結構
const CLEAN_DATABASE: ErpDatabase = {
  profiles: DEFAULT_PROFILES,
  materials: [],
  products: [],
  bom_recipes: [],
  inventory_batches: [],
  warehouses: [
    { warehouse_id: 'WH_MAIN', name: '總部防潮防蟲主倉庫', type: 'INTERNAL', fee_type: 'NONE', fee_value: 0, created_at: new Date().toISOString() },
    { warehouse_id: 'WH_VET_GAOMEI', name: '高美動物醫院', type: 'CONSIGNMENT', fee_type: 'FLAT', fee_value: 5, created_at: new Date().toISOString() },
    { warehouse_id: 'WH_GROOM_MENG', name: '萌寵美容沙龍店', type: 'CONSIGNMENT', fee_type: 'PERCENT', fee_value: 0.10, created_at: new Date().toISOString() },
    { warehouse_id: 'WH_SHOPEE', name: '蝦皮線上官方賣場', type: 'PLATFORM', fee_type: 'PERCENT', fee_value: 0.085, created_at: new Date().toISOString() },
  ],
  warehouse_stocks: [],
  sales_orders: [],
  sales_order_items: [],
  system_configs: [
    { config_key: 'TAX_RATE', config_value: '0.05', description: '估計營業稅率 (5% 為 0.05)', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'ALERT_EXPIRY_YELLOW', config_value: '60', description: '效期黃燈警示天數 (低於此天數顯示黃色)', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'ALERT_EXPIRY_RED', config_value: '30', description: '效期紅燈警示天數 (低於此天數顯示紅色)', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'LOGIN_PASSCODE', config_value: '1234', description: '系統登入門戶安全驗證密碼', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'STOCK_MULTIPLIER', config_value: '1.0', description: '安全庫存水位全局放大倍率係數', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'SYSTEM_TITLE', config_value: 'Aether ERP', description: '系統中/英文名稱', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' },
    { config_key: 'SYSTEM_SUBTITLE', config_value: '露福簡單商店系統', description: '系統副標題', updated_at: new Date().toISOString(), updated_by: 'usr_super_admin' }
  ],
  inventory_adjustments: [],
  audit_logs: [
    { log_id: 1, user_id: 'usr_super_admin', action_type: 'UPDATE_CONFIG', target_table: 'system_configs', target_id: 'DATABASE_CLEAR', old_values: null, new_values: null, reason: '系統管理者執行資料清空，恢復全新空白環境', created_at: new Date().toISOString() }
  ],
  processing_jobs: []
};

export const clearDatabase = (): void => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(CLEAN_DATABASE));
  localStorage.setItem(CURRENT_USER_KEY, 'usr_super_admin');
  window.location.reload();
};

export const resetDatabase = (): void => {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DATABASE));
  localStorage.setItem(CURRENT_USER_KEY, 'usr_super_admin');
  window.location.reload();
};

export default dbQuery;
