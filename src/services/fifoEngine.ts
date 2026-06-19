// 寵物凍乾與寄賣 ERP - 先進先出 (FIFO) 庫存扣減與成本分攤引擎
import { getDb, saveDb, dbQuery } from '../lib/db';
import { InventoryBatch, WarehouseStock, SalesOrderItem, BomRecipe } from '../types/erp';
import { translateChineseName, generateMaterialId, generateProductId } from '../utils/idTranslator';

interface FifoDeductionResult {
  batch_no: string;
  quantityDeducted: number;
  unit_cost: number;
  total_cost: number;
}

export const fifoEngine = {
  /**
   * 1. 濕乾貨轉換成本計算 (生鮮肉品 -> 乾肉半成品)
   * 公式 7.1：乾肉批次單價成本 = ((消耗濕肉數量 * 濕肉進價成本) + 當批代工總加工費) / 實際產出乾貨重量 (KG)
   */
  calculateWetToDryCost: (
    wetQty: number,
    wetUnitCost: number,
    processingFee: number,
    dryWeightYield: number
  ): { dryUnitCost: number; yieldRate: number } => {
    if (dryWeightYield <= 0) return { dryUnitCost: 0, yieldRate: 0 };
    const totalCost = (wetQty * wetUnitCost) + processingFee;
    const dryUnitCost = Number((totalCost / dryWeightYield).toFixed(2));
    const yieldRate = Number(((dryWeightYield / wetQty) * 100).toFixed(2));
    return { dryUnitCost, yieldRate };
  },

  /**
   * 2. 生產成品分裝指令 (扣除總倉原料與包材，產出成品並計算精準落地成本)
   * 流程：
   * a. 檢查總倉內原料與耗材庫存是否足夠
   * b. 按先進先出 (FIFO) 依序扣除庫存
   * c. 累加所扣除之原料成本與包材成本，加上分裝加工費，除以成品數量，得到成品單包落地成本
   * d. 生成成品批次，並新增成品庫存
   */
  produceFinishedGoods: (
    productId: string,
    quantityToProduce: number,
    batchNo: string,
    manufactureDate: string,
    expiryDate: string,
    processingFeePerUnit: number, // 單包成品代工/分裝費
    operatorId: string
  ): { success: boolean; unitCost: number; error?: string } => {
    const db = getDb();
    
    // 檢查產品是否存在
    const product = db.products.find(p => p.product_id === productId);
    if (!product) {
      return { success: false, unitCost: 0, error: `找不到商品 ID: ${productId}` };
    }

    // 檢查是否有 BOM 配方
    const recipes = db.bom_recipes.filter(r => r.product_id === productId);
    if (recipes.length === 0) {
      return { success: false, unitCost: 0, error: `該商品未綁定 BOM 配方清單，無法量產。` };
    }

    // 檢查此批號是否已存在
    const isBatchExist = db.inventory_batches.some(b => b.batch_no === batchNo);
    if (isBatchExist) {
      return { success: false, unitCost: 0, error: `批號 ${batchNo} 已存在，請使用新的批號。` };
    }

    // A. 預檢庫存：計算每種物料所需總額，並檢查總倉 (WH_MAIN) 是否足夠
    const deductionsPlan: { recipe: BomRecipe; requiredQty: number; availableQty: number }[] = [];
    
    for (const recipe of recipes) {
      const requiredQty = recipe.quantity_required * quantityToProduce;
      
      // 計算總倉該物料的總庫存
      const totalAvailable = db.warehouse_stocks
        .filter(s => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === recipe.material_id)
        .reduce((sum, s) => sum + s.quantity, 0);

      if (totalAvailable < requiredQty) {
        const mat = db.materials.find(m => m.material_id === recipe.material_id);
        return { 
          success: false, 
          unitCost: 0, 
          error: `原料/耗材不足：[${mat?.name || recipe.material_id}] 總倉在庫量為 ${totalAvailable}，生產本批次需 ${requiredQty}。` 
        };
      }
      
      deductionsPlan.push({ recipe, requiredQty, availableQty: totalAvailable });
    }

    // B. 開始 FIFO 扣除總倉原料與耗材，並累加成本
    let totalMaterialCost = 0;
    const stockUpdates: { stockId: number; newQty: number }[] = [];
    const auditLogsToAdd: string[] = [];

    for (const plan of deductionsPlan) {
      const { material_id } = plan.recipe;
      let needed = plan.requiredQty;

      // 取得總倉內該物料的所有批次庫存，並按過期日期 (expiry_date) 排序 (先進先出)
      // 若過期日期相同，按建立時間排序
      const matBatches = db.inventory_batches.filter(b => b.item_id === material_id && b.item_type === 'MATERIAL');
      const stocksWithBatch = db.warehouse_stocks
        .filter(s => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === material_id && s.quantity > 0)
        .map(s => {
          const batch = matBatches.find(b => b.batch_no === s.batch_no);
          return { stock: s, batch };
        })
        .sort((a: any, b: any) => {
          const dateA = a.batch ? new Date(a.batch.expiry_date).getTime() : 0;
          const dateB = b.batch ? new Date(b.batch.expiry_date).getTime() : 0;
          return dateA - dateB;
        });

      for (const item of stocksWithBatch) {
        if (needed <= 0) break;

        const currentQty = item.stock.quantity;
        const deductQty = Math.min(currentQty, needed);
        const costPerUnit = item.batch ? item.batch.unit_cost : 0;
        
        totalMaterialCost += deductQty * costPerUnit;
        needed -= deductQty;

        stockUpdates.push({
          stockId: item.stock.stock_id,
          newQty: Number((currentQty - deductQty).toFixed(4))
        });

        auditLogsToAdd.push(`扣除原料 [${material_id}] 批次 [${item.stock.batch_no}] 數量: ${deductQty}`);
      }
    }

    // C. 計算本批成品的精準落地成本
    // 總成本 = 所有原料與耗材成本 + 代工總加工費 (單包加工費 * 產出數量)
    const totalProcessingFee = processingFeePerUnit * quantityToProduce;
    const totalProductionCost = totalMaterialCost + totalProcessingFee;
    const calculatedUnitCost = Number((totalProductionCost / quantityToProduce).toFixed(2));

    // D. 套用庫存變更與寫入資料庫
    // 1. 更新扣除的原料耗材庫存
    for (const update of stockUpdates) {
      const stock = db.warehouse_stocks.find(s => s.stock_id === update.stockId);
      if (stock) stock.quantity = update.newQty;
    }

    // 2. 新造成品批次
    const newProductBatch: InventoryBatch = {
      batch_no: batchNo,
      item_id: productId,
      item_type: 'PRODUCT',
      manufacture_date: manufactureDate,
      expiry_date: expiryDate,
      unit_cost: calculatedUnitCost,
      created_at: new Date().toISOString()
    };
    db.inventory_batches.push(newProductBatch);

    // 3. 增加總倉該批次成品庫存
    const existingStockIndex = db.warehouse_stocks.findIndex(
      s => s.warehouse_id === 'WH_MAIN' && s.batch_no === batchNo && s.product_or_material_id === productId
    );

    if (existingStockIndex >= 0) {
      db.warehouse_stocks[existingStockIndex].quantity += quantityToProduce;
    } else {
      const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map(s => s.stock_id)) + 1 : 1;
      db.warehouse_stocks.push({
        stock_id: nextStockId,
        warehouse_id: 'WH_MAIN',
        batch_no: batchNo,
        product_or_material_id: productId,
        quantity: quantityToProduce
      });
    }

    // 4. 寫入稽核日誌
    dbQuery.writeAuditLog(
      'ADD_STOCK', 
      'inventory_batches', 
      batchNo, 
      null, 
      { 
        product_id: productId, 
        qty: quantityToProduce, 
        unit_cost: calculatedUnitCost, 
        total_material_cost: totalMaterialCost, 
        processing_fee: totalProcessingFee 
      },
      `生產成品分裝：產出 [${product.name}] ${quantityToProduce} 包，批號為 [${batchNo}]，計算單包落地成本為 $${calculatedUnitCost}`
    );

    saveDb(db);
    return { success: true, unitCost: calculatedUnitCost };
  },

  /**
   * 3. 銷售與寄賣對帳扣減引擎 (成品庫存扣減)
   * 流程：
   * a. 檢查該倉庫 (warehouseId) 內該成品是否在庫足夠
   * b. 按 FIFO (先進先出) 依序扣除庫存
   * c. 回傳各批次扣減數量與其落地成本，供銷售明細寫入計算毛利
   */
  deductProductStocksFifo: (
    warehouseId: string,
    productId: string,
    quantityToDeduct: number,
    dbInstance?: any // 可選傳入 db 物件，供單次 transaction 批次操作
  ): { success: boolean; deductions: FifoDeductionResult[]; error?: string } => {
    const db = dbInstance || getDb();
    
    // 計算該倉庫該成品的總庫存
    const totalAvailable = db.warehouse_stocks
      .filter((s: WarehouseStock) => s.warehouse_id === warehouseId && s.product_or_material_id === productId)
      .reduce((sum: number, s: WarehouseStock) => sum + s.quantity, 0);

    if (totalAvailable < quantityToDeduct) {
      const prod = db.products.find((p: any) => p.product_id === productId) || db.materials.find((m: any) => m.material_id === productId);
      const wh = db.warehouses.find((w: any) => w.warehouse_id === warehouseId);
      return { 
        success: false, 
        deductions: [], 
        error: `庫存不足：[${wh?.name || warehouseId}] 內品項 [${prod?.name || productId}] 僅剩餘 ${totalAvailable}，不足以扣除 ${quantityToDeduct}。`
      };
    }

    let needed = quantityToDeduct;
    const deductions: FifoDeductionResult[] = [];
    const stockUpdates: { stockId: number; newQty: number }[] = [];

    // 取得該項目的所有批次，按過期日期 (expiry_date) 排序 (先進先出)
    const prodBatches = db.inventory_batches.filter((b: InventoryBatch) => b.item_id === productId);
    const stocksWithBatch = db.warehouse_stocks
      .filter((s: WarehouseStock) => s.warehouse_id === warehouseId && s.product_or_material_id === productId && s.quantity > 0)
      .map((s: WarehouseStock) => {
        const batch = prodBatches.find((b: InventoryBatch) => b.batch_no === s.batch_no);
        return { stock: s, batch };
      })
      .sort((a: any, b: any) => {
        const dateA = a.batch ? new Date(a.batch.expiry_date).getTime() : 0;
        const dateB = b.batch ? new Date(b.batch.expiry_date).getTime() : 0;
        return dateA - dateB;
      });

    for (const item of stocksWithBatch) {
      if (needed <= 0) break;

      const currentQty = item.stock.quantity;
      const deductQty = Math.min(currentQty, needed);
      const costPerUnit = item.batch ? item.batch.unit_cost : 0;

      deductions.push({
        batch_no: item.stock.batch_no,
        quantityDeducted: deductQty,
        unit_cost: costPerUnit,
        total_cost: Number((deductQty * costPerUnit).toFixed(4))
      });

      needed -= deductQty;

      stockUpdates.push({
        stockId: item.stock.stock_id,
        newQty: Number((currentQty - deductQty).toFixed(4))
      });
    }

    if (needed > 0) {
      const prod = db.products.find((p: any) => p.product_id === productId) || db.materials.find((m: any) => m.material_id === productId);
      return { 
        success: false, 
        deductions: [], 
        error: `庫存扣減失敗：扣除項目 [${prod?.name || productId}] 時，扣除後仍缺少 ${needed}。` 
      };
    }

    // 更新庫存
    for (const update of stockUpdates) {
      const stock = db.warehouse_stocks.find((s: any) => s.stock_id === update.stockId);
      if (stock) {
        stock.quantity = update.newQty;
      }
    }

    return { success: true, deductions };
  },

  /**
   * 🥬 4. 原料進貨登記 (產生待加工工單)
   * 系統會自動在後台建立原料定義並寫入 PENDING 加工工單與生鮮進貨批次
   */
  registerProcessingJob: (
    params: {
      selectedMatId: string;
      newName?: string;
      category: string; // 肉類, 蔬菜類, 海鮮類, 其他
      wetQty: number;
      wetTotalCost: number;
      feeType: 'flat' | 'per_kg';
      processingFee: number;
      manufactureDate: string;
      operatorId: string;
    },
    dbInstance?: any
  ): { success: boolean; job?: any; error?: string } => {
    const db = dbInstance || getDb();
    const { selectedMatId, newName, category, wetQty, wetTotalCost, feeType, processingFee, manufactureDate, operatorId } = params;

    let finalWetId = selectedMatId;
    let finalDryId = '';
    let wetName = '';

    if (selectedMatId === 'NEW') {
      if (!newName || !newName.trim()) {
        return { success: false, error: '請填寫新原料的中文名稱！' };
      }
      wetName = newName.trim();
      finalWetId = generateMaterialId(wetName, 'RAW_WET', category);
      finalDryId = generateMaterialId(wetName, 'RAW_DRY', category);

      // 新增生鮮原料定義
      if (!db.materials.some((m: any) => m.material_id === finalWetId)) {
        db.materials.push({
          material_id: finalWetId,
          name: wetName,
          type: 'RAW_WET',
          category,
          min_stock_alert: 20,
          created_at: new Date().toISOString()
        });
      }
      // 新增乾半成品定義
      if (!db.materials.some((m: any) => m.material_id === finalDryId)) {
        db.materials.push({
          material_id: finalDryId,
          name: `${wetName}乾半成品`,
          type: 'RAW_DRY',
          category,
          min_stock_alert: 5,
          created_at: new Date().toISOString()
        });
      }
    } else {
      const mat = db.materials.find((m: any) => m.material_id === selectedMatId);
      if (!mat) return { success: false, error: '請選擇生鮮原料！' };
      finalWetId = selectedMatId;
      finalDryId = selectedMatId.replace('MAT_WET_', 'MAT_DRY_');
      wetName = mat.name;

      // 如果資料庫沒有乾半成品，補建一個
      if (!db.materials.some((m: any) => m.material_id === finalDryId)) {
        db.materials.push({
          material_id: finalDryId,
          name: `${wetName.replace(/生鮮|生/g, '')}乾半成品`,
          type: 'RAW_DRY',
          category: mat.category,
          min_stock_alert: 5,
          created_at: new Date().toISOString()
        });
      }
    }

    // A. 寫入生鮮進貨批次 (批號全自動靜默生成)
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 90) + 10);
    const wetBatchNo = `LOT-WET-${todayStr}-${rand}`;
    const wetUnitCost = Number((wetTotalCost / wetQty).toFixed(2));
    const wetBatch = {
      batch_no: wetBatchNo,
      item_id: finalWetId,
      item_type: 'MATERIAL' as const,
      manufacture_date: manufactureDate,
      expiry_date: new Date(new Date(manufactureDate).setDate(new Date(manufactureDate).getDate() + 90)).toISOString().split('T')[0],
      unit_cost: wetUnitCost,
      created_at: new Date().toISOString()
    };
    db.inventory_batches.push(wetBatch);

    // 總倉增加生原料庫存
    const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map((s: any) => s.stock_id)) + 1 : 1;
    db.warehouse_stocks.push({
      stock_id: nextStockId,
      warehouse_id: 'WH_MAIN',
      batch_no: wetBatchNo,
      product_or_material_id: finalWetId,
      quantity: wetQty
    });

    // B. 建立加工工單
    const jobId = `JOB-${todayStr}-${rand}`;
    const newJob = {
      job_id: jobId,
      material_id: finalWetId,
      material_name: wetName,
      category,
      wet_quantity: wetQty,
      wet_total_cost: wetTotalCost,
      fee_type: feeType,
      processing_fee: processingFee,
      status: 'PENDING' as const,
      created_at: new Date().toISOString()
    };
    db.processing_jobs = db.processing_jobs || [];
    db.processing_jobs.push(newJob);

    // 審計稽核日誌
    const nextLogId = db.audit_logs.length > 0 ? Math.max(...db.audit_logs.map((l: any) => l.log_id)) + 1 : 1;
    db.audit_logs.unshift({
      log_id: nextLogId,
      user_id: operatorId,
      action_type: 'ADD_STOCK',
      target_table: 'processing_jobs',
      target_id: jobId,
      old_values: null,
      new_values: newJob,
      reason: `登記原料採購進貨加工：採購 [${wetName}] ${wetQty} KG 濕貨，建立待烘乾加工工單，總額 $${wetTotalCost}`,
      created_at: new Date().toISOString()
    });

    if (!dbInstance) {
      saveDb(db);
    }

    return { success: true, job: newJob };
  },

  /**
   * 🔥 5. 烘乾出爐登記 (回填乾重與扣生料庫存)
   * 點選工單回填實際乾半成品重，系統自動執行 FIFO 扣濕料，並產出乾料半成品入庫
   */
  completeProcessingJob: (
    params: {
      jobId: string;
      dryWeightYield: number;
      manufactureDate: string;
      expiryDate: string;
      operatorId: string;
    },
    dbInstance?: any
  ): { success: boolean; dryUnitCost: number; error?: string } => {
    const db = dbInstance || getDb();
    const { jobId, dryWeightYield, manufactureDate, expiryDate, operatorId } = params;

    db.processing_jobs = db.processing_jobs || [];
    const job = db.processing_jobs.find((j: any) => j.job_id === jobId);
    if (!job) return { success: false, dryUnitCost: 0, error: `找不到加工工單 ${jobId}` };
    if (job.status === 'COMPLETED') return { success: false, dryUnitCost: 0, error: '該加工工單已回填乾重，無法重複處理！' };

    const finalDryId = job.material_id.replace('MAT_WET_', 'MAT_DRY_');

    // a. 執行 FIFO 扣減該濕貨原料庫存 (代表被消耗去烘乾了)
    const deductRes = fifoEngine.deductProductStocksFifo('WH_MAIN', job.material_id, job.wet_quantity, db);
    if (!deductRes.success) {
      return { success: false, dryUnitCost: 0, error: deductRes.error || '扣除生鮮庫存失敗！' };
    }

    // b. 計算乾半成品落地成本
    const totalProcessingFee = job.fee_type === 'flat' 
      ? job.processing_fee 
      : Number((job.processing_fee * job.wet_quantity).toFixed(2));
    const dryCost = Number(((job.wet_total_cost + totalProcessingFee) / dryWeightYield).toFixed(2));

    // c. 建立乾貨半成品批次 (批號全自動靜默生成)
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 90) + 10);
    const dryBatchNo = `LOT-DRY-${todayStr}-${rand}`;

    const dryBatch = {
      batch_no: dryBatchNo,
      item_id: finalDryId,
      item_type: 'MATERIAL' as const,
      manufacture_date: manufactureDate,
      expiry_date: expiryDate,
      unit_cost: dryCost,
      created_at: new Date().toISOString()
    };
    db.inventory_batches.push(dryBatch);

    // 總倉增加乾半成品庫存
    const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map((s: any) => s.stock_id)) + 1 : 1;
    db.warehouse_stocks.push({
      stock_id: nextStockId,
      warehouse_id: 'WH_MAIN',
      batch_no: dryBatchNo,
      product_or_material_id: finalDryId,
      quantity: dryWeightYield
    });

    // d. 更新工單狀態
    job.status = 'COMPLETED';
    job.dry_quantity = dryWeightYield;
    job.dry_batch_no = dryBatchNo;
    job.dry_material_id = finalDryId;
    job.manufacture_date = manufactureDate;
    job.expiry_date = expiryDate;

    // 審計稽核日誌
    const nextLogId = db.audit_logs.length > 0 ? Math.max(...db.audit_logs.map((l: any) => l.log_id)) + 1 : 1;
    db.audit_logs.unshift({
      log_id: nextLogId,
      user_id: operatorId,
      action_type: 'ADD_STOCK',
      target_table: 'processing_jobs',
      target_id: jobId,
      old_values: { wetQty: job.wet_quantity, wetCost: job.wet_total_cost },
      new_values: { dryBatch, dryWeightYield },
      reason: `登記烘乾加工出爐：工單 [${jobId}] 回填乾重 ${dryWeightYield} KG，乾料批號 [${dryBatchNo}]，乾料成本 $${dryCost}/KG`,
      created_at: new Date().toISOString()
    });

    if (!dbInstance) {
      saveDb(db);
    }

    return { success: true, dryUnitCost: dryCost };
  },

  /**
   * 📦 6. 半成品分裝做貨 (扣減半成品與耗材，產出袋/罐裝零售成品)
   */
  portionSemiProduct: (
    params: {
      selectedSemiMatId: string;
      semiWeightToConsume: number;
      skuSpec: string; // 如：小包、大包、罐裝
      packagedQty: number;
      bagId: string;
      bagQty: number;
      stickerId: string;
      stickerQty: number;
      desiccantId: string;
      desiccantQty: number;
      manufactureDate: string;
      expiryDate: string;
      operatorId: string;
      newName?: string; // 若是新增成品
    },
    dbInstance?: any
  ): { success: boolean; unitCost: number; error?: string } => {
    const db = dbInstance || getDb();
    const { selectedSemiMatId, semiWeightToConsume, skuSpec, packagedQty, bagId, bagQty, stickerId, stickerQty, desiccantId, desiccantQty, manufactureDate, expiryDate, operatorId, newName } = params;

    let finalSemiMatId = selectedSemiMatId;
    let finalRetailProdId = '';
    let semiName = '';

    if (selectedSemiMatId === 'NEW') {
      if (!newName || !newName.trim()) {
        return { success: false, unitCost: 0, error: '請填寫新零售成品的中文名稱！' };
      }
      const prodName = newName.trim();
      finalSemiMatId = generateMaterialId(prodName, 'RAW_DRY', '其他');
      finalRetailProdId = generateProductId(prodName, skuSpec);
      semiName = prodName;

      // 新增乾半成品定義
      if (!db.materials.some((m: any) => m.material_id === finalSemiMatId)) {
        db.materials.push({
          material_id: finalSemiMatId,
          name: `${semiName}乾半成品`,
          type: 'RAW_DRY',
          category: '其他',
          min_stock_alert: 5,
          created_at: new Date().toISOString()
        });
      }
      // 新增零售成品規格
      if (!db.products.some((p: any) => p.product_id === finalRetailProdId)) {
        db.products.push({
          product_id: finalRetailProdId,
          name: `${semiName}分裝 (${skuSpec})`,
          sku_spec: skuSpec,
          default_price: 150,
          min_stock_alert: 20,
          created_at: new Date().toISOString()
        });
      }
    } else {
      const mat = db.materials.find((m: any) => m.material_id === selectedSemiMatId);
      if (!mat) return { success: false, unitCost: 0, error: '請選擇消耗之乾半成品！' };
      finalSemiMatId = selectedSemiMatId;
      semiName = mat.name.replace('乾半成品', '');
      finalRetailProdId = generateProductId(semiName, skuSpec);

      // 如果零售成品不存在，補建一個
      if (!db.products.some((p: any) => p.product_id === finalRetailProdId)) {
        db.products.push({
          product_id: finalRetailProdId,
          name: `${semiName}分裝 (${skuSpec})`,
          sku_spec: skuSpec,
          default_price: 150,
          min_stock_alert: 20,
          created_at: new Date().toISOString()
        });
      }
    }

    // a. FIFO 扣除消耗的包裝耗材並累加成本
    let calcConsumablesCost = 0;
    
    const deductConsumable = (consId: string, qty: number) => {
      if (!consId || qty <= 0) return;
      const res = fifoEngine.deductProductStocksFifo('WH_MAIN', consId, qty, db);
      if (!res.success) {
        const item = db.materials.find((m: any) => m.material_id === consId);
        throw new Error(`耗材庫存不足：[${item?.name || consId}] 總倉餘額不足以扣除 ${qty}！`);
      }
      calcConsumablesCost += res.deductions.reduce((sum: number, d: any) => sum + d.total_cost, 0);
    };

    try {
      deductConsumable(bagId, bagQty);
      deductConsumable(stickerId, stickerQty);
      deductConsumable(desiccantId, desiccantQty);
    } catch (e: any) {
      return { success: false, unitCost: 0, error: e.message };
    }

    // b. FIFO 扣除消耗的乾半成品庫存並累加成本
    const deductSemiRes = fifoEngine.deductProductStocksFifo('WH_MAIN', finalSemiMatId, semiWeightToConsume, db);
    if (!deductSemiRes.success) {
      return { success: false, unitCost: 0, error: deductSemiRes.error || '扣除乾半成品庫存失敗！' };
    }
    const calcSemiCost = deductSemiRes.deductions.reduce((sum: number, d: any) => sum + d.total_cost, 0);

    // c. 計算分裝零售包/罐成品落地單個成本
    const finalCostPerUnit = Number(((calcSemiCost + calcConsumablesCost) / packagedQty).toFixed(2));

    // d. 建立零售成品批次 (批號全自動隨機生成)
    const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 90) + 10);
    const batchNo = `LOT-PROD-${todayStr}-${rand}`;

    const newProdBatch = {
      batch_no: batchNo,
      item_id: finalRetailProdId,
      item_type: 'PRODUCT' as const,
      manufacture_date: manufactureDate,
      expiry_date: expiryDate,
      unit_cost: finalCostPerUnit,
      created_at: new Date().toISOString()
    };
    db.inventory_batches.push(newProdBatch);

    // 總倉增成品庫存
    const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map((s: any) => s.stock_id)) + 1 : 1;
    db.warehouse_stocks.push({
      stock_id: nextStockId,
      warehouse_id: 'WH_MAIN',
      batch_no: batchNo,
      product_or_material_id: finalRetailProdId,
      quantity: packagedQty
    });

    // 審計稽核日誌
    const nextLogId = db.audit_logs.length > 0 ? Math.max(...db.audit_logs.map((l: any) => l.log_id)) + 1 : 1;
    db.audit_logs.unshift({
      log_id: nextLogId,
      user_id: operatorId,
      action_type: 'ADD_STOCK',
      target_table: 'inventory_batches',
      target_id: batchNo,
      old_values: { semiQty: semiWeightToConsume, semiCost: calcSemiCost, consumablesCost: calcConsumablesCost },
      new_values: { prodBatch: newProdBatch, qty: packagedQty },
      reason: `半成品分裝做貨：消耗 [${semiName}乾半成品] ${semiWeightToConsume} KG 成本 $${calcSemiCost}，分裝產出零售成品 [${semiName}分裝 (${skuSpec})] ${packagedQty} 包/罐，單個成本 $${finalCostPerUnit}/包罐`,
      created_at: new Date().toISOString()
    });

    // e. 確保該零售成品在 bom_recipes 中有對應的配方 (以計算單包所用之包材與耗材費)
    const existingRecipes = db.bom_recipes.filter((r: any) => r.product_id === finalRetailProdId);
    if (existingRecipes.length === 0) {
      const recipeItems = [
        { material_id: finalSemiMatId, qty: semiWeightToConsume },
        { material_id: bagId, qty: bagQty },
        { material_id: stickerId, qty: stickerQty },
        { material_id: desiccantId, qty: desiccantQty },
      ];

      recipeItems.forEach(item => {
        if (item.material_id && item.qty > 0) {
          const nextRecipeId = db.bom_recipes.length > 0 ? Math.max(...db.bom_recipes.map((r: any) => r.recipe_id)) + 1 : 1;
          db.bom_recipes.push({
            recipe_id: nextRecipeId,
            product_id: finalRetailProdId,
            material_id: item.material_id,
            quantity_required: Number((item.qty / packagedQty).toFixed(4))
          });
        }
      });
    }

    if (!dbInstance) {
      saveDb(db);
    }

    return { success: true, unitCost: finalCostPerUnit };
  }
};
export default fifoEngine;
