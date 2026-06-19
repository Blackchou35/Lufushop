// 寵物凍乾與寄賣 ERP 系統核心資料類型定義

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'PARTNER';

export interface Profile {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  password?: string;
  created_at: string;
}

export type MaterialType = 'RAW_WET' | 'RAW_DRY' | 'CONSUMABLE';

export interface Material {
  material_id: string;
  name: string;
  type: MaterialType;
  category: string; // 肉類, 蔬菜類, 包材類, 貼紙類 等
  min_stock_alert: number;
  is_tax_free?: boolean;
  created_at: string;
}

export interface Product {
  product_id: string;
  name: string;
  sku_spec: string; // 大包500g, 小包100g, 罐裝
  default_price: number;
  min_stock_alert: number;
  is_tax_free?: boolean;
  created_at: string;
}

export interface BomRecipe {
  recipe_id: number;
  product_id: string;
  material_id: string;
  quantity_required: number; // 單位消耗量 (如 0.1000 KG 或 1.00 個)
}

export type ItemType = 'MATERIAL' | 'PRODUCT';

export interface InventoryBatch {
  batch_no: string; // 批號 (如 LOT2026060601)
  item_id: string; // material_id 或 product_id
  item_type: ItemType;
  manufacture_date: string; // YYYY-MM-DD
  expiry_date: string; // YYYY-MM-DD
  unit_cost: number; // 精準落地加權成本
  created_at: string;
}

export type WarehouseType = 'INTERNAL' | 'CONSIGNMENT' | 'PLATFORM';
export type FeeType = 'FLAT' | 'PERCENT' | 'NONE';

export interface Warehouse {
  warehouse_id: string; // WH001=總倉, C001=高美店
  name: string;
  type: WarehouseType;
  fee_type: FeeType;
  fee_value: number; // FLAT 模式下為固定扣費 (如 5.00), PERCENT 下為比例抽成 (如 0.065)
  created_at: string;
}

export interface WarehouseStock {
  stock_id: number;
  warehouse_id: string;
  batch_no: string;
  product_or_material_id: string;
  quantity: number;
}

export type PaymentStatus = 'UNPAID' | 'PAID';

export interface SalesOrder {
  order_id: string; // SLS20260606001
  warehouse_id: string;
  order_date: string; // YYYY-MM-DD
  gross_revenue: number; // 消費者支付總額
  total_channel_fee: number; // 通路抽成或固定扣費總額
  net_receivable: number; // 品牌實收金額
  payment_status: PaymentStatus; // UNPAID (對帳中), PAID (已結)
  tax_amount_est: number; // 預估 5% 營業稅 (gross_revenue * 0.05)
  customer_info_json?: string | null; // 預留客戶資料 (JSON)
  created_at: string;
}

export interface SalesOrderItem {
  item_id: number;
  order_id: string;
  product_id: string;
  batch_no: string; // 精準扣除之批次
  quantity: number;
  unit_price: number; // 當時實際售價
  calculated_cost: number; // 批次單價成本 * 數量
  specific_date: string; // 每日實際銷售日期
}

export interface SystemConfig {
  config_key: string;
  config_value: string;
  description: string;
  updated_at: string;
  updated_by: string; // 關聯 profile.id
}

export interface InventoryAdjustment {
  adjustment_id: number;
  warehouse_id: string;
  batch_no: string;
  product_or_material_id: string;
  adjusted_quantity: number; // 正數增加, 負數減少
  reason: string; // 盤點盈虧, 過期銷毀, 碎料損耗, 登記錯誤修正
  adjusted_by: string; // 關聯 profile.id
  created_at: string;
}

export interface AuditLog {
  log_id: number;
  user_id: string; // 關聯 profile.id
  action_type: 'UPDATE_COST' | 'UNLOCK_ORDER' | 'DELETE_ORDER' | 'ADJUST_STOCK' | 'UPDATE_CONFIG' | 'CREATE_PRODUCT' | 'CREATE_MATERIAL' | 'ADD_STOCK';
  target_table: string;
  target_id: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  reason?: string;
  created_at: string;
}

export interface ProcessingJob {
  job_id: string;              // 工單 ID (例如 JOB-20260606-01)
  material_id: string;         // 生鮮原料 ID (RAW_WET)
  material_name: string;       // 原料中文名稱
  category: string;            // 分類 (肉類, 蔬菜類, 海鮮類, 其他)
  wet_quantity: number;        // 濕貨進貨重量 (KG)
  wet_total_cost: number;      // 濕貨採購總金額 ($)
  fee_type: 'flat' | 'per_kg'; // 加工費計價方式
  processing_fee: number;      // 加工費金額/率
  status: 'PENDING' | 'COMPLETED'; // PENDING = 待烘乾, COMPLETED = 已出爐
  dry_quantity?: number;       // 實際產出乾貨重量 (KG)
  dry_batch_no?: string;       // 乾料批號
  dry_material_id?: string;    // 乾半成品 ID
  manufacture_date?: string;   // 製造日期
  expiry_date?: string;        // 有效日期
  created_at: string;
}

