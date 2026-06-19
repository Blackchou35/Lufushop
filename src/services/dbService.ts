// 寵物凍乾與寄賣 ERP - 資料庫操作與業務邏輯服務 (包裝 localStorage DB 與權限控管)
import { getDb, saveDb, dbQuery, getCurrentUser, resetDatabase, clearDatabase } from '../lib/db';
import { 
  Material, Product, BomRecipe, InventoryBatch, 
  Warehouse, WarehouseStock, SalesOrder, SalesOrderItem, 
  SystemConfig, InventoryAdjustment, AuditLog, Profile 
} from '../types/erp';
import { fifoEngine } from './fifoEngine';

export const dbService = {
  // --- 物料資材管理 ---
  getMaterials: (): Material[] => {
    return getDb().materials;
  },

  addMaterial: (material: Omit<Material, 'created_at'>): void => {
    dbQuery.checkPermission('CREATE_MATERIAL', 'materials', material.material_id);
    const db = getDb();
    if (db.materials.some(m => m.material_id === material.material_id)) {
      throw new Error(`物料 ID [${material.material_id}] 已存在。`);
    }
    const newMat: Material = { ...material, created_at: new Date().toISOString() };
    db.materials.push(newMat);
    saveDb(db);
    dbQuery.writeAuditLog('CREATE_MATERIAL', 'materials', material.material_id, null, newMat, `新增物料資材: ${material.name}`);
  },

  // --- 商品成品管理 ---
  getProducts: (): Product[] => {
    return getDb().products;
  },

  addProduct: (product: Omit<Product, 'created_at'>, recipes: Omit<BomRecipe, 'recipe_id' | 'product_id'>[]): void => {
    dbQuery.checkPermission('CREATE_PRODUCT', 'products', product.product_id);
    const db = getDb();
    if (db.products.some(p => p.product_id === product.product_id)) {
      throw new Error(`商品 ID [${product.product_id}] 已存在。`);
    }

    const newProd: Product = { ...product, created_at: new Date().toISOString() };
    db.products.push(newProd);

    // 寫入 BOM 配方
    recipes.forEach(r => {
      const nextId = db.bom_recipes.length > 0 ? Math.max(...db.bom_recipes.map(br => br.recipe_id)) + 1 : 1;
      db.bom_recipes.push({
        recipe_id: nextId,
        product_id: product.product_id,
        material_id: r.material_id,
        quantity_required: r.quantity_required
      });
    });

    saveDb(db);
    dbQuery.writeAuditLog('CREATE_PRODUCT', 'products', product.product_id, null, { product: newProd, recipes }, `新增商品 [${product.name}] 並綁定 BOM 配方`);
  },

  // --- BOM 配方管理 ---
  getBomRecipes: (): BomRecipe[] => {
    return getDb().bom_recipes;
  },

  // --- 倉庫管理 ---
  getWarehouses: (): Warehouse[] => {
    return getDb().warehouses;
  },

  addWarehouse: (warehouse: Omit<Warehouse, 'created_at'>): void => {
    dbQuery.checkPermission('CREATE_MATERIAL', 'warehouses', warehouse.warehouse_id); // 以 CREATE_MATERIAL 等同管理權限
    const db = getDb();
    if (db.warehouses.some(w => w.warehouse_id === warehouse.warehouse_id)) {
      throw new Error(`倉庫 ID [${warehouse.warehouse_id}] 已存在。`);
    }
    const newWh: Warehouse = { ...warehouse, created_at: new Date().toISOString() };
    db.warehouses.push(newWh);
    saveDb(db);
    dbQuery.writeAuditLog('UPDATE_CONFIG', 'warehouses', warehouse.warehouse_id, null, newWh, `建立虛擬分倉: ${warehouse.name}`);
  },

  // --- 庫存批次管理 ---
  getInventoryBatches: (): InventoryBatch[] => {
    return getDb().inventory_batches;
  },

  // --- 庫存餘額管理 ---
  getWarehouseStocks: (): WarehouseStock[] => {
    const db = getDb();
    // 經由 RLS 過濾
    return dbQuery.filterData.warehouseStocks(db.warehouse_stocks);
  },

  // --- 庫存調撥邏輯 (總倉減、寄賣點加) ---
  transferStock: (
    productId: string,
    fromWhId: string,
    toWhId: string,
    quantity: number,
    isMarketingLoss: boolean = false // 是否為行銷損耗/試吃包 (不計入應收)
  ): void => {
    const db = getDb();
    const user = getCurrentUser();
    
    // 預檢
    const prod = db.products.find(p => p.product_id === productId);
    if (!prod) throw new Error('找不到指定商品');
    const fromWh = db.warehouses.find(w => w.warehouse_id === fromWhId);
    const toWh = db.warehouses.find(w => w.warehouse_id === toWhId);
    if (!fromWh || !toWh) throw new Error('倉庫不存在');

    // a. 執行來源倉 FIFO 扣減
    const deductRes = fifoEngine.deductProductStocksFifo(fromWhId, productId, quantity, db);
    if (!deductRes.success) {
      throw new Error(deductRes.error || '扣減庫存失敗');
    }

    // b. 將扣減的批次加到目標倉 (維持批號、效期)
    for (const d of deductRes.deductions) {
      // 試吃包/行銷損耗時，成本在目標倉記為 0 元 (因不計入對帳應收)
      // 但我們保留原批號用以效期追蹤
      const targetCost = isMarketingLoss ? 0 : d.unit_cost;

      // 檢查目標倉此商品此批號的庫存
      const stockIdx = db.warehouse_stocks.findIndex(
        s => s.warehouse_id === toWhId && s.product_or_material_id === productId && s.batch_no === d.batch_no
      );

      if (stockIdx >= 0) {
        db.warehouse_stocks[stockIdx].quantity += d.quantityDeducted;
      } else {
        const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map(s => s.stock_id)) + 1 : 1;
        db.warehouse_stocks.push({
          stock_id: nextStockId,
          warehouse_id: toWhId,
          batch_no: d.batch_no,
          product_or_material_id: productId,
          quantity: d.quantityDeducted
        });
      }

      // 如果是行銷損耗，且目標成本變為 0，需要在目標批次中註記或直接在調撥日誌寫入
    }

    // c. 寫入日誌
    const detailMsg = isMarketingLoss 
      ? `調撥行銷損耗 (試吃包)：[${prod.name}] ${quantity} 包 自 [${fromWh.name}] 移至 [${toWh.name}]，成本提列為 $0`
      : `庫存調撥：[${prod.name}] ${quantity} 包 自 [${fromWh.name}] 移至 [${toWh.name}]`;

    dbQuery.writeAuditLog(
      'ADJUST_STOCK', 
      'warehouse_stocks', 
      productId, 
      { from: fromWhId, to: toWhId, qty: quantity },
      { deductions: deductRes.deductions, isMarketingLoss },
      detailMsg
    );

    saveDb(db);
  },

  // --- 手動庫存盤點與調整 (管理者權限) ---
  adjustStockManually: (
    warehouseId: string,
    batchNo: string,
    productOrMaterialId: string,
    adjustedQty: number, // 可以是正數(盤盈) 或 負數(盤虧/過期)
    reason: string
  ): void => {
    dbQuery.checkPermission('ADJUST_STOCK', 'warehouse_stocks', productOrMaterialId);
    const db = getDb();
    const user = getCurrentUser();

    // 檢查該批次與商品是否存在於庫存中
    let stock = db.warehouse_stocks.find(
      s => s.warehouse_id === warehouseId && s.batch_no === batchNo && s.product_or_material_id === productOrMaterialId
    );

    const oldQty = stock ? stock.quantity : 0;
    const newQty = oldQty + adjustedQty;

    if (newQty < 0) {
      throw new Error(`無法調整庫存：調整後數量為 ${newQty}，不可小於 0。`);
    }

    if (stock) {
      stock.quantity = Number(newQty.toFixed(2));
    } else {
      if (adjustedQty < 0) {
        throw new Error(`庫存不存在，無法進行減少庫存調整。`);
      }
      const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map(s => s.stock_id)) + 1 : 1;
      db.warehouse_stocks.push({
        stock_id: nextStockId,
        warehouse_id: warehouseId,
        batch_no: batchNo,
        product_or_material_id: productOrMaterialId,
        quantity: adjustedQty
      });
    }

    // 寫入庫存手動調整紀錄表
    const nextAdjId = db.inventory_adjustments.length > 0 ? Math.max(...db.inventory_adjustments.map(a => a.adjustment_id)) + 1 : 1;
    const newAdj: InventoryAdjustment = {
      adjustment_id: nextAdjId,
      warehouse_id: warehouseId,
      batch_no: batchNo,
      product_or_material_id: productOrMaterialId,
      adjusted_quantity: adjustedQty,
      reason,
      adjusted_by: user.id,
      created_at: new Date().toISOString()
    };
    db.inventory_adjustments.push(newAdj);

    // 寫入稽核日誌
    const wh = db.warehouses.find(w => w.warehouse_id === warehouseId);
    dbQuery.writeAuditLog(
      'ADJUST_STOCK',
      'warehouse_stocks',
      batchNo,
      { quantity: oldQty },
      { quantity: newQty, adjustment: newAdj },
      `手動庫存調整 [${wh?.name || warehouseId}] 批號 [${batchNo}]：調整量 ${adjustedQty > 0 ? '+' : ''}${adjustedQty} 包/KG，原因：${reason}`
    );

    saveDb(db);
  },

  // --- 銷售對帳單與項目管理 ---
  getSalesOrders: (): SalesOrder[] => {
    const db = getDb();
    return dbQuery.filterData.salesOrders(db.sales_orders);
  },

  getSalesOrderItems: (): SalesOrderItem[] => {
    return getDb().sales_order_items;
  },

  // 建立銷售訂單/結帳
  createSalesOrder: (
    warehouseId: string,
    orderDate: string,
    items: { productId: string; quantity: number; unitPrice: number; specificDate: string }[],
    customerInfoJson?: string | null
  ): string => {
    const db = getDb();
    const wh = db.warehouses.find(w => w.warehouse_id === warehouseId);
    if (!wh) throw new Error('指定通路不存在');

    // 生成訂單 ID SLS+YYYYMMDD+3位流水號
    const dateStr = orderDate.replace(/-/g, '');
    const todayOrders = db.sales_orders.filter(o => o.order_id.startsWith(`SLS-${dateStr}`));
    const seq = String(todayOrders.length + 1).padStart(3, '0');
    const orderId = `SLS-${dateStr}-${seq}`;

    let grossRevenue = 0;
    let totalChannelFee = 0;
    let totalCost = 0;
    const orderItemsToInsert: SalesOrderItem[] = [];
    const stockUpdates: { stockId: number; newQty: number }[] = [];

    // 針對每筆項目執行庫存 FIFO 扣減，並計算管道費與成本
    for (const item of items) {
      if (item.quantity <= 0) continue;

      const deductRes = fifoEngine.deductProductStocksFifo(warehouseId, item.productId, item.quantity, db);
      if (!deductRes.success) {
        throw new Error(deductRes.error || `扣減商品 ${item.productId} 庫存失敗`);
      }

      let itemRevenue = item.quantity * item.unitPrice;
      grossRevenue += itemRevenue;

      // 累加此項目的批次成本，並建立 SalesOrderItem 紀錄
      for (const d of deductRes.deductions) {
        const nextItemId = db.sales_order_items.length > 0 ? Math.max(...db.sales_order_items.map(si => si.item_id)) + 1 : 1;
        
        const salesItem: SalesOrderItem = {
          item_id: nextItemId,
          order_id: orderId,
          product_id: item.productId,
          batch_no: d.batch_no,
          quantity: d.quantityDeducted,
          unit_price: item.unitPrice,
          calculated_cost: d.total_cost,
          specific_date: item.specificDate
        };
        
        orderItemsToInsert.push(salesItem);
        totalCost += d.total_cost;
      }
    }

    // 計算通路抽成或扣費
    // FLAT (固定每件), PERCENT (比例抽成), NONE
    const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
    if (wh.fee_type === 'FLAT') {
      totalChannelFee = totalQty * wh.fee_value;
    } else if (wh.fee_type === 'PERCENT') {
      totalChannelFee = Number((grossRevenue * wh.fee_value).toFixed(2));
    }

    const netReceivable = Number((grossRevenue - totalChannelFee).toFixed(2));

    // 建立銷貨單主檔
    // 計算應稅商品營業額 (以排除免稅品項如生雞蛋)
    let taxableRevenue = 0;
    for (const item of items) {
      const prod = db.products.find(p => p.product_id === item.productId);
      if (prod && !prod.is_tax_free) {
        taxableRevenue += item.quantity * item.unitPrice;
      }
    }
    const taxRateConfig = db.system_configs.find(c => c.config_key === 'TAX_RATE')?.config_value || '0.05';
    const taxRateVal = parseFloat(taxRateConfig) || 0.05;
    const taxAmountEst = Number((taxableRevenue * taxRateVal).toFixed(2));

    const newOrder: SalesOrder = {
      order_id: orderId,
      warehouse_id: warehouseId,
      order_date: orderDate,
      gross_revenue: Number(grossRevenue.toFixed(2)),
      total_channel_fee: totalChannelFee,
      net_receivable: netReceivable,
      payment_status: wh.type === 'CONSIGNMENT' ? 'UNPAID' : 'PAID', // 寄賣預設未結帳，自有零售或平台預設已付款
      tax_amount_est: taxAmountEst,
      customer_info_json: customerInfoJson,
      created_at: new Date().toISOString()
    };

    db.sales_orders.push(newOrder);
    db.sales_order_items.push(...orderItemsToInsert);

    // 寫入日誌
    dbQuery.writeAuditLog(
      'CREATE_PRODUCT', // 以 CREATE 記錄
      'sales_orders',
      orderId,
      null,
      { order: newOrder, items: orderItemsToInsert },
      `建立銷售訂單 [${orderId}] 於通路 [${wh.name}]，銷售數量: ${totalQty} 包，營收: $${newOrder.gross_revenue}，通路扣費: $${newOrder.total_channel_fee}`
    );

    saveDb(db);
    return orderId;
  },

  // 變更訂單付款狀態 (對帳狀態機：對帳中 -> 已結款)
  updateOrderStatus: (orderId: string, status: 'PAID' | 'UNPAID'): void => {
    const db = getDb();
    const order = db.sales_orders.find(o => o.order_id === orderId);
    if (!order) throw new Error('訂單不存在');

    // 防改安全鎖：如果要修改已結帳單，需檢查 Super Admin 權限
    if (order.payment_status === 'PAID' && status === 'UNPAID') {
      dbQuery.checkPermission('UNLOCK_ORDER', 'sales_orders', orderId);
    }

    const oldStatus = order.payment_status;
    order.payment_status = status;

    dbQuery.writeAuditLog(
      'UNLOCK_ORDER',
      'sales_orders',
      orderId,
      { payment_status: oldStatus },
      { payment_status: status },
      `變更訂單狀態 [${orderId}] 由 [${oldStatus}] 改為 [${status}]`
    );

    saveDb(db);
  },

  // 申請解鎖並修正已結帳訂單 (Super Admin 專屬)
  unlockAndModifyOrder: (
    orderId: string, 
    newItems: { productId: string; quantity: number; unitPrice: number; specificDate: string }[],
    reason: string
  ): void => {
    // 檢查 Super Admin 權限
    dbQuery.checkPermission('UNLOCK_ORDER', 'sales_orders', orderId);
    const db = getDb();
    
    const orderIndex = db.sales_orders.findIndex(o => o.order_id === orderId);
    if (orderIndex < 0) throw new Error('訂單不存在');
    const oldOrder = db.sales_orders[orderIndex];

    // 1. 取得該訂單的所有已售明細
    const oldItems = db.sales_order_items.filter(item => item.order_id === orderId);
    
    // 2. 還原庫存：將扣除的成品庫存加回去
    for (const item of oldItems) {
      const stockIdx = db.warehouse_stocks.findIndex(
        s => s.warehouse_id === oldOrder.warehouse_id && s.product_or_material_id === item.product_id && s.batch_no === item.batch_no
      );
      if (stockIdx >= 0) {
        db.warehouse_stocks[stockIdx].quantity += item.quantity;
      } else {
        const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map(s => s.stock_id)) + 1 : 1;
        db.warehouse_stocks.push({
          stock_id: nextStockId,
          warehouse_id: oldOrder.warehouse_id,
          batch_no: item.batch_no,
          product_or_material_id: item.product_id,
          quantity: item.quantity
        });
      }
    }

    // 3. 刪除原訂單明細與主檔
    db.sales_order_items = db.sales_order_items.filter(item => item.order_id !== orderId);
    db.sales_orders = db.sales_orders.filter(o => o.order_id !== orderId);
    saveDb(db); // 先存檔以還原 FIFO 起點

    // 4. 以「新資料」重新計算並執行 FIFO 扣庫存 (調用剛剛的 createSalesOrder 方法)
    // 為了保留原本的 orderId，我們可調用內部重新建立流程
    const wh = db.warehouses.find(w => w.warehouse_id === oldOrder.warehouse_id);
    if (!wh) throw new Error('倉庫不存在');

    let grossRevenue = 0;
    let totalChannelFee = 0;
    const orderItemsToInsert: SalesOrderItem[] = [];

    const db2 = getDb(); // 重新讀取已還原的 DB 狀態
    for (const item of newItems) {
      if (item.quantity <= 0) continue;

      const deductRes = fifoEngine.deductProductStocksFifo(oldOrder.warehouse_id, item.productId, item.quantity, db2);
      if (!deductRes.success) {
        throw new Error(deductRes.error || `解鎖修正失敗，庫存不足。`);
      }

      let itemRevenue = item.quantity * item.unitPrice;
      grossRevenue += itemRevenue;

      for (const d of deductRes.deductions) {
        const nextItemId = db2.sales_order_items.length > 0 ? Math.max(...db2.sales_order_items.map(si => si.item_id)) + 1 : 1;
        
        const salesItem: SalesOrderItem = {
          item_id: nextItemId,
          order_id: orderId,
          product_id: item.productId,
          batch_no: d.batch_no,
          quantity: d.quantityDeducted,
          unit_price: item.unitPrice,
          calculated_cost: d.total_cost,
          specific_date: item.specificDate
        };
        
        orderItemsToInsert.push(salesItem);
      }
    }

    const totalQty = newItems.reduce((sum, i) => sum + i.quantity, 0);
    if (wh.fee_type === 'FLAT') {
      totalChannelFee = totalQty * wh.fee_value;
    } else if (wh.fee_type === 'PERCENT') {
      totalChannelFee = Number((grossRevenue * wh.fee_value).toFixed(2));
    }
    const netReceivable = Number((grossRevenue - totalChannelFee).toFixed(2));

    const updatedOrder: SalesOrder = {
      ...oldOrder,
      gross_revenue: Number(grossRevenue.toFixed(2)),
      total_channel_fee: totalChannelFee,
      net_receivable: netReceivable,
      payment_status: 'PAID', // 修正後直接設回已付款
      tax_amount_est: Number((grossRevenue * 0.05).toFixed(2)),
      created_at: new Date().toISOString()
    };

    db2.sales_orders.push(updatedOrder);
    db2.sales_order_items.push(...orderItemsToInsert);

    // 寫入稽核日誌 (記錄解鎖原因與變更)
    dbQuery.writeAuditLog(
      'UNLOCK_ORDER',
      'sales_orders',
      orderId,
      { oldOrder, oldItems },
      { updatedOrder, items: orderItemsToInsert },
      `最高管理者解鎖並修改訂單 [${orderId}]，原因：${reason}`
    );

    saveDb(db2);
  },

  // --- 系統設定參數管理 ---
  getConfigs: (): SystemConfig[] => {
    return getDb().system_configs;
  },

  updateConfig: (key: string, value: string): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'system_configs', key);
    const db = getDb();
    let config = db.system_configs.find(c => c.config_key === key);
    const user = getCurrentUser();

    if (!config) {
      const newConfig = {
        config_key: key,
        config_value: value,
        description: key === 'LOGIN_PASSCODE' ? '系統登入門戶安全驗證密碼' : key === 'STOCK_MULTIPLIER' ? '安全庫存水位全局放大倍率係數' : key,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      };
      db.system_configs.push(newConfig);
      dbQuery.writeAuditLog(
        'UPDATE_CONFIG',
        'system_configs',
        key,
        null,
        { config_value: value },
        `建立系統參數 [${key}] 為 ${value}`
      );
    } else {
      const oldVal = config.config_value;
      config.config_value = value;
      config.updated_at = new Date().toISOString();
      config.updated_by = user.id;

      dbQuery.writeAuditLog(
        'UPDATE_CONFIG',
        'system_configs',
        key,
        { config_value: oldVal },
        { config_value: value },
        `更新系統參數 [${key}] 為 ${value}`
      );
    }

    saveDb(db);
  },

  // --- 帳號與權限管理 (CRUD) ---
  getProfiles: (): Profile[] => {
    return getDb().profiles;
  },

  addProfile: (profile: Omit<Profile, 'created_at'>): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'profiles', profile.id);
    const db = getDb();
    if (db.profiles.some(p => p.id === profile.id)) {
      throw new Error(`帳號 ID [${profile.id}] 已存在。`);
    }
    if (db.profiles.some(p => p.email === profile.email)) {
      throw new Error(`Email [${profile.email}] 已被其他帳號使用。`);
    }
    const newProfile: Profile = {
      ...profile,
      password: profile.password || '1234',
      created_at: new Date().toISOString()
    };
    db.profiles.push(newProfile);
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG',
      'profiles',
      profile.id,
      null,
      newProfile,
      `新增使用者帳號: [${profile.name}], 角色權限為: [${profile.role}]`
    );
  },

  editProfile: (profileId: string, updatedFields: Partial<Profile>): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'profiles', profileId);
    const db = getDb();
    const idx = db.profiles.findIndex(p => p.id === profileId);
    if (idx < 0) throw new Error('找不到指定帳號。');

    const oldProfile = { ...db.profiles[idx] };
    
    // 驗證 Email 唯一性
    if (updatedFields.email && updatedFields.email !== oldProfile.email) {
      if (db.profiles.some(p => p.email === updatedFields.email)) {
        throw new Error(`Email [${updatedFields.email}] 已被其他帳號使用。`);
      }
    }

    db.profiles[idx] = {
      ...db.profiles[idx],
      ...updatedFields
    };
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG',
      'profiles',
      profileId,
      oldProfile,
      db.profiles[idx],
      `編輯帳號 [${oldProfile.name}] 的設定，更新內容: ${JSON.stringify(updatedFields)}`
    );
  },

  deleteProfile: (profileId: string): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'profiles', profileId);
    const db = getDb();
    const currentUser = getCurrentUser();

    if (profileId === currentUser.id) {
      throw new Error('無法刪除目前登入中的帳號！');
    }

    const profileToDelete = db.profiles.find(p => p.id === profileId);
    if (!profileToDelete) throw new Error('找不到指定帳號。');

    // 檢查是不是最後一個 SUPER_ADMIN
    if (profileToDelete.role === 'SUPER_ADMIN') {
      const superAdmins = db.profiles.filter(p => p.role === 'SUPER_ADMIN');
      if (superAdmins.length <= 1) {
        throw new Error('無法刪除最後一個最高管理者帳號！必須保留至少一個最高管理者以管理系統。');
      }
    }

    db.profiles = db.profiles.filter(p => p.id !== profileId);
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG',
      'profiles',
      profileId,
      profileToDelete,
      null,
      `刪除使用者帳號: [${profileToDelete.name}]`
    );
  },

  resetPassword: (userId: string, newPassword: string): void => {
    const db = getDb();
    const idx = db.profiles.findIndex(p => p.id === userId);
    if (idx < 0) throw new Error('找不到指定帳號。');

    const oldProfile = { ...db.profiles[idx] };
    db.profiles[idx].password = newPassword;
    saveDb(db);

    dbQuery.writeAuditLog(
      'UPDATE_CONFIG',
      'profiles',
      userId,
      { password: oldProfile.password },
      { password: newPassword },
      `使用者 [${oldProfile.name}] 透過救援重設密碼`
    );
  },

  // --- 手動庫存調整紀錄與稽核日誌讀取 (依 RLS 過濾) ---
  getInventoryAdjustments: (): InventoryAdjustment[] => {
    return getDb().inventory_adjustments;
  },

  getAuditLogs: (): AuditLog[] => {
    const db = getDb();
    return dbQuery.filterData.auditLogs(db.audit_logs);
  },

  // --- 進貨登記 (Purchase / Inbound) ---
  purchaseItem: (params: {
    itemId: string; // 原料或成品 ID
    itemType: 'MATERIAL' | 'PRODUCT';
    batchNo: string;
    manufactureDate: string;
    expiryDate: string;
    quantity: number;
    unitCost: number; // 進貨單價
    includeTax: boolean; // 是否含稅，若含稅則內含 5% 營業稅
  }): void => {
    dbQuery.checkPermission('CREATE_MATERIAL', 'warehouse_stocks', params.itemId); // 等同管理權限
    const db = getDb();
    
    // a. 寫入或更新 inventory_batches
    const existingBatch = db.inventory_batches.find(b => b.batch_no === params.batchNo);
    const unit_cost = params.includeTax ? Number((params.unitCost / 1.05).toFixed(2)) : params.unitCost;

    if (existingBatch) {
      // 若批次已存在，則加權平均計算成本
      const totalQty = db.warehouse_stocks
        .filter(s => s.batch_no === params.batchNo && s.product_or_material_id === params.itemId)
        .reduce((sum, s) => sum + s.quantity, 0);
      const oldCost = existingBatch.unit_cost;
      const newCost = totalQty + params.quantity > 0 
        ? Number(((totalQty * oldCost + params.quantity * unit_cost) / (totalQty + params.quantity)).toFixed(2))
        : unit_cost;
      existingBatch.unit_cost = newCost;
    } else {
      db.inventory_batches.push({
        batch_no: params.batchNo,
        item_id: params.itemId,
        item_type: params.itemType,
        manufacture_date: params.manufactureDate,
        expiry_date: params.expiryDate,
        unit_cost: unit_cost,
        created_at: new Date().toISOString()
      });
    }

    // b. 在 WH_MAIN (總倉) 增加庫存
    const stockIdx = db.warehouse_stocks.findIndex(
      s => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === params.itemId && s.batch_no === params.batchNo
    );

    if (stockIdx >= 0) {
      db.warehouse_stocks[stockIdx].quantity += params.quantity;
    } else {
      const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map(s => s.stock_id)) + 1 : 1;
      db.warehouse_stocks.push({
        stock_id: nextStockId,
        warehouse_id: 'WH_MAIN',
        batch_no: params.batchNo,
        product_or_material_id: params.itemId,
        quantity: params.quantity
      });
    }

    // c. 寫入審計日誌
    const itemName = params.itemType === 'MATERIAL' 
      ? db.materials.find(m => m.material_id === params.itemId)?.name
      : db.products.find(p => p.product_id === params.itemId)?.name;

    const user = getCurrentUser();
    dbQuery.writeAuditLog(
      'ADD_STOCK',
      'warehouse_stocks',
      params.batchNo,
      null,
      params,
      `進貨登記：買入 [${itemName || params.itemId}] 數量 ${params.quantity}，單價 $${params.unitCost} (${params.includeTax ? '含稅' : '未稅'})，入庫至總倉，批號 [${params.batchNo}]`
    );

    saveDb(db);
  },

  // --- 基礎資料編輯與刪除 (CRUD) 擴充 ---

  // 編輯物料資材
  editMaterial: (materialId: string, updatedFields: Partial<Material>): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'materials', materialId);
    const db = getDb();
    const matIndex = db.materials.findIndex(m => m.material_id === materialId);
    if (matIndex < 0) throw new Error('找不到指定物料');
    
    const oldMat = { ...db.materials[matIndex] };
    db.materials[matIndex] = {
      ...db.materials[matIndex],
      ...updatedFields
    };
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG', 
      'materials', 
      materialId, 
      oldMat, 
      db.materials[matIndex], 
      `編輯物料 [${oldMat.name}] 的基本設定`
    );
  },

  // 刪除物料資材
  deleteMaterial: (materialId: string): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'materials', materialId);
    const db = getDb();
    
    // 檢查是否有庫存
    const hasStock = db.warehouse_stocks.some(s => s.product_or_material_id === materialId && s.quantity > 0);
    if (hasStock) {
      throw new Error('該物料在倉庫中尚有在庫數量，無法刪除！請先將庫存清零或盤點調整。');
    }
    
    // 檢查是否綁定於任何成品的 BOM 配方
    const isUsedInBOM = db.bom_recipes.some(r => r.material_id === materialId);
    if (isUsedInBOM) {
      const db2 = getDb();
      const recipes = db2.bom_recipes.filter(r => r.material_id === materialId);
      const prodIds = Array.from(new Set(recipes.map(r => r.product_id)));
      const prodNames = prodIds.map(id => db2.products.find(p => p.product_id === id)?.name || id);
      throw new Error(`該物料正被商品 [${prodNames.join(', ')}] 的 BOM 配方使用，無法刪除！請先修改或刪除該商品配方。`);
    }

    const matToDelete = db.materials.find(m => m.material_id === materialId);
    db.materials = db.materials.filter(m => m.material_id !== materialId);
    
    // 同時移除批次或 0 庫存記錄
    db.inventory_batches = db.inventory_batches.filter(b => b.item_id !== materialId);
    db.warehouse_stocks = db.warehouse_stocks.filter(s => s.product_or_material_id !== materialId);
    
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG', 
      'materials', 
      materialId, 
      matToDelete, 
      null, 
      `刪除物料: ${matToDelete?.name || materialId}`
    );
  },

  // 編輯商品成品與配方
  editProduct: (productId: string, updatedProduct: Partial<Product>, recipes: Omit<BomRecipe, 'recipe_id' | 'product_id'>[]): void => {
    dbQuery.checkPermission('CREATE_PRODUCT', 'products', productId);
    const db = getDb();
    const prodIndex = db.products.findIndex(p => p.product_id === productId);
    if (prodIndex < 0) throw new Error('找不到指定商品');
    
    const oldProduct = { ...db.products[prodIndex] };
    const oldRecipes = db.bom_recipes.filter(r => r.product_id === productId);
    
    db.products[prodIndex] = {
      ...db.products[prodIndex],
      ...updatedProduct
    };
    
    // 重建 BOM 配方
    db.bom_recipes = db.bom_recipes.filter(r => r.product_id !== productId);
    recipes.forEach(r => {
      const nextId = db.bom_recipes.length > 0 ? Math.max(...db.bom_recipes.map(br => br.recipe_id)) + 1 : 1;
      db.bom_recipes.push({
        recipe_id: nextId,
        product_id: productId,
        material_id: r.material_id,
        quantity_required: r.quantity_required
      });
    });
    
    saveDb(db);
    dbQuery.writeAuditLog(
      'CREATE_PRODUCT', 
      'products', 
      productId, 
      { product: oldProduct, recipes: oldRecipes }, 
      { product: db.products[prodIndex], recipes }, 
      `修改商品成品 [${oldProduct.name}] 的品項基本設定與 BOM 配方`
    );
  },

  // 刪除商品成品
  deleteProduct: (productId: string): void => {
    dbQuery.checkPermission('CREATE_PRODUCT', 'products', productId);
    const db = getDb();
    
    // 檢查是否有庫存
    const hasStock = db.warehouse_stocks.some(s => s.product_or_material_id === productId && s.quantity > 0);
    if (hasStock) {
      throw new Error('該商品在倉庫中尚有在庫數量，無法刪除！請先進行銷出或手動調整庫存至 0。');
    }
    
    const prodToDelete = db.products.find(p => p.product_id === productId);
    
    db.products = db.products.filter(p => p.product_id !== productId);
    db.bom_recipes = db.bom_recipes.filter(r => r.product_id !== productId);
    db.inventory_batches = db.inventory_batches.filter(b => b.item_id !== productId);
    db.warehouse_stocks = db.warehouse_stocks.filter(s => s.product_or_material_id !== productId);
    
    saveDb(db);
    dbQuery.writeAuditLog(
      'CREATE_PRODUCT', 
      'products', 
      productId, 
      prodToDelete, 
      null, 
      `刪除商品成品與其配方設定: ${prodToDelete?.name || productId}`
    );
  },

  // 編輯分倉設定
  editWarehouse: (warehouseId: string, updatedFields: Partial<Warehouse>): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'warehouses', warehouseId);
    const db = getDb();
    const whIndex = db.warehouses.findIndex(w => w.warehouse_id === warehouseId);
    if (whIndex < 0) throw new Error('找不到指定分倉');
    
    const oldWh = { ...db.warehouses[whIndex] };
    db.warehouses[whIndex] = {
      ...db.warehouses[whIndex],
      ...updatedFields
    };
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG', 
      'warehouses', 
      warehouseId, 
      oldWh, 
      db.warehouses[whIndex], 
      `編輯合作分倉 [${oldWh.name}] 的基礎設定`
    );
  },

  // 刪除分倉
  deleteWarehouse: (warehouseId: string): void => {
    dbQuery.checkPermission('UPDATE_CONFIG', 'warehouses', warehouseId);
    if (warehouseId === 'WH_MAIN') {
      throw new Error('此為工廠防潮總倉，為系統核心，不可刪除！');
    }
    
    const db = getDb();
    
    // 檢查分倉是否有庫存
    const hasStock = db.warehouse_stocks.some(s => s.warehouse_id === warehouseId && s.quantity > 0);
    if (hasStock) {
      throw new Error('此分倉商店中尚有商品庫存，請先進行「移貨」或手動調整歸零庫存後再行刪除。');
    }
    
    const whToDelete = db.warehouses.find(w => w.warehouse_id === warehouseId);
    db.warehouses = db.warehouses.filter(w => w.warehouse_id !== warehouseId);
    db.warehouse_stocks = db.warehouse_stocks.filter(s => s.warehouse_id !== warehouseId);
    
    saveDb(db);
    dbQuery.writeAuditLog(
      'UPDATE_CONFIG', 
      'warehouses', 
      warehouseId, 
      whToDelete, 
      null, 
      `刪除合作分倉: ${whToDelete?.name || warehouseId}`
    );
  },

  // 作廢銷貨單並還原庫存
  voidSalesOrder: (orderId: string, reason: string): void => {
    dbQuery.checkPermission('DELETE_ORDER', 'sales_orders', orderId);
    const db = getDb();
    
    const orderIndex = db.sales_orders.findIndex(o => o.order_id === orderId);
    if (orderIndex < 0) throw new Error('單據不存在，無法作廢！');
    const orderToVoid = db.sales_orders[orderIndex];
    
    // 1. 取得該訂單的所有已售明細
    const orderItems = db.sales_order_items.filter(item => item.order_id === orderId);
    
    // 2. 還原庫存：將扣除的成品庫存加回去到對應的分倉與批次中
    for (const item of orderItems) {
      const stockIdx = db.warehouse_stocks.findIndex(
        s => s.warehouse_id === orderToVoid.warehouse_id && s.product_or_material_id === item.product_id && s.batch_no === item.batch_no
      );
      if (stockIdx >= 0) {
        db.warehouse_stocks[stockIdx].quantity = Number((db.warehouse_stocks[stockIdx].quantity + item.quantity).toFixed(4));
      } else {
        const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map(s => s.stock_id)) + 1 : 1;
        db.warehouse_stocks.push({
          stock_id: nextStockId,
          warehouse_id: orderToVoid.warehouse_id,
          batch_no: item.batch_no,
          product_or_material_id: item.product_id,
          quantity: item.quantity
        });
      }
    }
    
    // 3. 從資料庫中刪除銷售單主檔與明細檔
    db.sales_order_items = db.sales_order_items.filter(item => item.order_id !== orderId);
    db.sales_orders = db.sales_orders.filter(o => o.order_id !== orderId);
    
    // 4. 寫入稽核日誌
    dbQuery.writeAuditLog(
      'DELETE_ORDER',
      'sales_orders',
      orderId,
      { order: orderToVoid, items: orderItems },
      null,
      `銷貨單作廢成功：單號 [${orderId}]已被作廢，扣除之庫存已退回。原因：${reason}`
    );
    
    saveDb(db);
  },

  // 編輯庫存批次
  editStockBatch: (
    stockId: number,
    quantity: number,
    unitCost: number,
    manufactureDate: string,
    expiryDate: string
  ): void => {
    dbQuery.checkPermission('ADJUST_STOCK', 'warehouse_stocks', String(stockId));
    const db = getDb();
    
    const stock = db.warehouse_stocks.find(s => s.stock_id === stockId);
    if (!stock) throw new Error('庫存記錄不存在');
    
    const oldQty = stock.quantity;
    stock.quantity = Number(quantity.toFixed(4));
    
    const batch = db.inventory_batches.find(
      b => b.batch_no === stock.batch_no && b.item_id === stock.product_or_material_id
    );
    let oldBatch = null;
    if (batch) {
      oldBatch = { ...batch };
      batch.unit_cost = Number(unitCost.toFixed(4));
      batch.manufacture_date = manufactureDate;
      batch.expiry_date = expiryDate;
    }
    
    dbQuery.writeAuditLog(
      'ADJUST_STOCK',
      'warehouse_stocks',
      stock.batch_no,
      { quantity: oldQty, batch: oldBatch },
      { quantity: stock.quantity, batch: batch ? { unit_cost: batch.unit_cost, manufacture_date: batch.manufacture_date, expiry_date: batch.expiry_date } : null },
      `編輯庫存批次: [${stock.batch_no}], 調整數量為 ${quantity}, 成本為 ${unitCost}`
    );
    
    saveDb(db);
  },

  // 刪除庫存記錄
  deleteStockBatch: (stockId: number): void => {
    dbQuery.checkPermission('ADJUST_STOCK', 'warehouse_stocks', String(stockId));
    const db = getDb();
    
    const stockIndex = db.warehouse_stocks.findIndex(s => s.stock_id === stockId);
    if (stockIndex < 0) throw new Error('庫存記錄不存在');
    
    const stockToDelete = db.warehouse_stocks[stockIndex];
    db.warehouse_stocks.splice(stockIndex, 1);
    
    const remainingStocksWithBatch = db.warehouse_stocks.some(
      s => s.batch_no === stockToDelete.batch_no && s.product_or_material_id === stockToDelete.product_or_material_id
    );
    if (!remainingStocksWithBatch) {
      db.inventory_batches = db.inventory_batches.filter(
        b => !(b.batch_no === stockToDelete.batch_no && b.item_id === stockToDelete.product_or_material_id)
      );
    }
    
    dbQuery.writeAuditLog(
      'ADJUST_STOCK',
      'warehouse_stocks',
      stockToDelete.batch_no,
      stockToDelete,
      null,
      `刪除庫存記錄：批號 [${stockToDelete.batch_no}], 商品/原料 ID: [${stockToDelete.product_or_material_id}]`
    );
    
    saveDb(db);
  },

  // --- 重置資料庫至初始狀態 (以便重新測試) ---
  resetDatabase: (): void => {
    resetDatabase();
  },

  // --- 清空資料庫所有營運資料 (恢復全新空白環境) ---
  clearDatabase: (): void => {
    clearDatabase();
  }
};
export default dbService;
