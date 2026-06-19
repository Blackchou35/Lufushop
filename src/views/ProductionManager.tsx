// 寵物凍乾與寄賣 ERP - 加工生產與成本管理頁面 (打掉重構：四大極簡純中文分頁，全面隱藏 ID 與批號輸入)
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { fifoEngine } from '../services/fifoEngine';
import dbQuery, { getDb, saveDb, getCurrentUser } from '../lib/db';
import { generateMaterialId } from '../utils/idTranslator';
import { Material, Product, InventoryBatch, WarehouseStock, ProcessingJob } from '../types/erp';
import { 
  Plus, Flame, Scale, ClipboardList, Info, 
  AlertCircle, CheckCircle, PackagePlus, ShoppingBag, 
  Layers, Package, Check, X, Calendar, Pencil, Trash2
} from 'lucide-react';

export const ProductionManager: React.FC = () => {
  const user = getCurrentUser();
  const [activeSubTab, setActiveSubTab] = useState<'raw_purchase' | 'drying_complete' | 'semi_portioning' | 'consumable_purchase'>('raw_purchase');
  
  // 是否需要委外加工 (若為 false 代表是草料/免加工乾料直接進貨)
  const [needProcessing, setNeedProcessing] = useState(true);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [stocks, setStocks] = useState<WarehouseStock[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. 原料進貨登記表單狀態
  const [rawPurchase, setRawPurchase] = useState({
    selectedMatId: '', // 'NEW' 代表新增自訂原料
    newName: '',
    category: '蔬菜類' as '蔬菜類' | '肉類' | '海鮮類' | '其他',
    wetQty: 10,
    wetTotalCost: 300,
    feeType: 'flat' as 'flat' | 'per_kg',
    processingFee: 200,
    manufactureDate: new Date().toISOString().split('T')[0]
  });

  // 2. 烘乾出爐登記 Modal 狀態
  const [isDryModalOpen, setIsDryModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ProcessingJob | null>(null);
  const [dryModalData, setDryModalData] = useState({
    dryWeightYield: 2.5,
    manufactureDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 180)).toISOString().split('T')[0]
  });

  // 3. 半成品分裝做貨狀態
  const [portioning, setPortioning] = useState({
    selectedSemiMatId: '', // 乾半成品 ID
    selectedProdId: '', // 零售成品 ID，'NEW' 代表新增零售規格
    newName: '', // 新成品中文名稱 (若選 NEW)
    skuSpec: '小包100g', // 規格描述
    semiWeightToConsume: 2.5, // 消耗半成品重量 KG
    packagedQty: 25, // 分裝包/罐數
    bagId: '', // 消耗包材袋/罐
    bagQty: 25,
    stickerId: '', // 消耗標籤貼紙
    stickerQty: 25,
    desiccantId: '', // 消耗乾燥劑
    desiccantQty: 25,
    manufactureDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 180)).toISOString().split('T')[0]
  });

  // 4. 耗材進貨登記狀態
  const [consumablePurchase, setConsumablePurchase] = useState({
    selectedConsumableId: '', // 'NEW' 代表新增自訂耗材
    newName: '',
    category: '包材類',
    quantity: 100,
    totalCost: 200,
    manufactureDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(new Date().setDate(new Date().getDate() + 365 * 3)).toISOString().split('T')[0]
  });

  // 載入資料
  const loadData = () => {
    setMaterials(dbService.getMaterials());
    setProducts(dbService.getProducts());
    setBatches(dbService.getInventoryBatches());
    setStocks(dbService.getWarehouseStocks());
    
    const db = getDb();
    setProcessingJobs(db.processing_jobs || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  // 編輯庫存批次狀態
  const [editingStock, setEditingStock] = useState<{
    stockId: number;
    batchNo: string;
    matName: string;
    quantity: number;
    unitCost: number;
    manufactureDate: string;
    expiryDate: string;
  } | null>(null);

  const handleDeleteStock = (stockId: number) => {
    if (!window.confirm('確定要永久刪除此筆庫存記錄嗎？此操作將同時在無其他庫存引用時刪除該批號資訊，且無法復原。')) return;
    try {
      dbService.deleteStockBatch(stockId);
      setNotification({ type: 'success', message: '已成功刪除該筆庫存批次記錄！' });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  const startEditingStock = (s: WarehouseStock, b: InventoryBatch | undefined) => {
    const mat = materials.find(m => m.material_id === s.product_or_material_id);
    setEditingStock({
      stockId: s.stock_id,
      batchNo: s.batch_no,
      matName: mat?.name || s.product_or_material_id,
      quantity: s.quantity,
      unitCost: b?.unit_cost || 0,
      manufactureDate: b?.manufacture_date || new Date().toISOString().split('T')[0],
      expiryDate: b?.expiry_date || new Date().toISOString().split('T')[0]
    });
  };

  const handleEditStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;
    try {
      dbService.editStockBatch(
        editingStock.stockId,
        editingStock.quantity,
        editingStock.unitCost,
        editingStock.manufactureDate,
        editingStock.expiryDate
      );
      setNotification({ type: 'success', message: `庫存批次 [${editingStock.batchNo}] 更新成功！` });
      setEditingStock(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 取得耗材最新進價成本 (FIFO 退回 fallback)
  const getLatestConsumableUnitCost = (matId: string) => {
    if (!matId) return 0;
    const matBatches = batches.filter(b => b.item_id === matId && b.item_type === 'MATERIAL');
    if (matBatches.length === 0) {
      if (matId.includes('BAG_S')) return 2;
      if (matId.includes('BAG_L')) return 5;
      if (matId.includes('CAN')) return 10;
      if (matId.includes('STICKER')) return 1;
      if (matId.includes('DESICCANT')) return 0.5;
      return 0;
    }
    const sorted = [...matBatches].sort((a, b) => b.manufacture_date.localeCompare(a.manufacture_date));
    return sorted[0].unit_cost;
  };

  // 🥬 1. 原料進貨登記提交
  const handleRawPurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { selectedMatId, newName, category, wetQty, wetTotalCost, feeType, processingFee, manufactureDate } = rawPurchase;

      if (needProcessing) {
        // 需要委外加工烘乾 (生肉、蔬菜生料)
        const res = fifoEngine.registerProcessingJob({
          selectedMatId,
          newName,
          category,
          wetQty,
          wetTotalCost,
          feeType,
          processingFee,
          manufactureDate,
          operatorId: user.id
        });

        if (!res.success) {
          throw new Error(res.error || '登記失敗！');
        }

        setNotification({
          type: 'success',
          message: `生鮮原料進貨登記成功！已產生待烘乾加工工單，並入庫生鮮原料 ${wetQty} KG。請在「2. 烘乾出爐登記」分頁中追蹤此批次。`
        });
      } else {
        // 不需要加工的乾料半成品/草料直接進貨
        const db = getDb();
        let finalDryId = selectedMatId;
        let dryName = '';

        if (selectedMatId === 'NEW') {
          if (!newName || !newName.trim()) {
            throw new Error('請填寫新原料的中文名稱！');
          }
          dryName = newName.trim();
          finalDryId = generateMaterialId(dryName, 'RAW_DRY', category);

          // 新增乾半成品定義
          if (!db.materials.some((m: any) => m.material_id === finalDryId)) {
            db.materials.push({
              material_id: finalDryId,
              name: dryName,
              type: 'RAW_DRY',
              category,
              min_stock_alert: 5,
              created_at: new Date().toISOString()
            });
          }
        } else {
          const mat = db.materials.find((m: any) => m.material_id === selectedMatId);
          if (!mat) throw new Error('請選擇半成品/乾料！');
          finalDryId = selectedMatId;
          dryName = mat.name;
        }

        // 產生乾料批號 (批號隨機靜默生成)
        const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const rand = String(Math.floor(Math.random() * 90) + 10);
        const dryBatchNo = `LOT-DRY-${todayStr}-${rand}`;
        const unitCost = Number((wetTotalCost / wetQty).toFixed(2));
        
        // 預設 180 天後過期
        const expiryDate = new Date(new Date(manufactureDate).setDate(new Date(manufactureDate).getDate() + 180)).toISOString().split('T')[0];

        // 寫入批次
        db.inventory_batches.push({
          batch_no: dryBatchNo,
          item_id: finalDryId,
          item_type: 'MATERIAL',
          manufacture_date: manufactureDate,
          expiry_date: expiryDate,
          unit_cost: unitCost,
          created_at: new Date().toISOString()
        });

        // 寫入庫存
        const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map((s: any) => s.stock_id)) + 1 : 1;
        db.warehouse_stocks.push({
          stock_id: nextStockId,
          warehouse_id: 'WH_MAIN',
          batch_no: dryBatchNo,
          product_or_material_id: finalDryId,
          quantity: wetQty
        });

        // 審計稽核日誌
        dbQuery.writeAuditLog(
          'ADD_STOCK',
          'warehouse_stocks',
          dryBatchNo,
          null,
          { material_id: finalDryId, qty: wetQty, unit_cost: unitCost },
          `免加工原料/草料直接進貨入庫：採購 [${dryName}] 共 ${wetQty} KG，單價 $${unitCost}/KG，批號 [${dryBatchNo}]`
        );

        saveDb(db);

        setNotification({
          type: 'success',
          message: `免加工原料/草料 [${dryName}] 進貨登記成功！共 ${wetQty} KG 已直接入庫至總倉，批號為 [${dryBatchNo}]，單價成本為 $${unitCost}/KG。`
        });
      }

      // 重置表單
      setRawPurchase({
        selectedMatId: '',
        newName: '',
        category: '蔬菜類',
        wetQty: 10,
        wetTotalCost: 300,
        feeType: 'flat',
        processingFee: 200,
        manufactureDate: new Date().toISOString().split('T')[0]
      });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 🔥 2. 開啟出爐回填彈窗
  const openDryModal = (job: ProcessingJob) => {
    setSelectedJob(job);
    setDryModalData({
      dryWeightYield: Number((job.wet_quantity * 0.25).toFixed(2)), // 預設 25% 的烘乾得率
      manufactureDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(new Date().setDate(new Date().getDate() + 180)).toISOString().split('T')[0]
    });
    setIsDryModalOpen(true);
  };

  // 🔥 2. 烘乾出爐回填提交
  const handleDryModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;
    try {
      const res = fifoEngine.completeProcessingJob({
        jobId: selectedJob.job_id,
        dryWeightYield: dryModalData.dryWeightYield,
        manufactureDate: dryModalData.manufactureDate,
        expiryDate: dryModalData.expiryDate,
        operatorId: user.id
      });

      if (!res.success) {
        throw new Error(res.error || '出爐登記失敗！');
      }

      setNotification({
        type: 'success',
        message: `登記出爐成功！此批乾半成品已折算落地成本為 $${res.dryUnitCost}/KG，並已入庫 ${dryModalData.dryWeightYield} KG。`
      });

      setIsDryModalOpen(false);
      setSelectedJob(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 📦 3. 半成品分裝做貨提交
  const handlePortioningSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { selectedSemiMatId, selectedProdId, newName, skuSpec, semiWeightToConsume, packagedQty, bagId, bagQty, stickerId, stickerQty, desiccantId, desiccantQty, manufactureDate, expiryDate } = portioning;

      const res = fifoEngine.portionSemiProduct({
        selectedSemiMatId,
        semiWeightToConsume,
        skuSpec,
        packagedQty,
        bagId,
        bagQty,
        stickerId,
        stickerQty,
        desiccantId,
        desiccantQty,
        manufactureDate,
        expiryDate,
        operatorId: user.id,
        newName: selectedProdId === 'NEW' ? newName : undefined
      });

      if (!res.success) {
        throw new Error(res.error || '分裝登記失敗！');
      }

      const pName = selectedProdId === 'NEW' ? newName : (products.find(p => p.product_id === selectedProdId)?.name || '成品');

      setNotification({
        type: 'success',
        message: `分裝登記成功！零售成品 [${pName}] 共 ${packagedQty} 包/罐已入庫，單個真實落地成本為 $${res.unitCost} 元。`
      });

      // 重置
      setPortioning({
        selectedSemiMatId: '',
        selectedProdId: '',
        newName: '',
        skuSpec: '小包100g',
        semiWeightToConsume: 2.5,
        packagedQty: 25,
        bagId: '',
        bagQty: 25,
        stickerId: '',
        stickerQty: 25,
        desiccantId: '',
        desiccantQty: 25,
        manufactureDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(new Date().setDate(new Date().getDate() + 180)).toISOString().split('T')[0]
      });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 🛍️ 4. 耗材進貨登記提交
  const handleConsumablePurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { selectedConsumableId, newName, category, quantity, totalCost, manufactureDate, expiryDate } = consumablePurchase;

      let finalConsumableId = selectedConsumableId;
      let finalConsumableName = '';
      const db = getDb();

      if (selectedConsumableId === 'NEW') {
        if (!newName || !newName.trim()) {
          throw new Error('請填寫新耗材的中文名稱！');
        }
        finalConsumableName = newName.trim();
        const finalCategory = category || '包材類';
        // 後台產生 ID
        const generatedId = generateMaterialId(finalConsumableName, 'CONSUMABLE', finalCategory);
        finalConsumableId = generatedId;

        // 新增耗材定義
        if (!db.materials.some((m: any) => m.material_id === finalConsumableId)) {
          db.materials.push({
            material_id: finalConsumableId,
            name: finalConsumableName,
            type: 'CONSUMABLE',
            category: finalCategory,
            min_stock_alert: 50,
            created_at: new Date().toISOString()
          });
        }
      } else {
        const mat = db.materials.find((m: any) => m.material_id === selectedConsumableId);
        if (!mat) throw new Error('請選擇進貨的耗材！');
        finalConsumableId = selectedConsumableId;
        finalConsumableName = mat.name;
      }

      // 進貨批次批號自動在後台生成
      const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const rand = String(Math.floor(Math.random() * 90) + 10);
      const batchNo = `LOT-CON-${todayStr}-${rand}`;

      const unitCost = Number((totalCost / quantity).toFixed(2));
      const batch = {
        batch_no: batchNo,
        item_id: finalConsumableId,
        item_type: 'MATERIAL' as const,
        manufacture_date: manufactureDate,
        expiry_date: expiryDate,
        unit_cost: unitCost,
        created_at: new Date().toISOString()
      };
      db.inventory_batches.push(batch);

      // 在 WH_MAIN (總倉) 增加庫存
      const stockIdx = db.warehouse_stocks.findIndex(
        (s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === finalConsumableId && s.batch_no === batchNo
      );

      if (stockIdx >= 0) {
        db.warehouse_stocks[stockIdx].quantity += quantity;
      } else {
        const nextStockId = db.warehouse_stocks.length > 0 ? Math.max(...db.warehouse_stocks.map((s: any) => s.stock_id)) + 1 : 1;
        db.warehouse_stocks.push({
          stock_id: nextStockId,
          warehouse_id: 'WH_MAIN',
          batch_no: batchNo,
          product_or_material_id: finalConsumableId,
          quantity: quantity
        });
      }

      // 寫入審計日誌
      db.audit_logs.unshift({
        log_id: db.audit_logs.length > 0 ? Math.max(...db.audit_logs.map((l: any) => l.log_id)) + 1 : 1,
        user_id: user.id,
        action_type: 'ADD_STOCK',
        target_table: 'inventory_batches',
        target_id: batchNo,
        old_values: null,
        new_values: { batch, qty: quantity },
        reason: `日常耗材進貨：採購 [${finalConsumableName}] 共 ${quantity} 個/張，總金額 $${totalCost}，進價單價 $${unitCost}/單位`,
        created_at: new Date().toISOString()
      });

      saveDb(db);
      setNotification({
        type: 'success',
        message: `耗材進貨登記成功！[${finalConsumableName}] 已自動生成批號並入庫。`
      });

      // 重置
      setConsumablePurchase({
        selectedConsumableId: '',
        newName: '',
        category: '包材類',
        quantity: 100,
        totalCost: 200,
        manufactureDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(new Date().setDate(new Date().getDate() + 365 * 3)).toISOString().split('T')[0]
      });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 原料選擇自動帶入上次進價 (預估用)
  const handleRawMaterialSelect = (matId: string) => {
    if (matId === 'NEW') {
      setRawPurchase({ ...rawPurchase, selectedMatId: 'NEW', newName: '' });
      return;
    }
    const matBatches = batches.filter(b => b.item_id === matId && b.item_type === 'MATERIAL');
    let latestCost = 120; // 預設值
    if (matBatches.length > 0) {
      const sorted = [...matBatches].sort((a, b) => b.manufacture_date.localeCompare(a.manufacture_date));
      latestCost = sorted[0].unit_cost;
    }
    setRawPurchase({
      ...rawPurchase,
      selectedMatId: matId,
      wetTotalCost: Number((latestCost * rawPurchase.wetQty).toFixed(2))
    });
  };

  // 原料進貨即時預算
  const totalProcessingFee = rawPurchase.feeType === 'flat' 
    ? rawPurchase.processingFee 
    : Number((rawPurchase.processingFee * rawPurchase.wetQty).toFixed(2));

  // 半成品分裝即時落地預算
  const getPortionLiveCalculations = () => {
    const { selectedSemiMatId, semiWeightToConsume, packagedQty, bagId, bagQty, stickerId, stickerQty, desiccantId, desiccantQty } = portioning;
    if (!selectedSemiMatId || packagedQty <= 0) return { semiCost: 0, consumableCost: 0, totalCost: 0, perUnitCost: 0 };

    // 1. 半成品預計成本
    const semiBatches = batches.filter(b => b.item_id === selectedSemiMatId && b.item_type === 'MATERIAL');
    let semiUnitCost = 480; // 預設值
    if (semiBatches.length > 0) {
      const sorted = [...semiBatches].sort((a, b) => b.manufacture_date.localeCompare(a.manufacture_date));
      semiUnitCost = sorted[0].unit_cost;
    }
    const semiCost = Number((semiWeightToConsume * semiUnitCost).toFixed(2));

    // 2. 耗材成本
    const bagCost = getLatestConsumableUnitCost(bagId) * bagQty;
    const stickerCost = getLatestConsumableUnitCost(stickerId) * stickerQty;
    const desiccantCost = getLatestConsumableUnitCost(desiccantId) * desiccantQty;
    const consumableCost = Number((bagCost + stickerCost + desiccantCost).toFixed(2));

    const totalCost = Number((semiCost + consumableCost).toFixed(2));
    const perUnitCost = Number((totalCost / packagedQty).toFixed(2));

    return { semiCost, consumableCost, totalCost, perUnitCost };
  };

  const portionLive = getPortionLiveCalculations();

  return (
    <div className="space-y-6">
      {/* 頂部說明 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-text-charcoal flex items-center gap-2">
            🥩 加工生產與進銷存管理
          </h2>
          <p className="text-sm text-text-charcoal/70">
            登記蔬菜與肉類原料進貨、烘乾加工，以及後續分裝為零售小包或罐裝成品的完整流轉過程。
          </p>
        </div>
      </div>

      {/* 提示訊息 */}
      {notification && (
        <div className={`p-4 rounded-xl border flex gap-3 text-sm transition-all duration-300 ${
          notification.type === 'success' 
            ? 'bg-warm-green/10 border-warm-green/45 text-text-charcoal' 
            : 'bg-warm-red/10 border-warm-red/45 text-text-charcoal'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-warm-green shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-warm-red shrink-0 mt-0.5" />
          )}
          <div className="font-medium">{notification.message}</div>
        </div>
      )}

      {/* 子分頁選單 */}
      <div className="flex border-b border-brand-camel/30 mb-5 no-print gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('raw_purchase')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'raw_purchase' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          <Scale className="w-4 h-4" />
          1. 原料進貨登記
        </button>
        <button
          onClick={() => setActiveSubTab('drying_complete')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 relative ${
            activeSubTab === 'drying_complete' ? 'border-brand-accent text-brand-accent' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          <Flame className="w-4 h-4" />
          2. 烘乾出爐登記
          {processingJobs.filter(j => j.status === 'PENDING').length > 0 && (
            <span className="absolute -top-1.5 -right-1 bg-warm-red text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
              {processingJobs.filter(j => j.status === 'PENDING').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveSubTab('semi_portioning')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'semi_portioning' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          <Layers className="w-4 h-4" />
          3. 半成品分裝做貨
        </button>
        <button
          onClick={() => setActiveSubTab('consumable_purchase')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
            activeSubTab === 'consumable_purchase' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          4. 耗材進貨登記
        </button>
      </div>

      {/* 分頁內容 */}
      <div className="grid grid-cols-1 gap-6">

        {/* ========================================================
            分頁一：原料進貨登記
            ======================================================== */}
        {activeSubTab === 'raw_purchase' && (
          <div className="bg-canvas-alt p-6 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4 max-w-4xl">
            <div className="flex items-start gap-2.5">
              <Scale className="w-5 h-5 text-brand-primary mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-charcoal">
                  登記採購原料 / 免加工草料進貨
                </h3>
                <span className="text-[10px] text-text-charcoal/50 leading-relaxed block mt-1">
                  用於記錄需要烘乾的生原料（如南瓜、雞胸肉），或是已經乾燥不需要再加工的乾料半成品（如苜蓿草料、草片、草乾）的購入。
                </span>
              </div>
            </div>

            {/* 進貨屬性切換 */}
            <div className="flex flex-wrap gap-4 p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/10 text-xs">
              <span className="font-bold text-text-charcoal/80 flex items-center">📦 進貨品項屬性：</span>
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-brand-primary">
                <input
                  type="radio"
                  name="needProcessing"
                  checked={needProcessing}
                  onChange={() => {
                    setNeedProcessing(true);
                    setRawPurchase(prev => ({ ...prev, selectedMatId: '', newName: '' }));
                  }}
                  className="accent-brand-primary"
                />
                需要委外加工烘乾 (生鮮肉、生鮮蔬果等濕料)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-brand-camel">
                <input
                  type="radio"
                  name="needProcessing"
                  checked={!needProcessing}
                  onChange={() => {
                    setNeedProcessing(false);
                    setRawPurchase(prev => ({ ...prev, selectedMatId: '', newName: '' }));
                  }}
                  className="accent-brand-camel"
                />
                免加工直接入庫 (草料、草片、草乾等乾料半成品)
              </label>
            </div>

            <form onSubmit={handleRawPurchaseSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-t border-brand-camel/20 pt-4">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">
                  {needProcessing ? '生原料種類' : '乾料/草料品項'}
                </label>
                <select
                  value={rawPurchase.selectedMatId}
                  onChange={(e) => handleRawMaterialSelect(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                  required
                >
                  <option value="">
                    {needProcessing ? '-- 選擇已有生原料 --' : '-- 選擇已有乾料/草料 --'}
                  </option>
                  {materials.filter(m => m.type === (needProcessing ? 'RAW_WET' : 'RAW_DRY')).map(m => (
                    <option key={m.material_id} value={m.material_id}>[{m.category}] {m.name}</option>
                  ))}
                  <option value="NEW">➕ 新增自訂品項...</option>
                </select>
              </div>

              {rawPurchase.selectedMatId === 'NEW' && (
                <div className="grid grid-cols-2 gap-2 bg-brand-primary/5 p-3.5 rounded-xl border border-brand-primary/20 md:col-span-2">
                  <div>
                    <label className="block font-semibold mb-1 text-brand-primary">自訂品項名稱 (中文)</label>
                    <input
                      type="text"
                      placeholder={needProcessing ? "如：生鮮南瓜" : "如：苜蓿草片"}
                      value={rawPurchase.newName}
                      onChange={(e) => setRawPurchase({ ...rawPurchase, newName: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-primary/30 rounded-lg px-2.5 py-2 text-text-charcoal"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-brand-primary">品項分類</label>
                    <select
                      value={rawPurchase.category}
                      onChange={(e) => setRawPurchase({ ...rawPurchase, category: e.target.value as any })}
                      className="w-full bg-canvas-bg border border-brand-primary/30 rounded-lg px-2.5 py-2 text-text-charcoal"
                    >
                      <option value="蔬菜類">蔬菜類</option>
                      <option value="肉類">肉類</option>
                      <option value="海鮮類">海鮮類</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">
                  {needProcessing ? '1. 採購濕料重量 (KG)' : '1. 採購乾料重量 (KG)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={rawPurchase.wetQty}
                  onChange={(e) => setRawPurchase({ ...rawPurchase, wetQty: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">2. 採購進貨總金額 ($)</label>
                <input
                  type="number"
                  value={rawPurchase.wetTotalCost}
                  onChange={(e) => setRawPurchase({ ...rawPurchase, wetTotalCost: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              {needProcessing && (
                <>
                  <div>
                    <label className="block font-semibold mb-1 text-text-charcoal/75">3. 加工費計價方式</label>
                    <select
                      value={rawPurchase.feeType}
                      onChange={(e) => setRawPurchase({ ...rawPurchase, feeType: e.target.value as any })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    >
                      <option value="flat">按件計價 (固定加工費總額)</option>
                      <option value="per_kg">依濕貨重量計價 (每 KG 費率)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-text-charcoal/75">
                      {rawPurchase.feeType === 'flat' ? '4. 代工烘乾加工費總金額 ($)' : '4. 每公斤代工烘乾費 ($/KG)'}
                    </label>
                    <input
                      type="number"
                      value={rawPurchase.processingFee}
                      onChange={(e) => setRawPurchase({ ...rawPurchase, processingFee: Number(e.target.value) })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">
                  {needProcessing ? '5. 進貨採購日期' : '3. 進貨採購日期'}
                </label>
                <input
                  type="date"
                  value={rawPurchase.manufactureDate}
                  onChange={(e) => setRawPurchase({ ...rawPurchase, manufactureDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div className="bg-brand-camel/10 p-3 rounded-xl border border-brand-camel/30 md:col-span-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-text-charcoal/65 font-bold block text-[10px]">預算統計概覽</span>
                  <div className="flex gap-4 mt-1">
                    <div>進貨成本: <span className="font-mono font-bold">${rawPurchase.wetTotalCost}</span></div>
                    {needProcessing && (
                      <div>加工費: <span className="font-mono font-bold">${totalProcessingFee}</span></div>
                    )}
                    <div className="text-brand-primary font-bold">
                      總投入費用: <span className="font-mono font-black">${needProcessing ? (rawPurchase.wetTotalCost + totalProcessingFee) : rawPurchase.wetTotalCost}</span>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-brand-primary text-canvas-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0 self-end md:self-auto"
                >
                  <PackagePlus className="w-4 h-4" />
                  {needProcessing ? '確認登記加工' : '確認登記進貨'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================
            分頁二：烘乾出爐登記
            ======================================================== */}
        {activeSubTab === 'drying_complete' && (
          <div className="bg-canvas-alt p-6 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <div className="flex items-start gap-2.5">
              <Flame className="w-5 h-5 text-brand-accent mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-charcoal">
                  烘乾加工出爐登記
                </h3>
                <span className="text-[10px] text-text-charcoal/50 leading-relaxed block mt-1">
                  列出目前在工廠待烘乾、加工的原料批次。出爐後點選登記以填入「乾半成品重量」，系統會自動計算落地成本並入庫。
                </span>
              </div>
            </div>

            <div className="overflow-x-auto border-t border-brand-camel/20 pt-4">
              <table className="w-full text-xs text-left text-text-charcoal">
                <thead>
                  <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50 uppercase">
                    <th className="py-2 px-3">工單編號</th>
                    <th className="py-2 px-3">原料名稱</th>
                    <th className="py-2 px-3">分類</th>
                    <th className="py-2 px-3 text-right">濕重 (KG)</th>
                    <th className="py-2 px-3 text-right">濕進價 ($)</th>
                    <th className="py-2 px-3">加工計價</th>
                    <th className="py-2 px-3 text-right">加工費 ($)</th>
                    <th className="py-2 px-3">登記日期</th>
                    <th className="py-2 px-3 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {processingJobs.filter(j => j.status === 'PENDING').length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-6 text-center text-text-charcoal/40 font-medium">
                        🎉 目前沒有待加工的原料，所有原料皆已出爐或尚未登記進貨。
                      </td>
                    </tr>
                  ) : (
                    processingJobs.filter(j => j.status === 'PENDING').map(j => {
                      const totalFee = j.fee_type === 'flat' ? j.processing_fee : j.processing_fee * j.wet_quantity;
                      return (
                        <tr key={j.job_id} className="border-b border-brand-camel/20 hover:bg-canvas-bg/35">
                          <td className="py-3 px-3 font-mono text-text-charcoal/65">{j.job_id}</td>
                          <td className="py-3 px-3 font-bold">{j.material_name}</td>
                          <td className="py-3 px-3">
                            <span className="bg-brand-primary/10 text-brand-primary text-[10px] px-2 py-0.5 rounded">
                              {j.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold">{j.wet_quantity} KG</td>
                          <td className="py-3 px-3 text-right font-mono">${j.wet_total_cost}</td>
                          <td className="py-3 px-3">{j.fee_type === 'flat' ? '固定按件' : '依濕重'}</td>
                          <td className="py-3 px-3 text-right font-mono">${totalFee}</td>
                          <td className="py-3 px-3 font-mono text-[10px]">{j.created_at.split('T')[0]}</td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => openDryModal(j)}
                              className="bg-brand-accent text-canvas-bg px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                            >
                              登記出爐重量
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 已完成的工單歷史紀錄 */}
            {processingJobs.filter(j => j.status === 'COMPLETED').length > 0 && (
              <div className="pt-6 space-y-3">
                <h4 className="text-xs font-bold text-text-charcoal flex items-center gap-1.5 opacity-70">
                  <ClipboardList className="w-4 h-4" />
                  已完成烘乾原料歷史紀錄 (最新 5 筆)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left text-text-charcoal/70">
                    <thead>
                      <tr className="border-b border-brand-camel/25 text-[10px] text-text-charcoal/45">
                        <th className="py-2 px-3">工單編號</th>
                        <th className="py-2 px-3">原料名稱</th>
                        <th className="py-2 px-3 text-right">濕重 (KG)</th>
                        <th className="py-2 px-3 text-right">乾半成品重量 (KG)</th>
                        <th className="py-2 px-3 text-right">折合乾料成本/KG</th>
                        <th className="py-2 px-3">乾料入庫批號</th>
                        <th className="py-2 px-3">出爐日期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processingJobs.filter(j => j.status === 'COMPLETED').slice(0, 5).map(j => {
                        const totalFee = j.fee_type === 'flat' ? j.processing_fee : j.processing_fee * j.wet_quantity;
                        const dryCost = Number(((j.wet_total_cost + totalFee) / (j.dry_quantity || 1)).toFixed(2));
                        return (
                          <tr key={j.job_id} className="border-b border-brand-camel/15 hover:bg-canvas-bg/20">
                            <td className="py-2 px-3 font-mono">{j.job_id}</td>
                            <td className="py-2 px-3 font-bold text-text-charcoal">{j.material_name}</td>
                            <td className="py-2 px-3 text-right font-mono">{j.wet_quantity} KG</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-brand-primary">{j.dry_quantity} KG</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-brand-accent">${dryCost}</td>
                            <td className="py-2 px-3 font-mono text-[10px]">{j.dry_batch_no}</td>
                            <td className="py-2 px-3 font-mono">{j.manufacture_date}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            分頁三：半成品分裝做貨
            ======================================================== */}
        {activeSubTab === 'semi_portioning' && (
          <div className="bg-canvas-alt p-6 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4 max-w-4xl">
            <div className="flex items-start gap-2.5">
              <Layers className="w-5 h-5 text-brand-primary mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-charcoal">
                  半成品分裝做貨 (零售包裝)
                </h3>
                <span className="text-[10px] text-text-charcoal/50 leading-relaxed block mt-1">
                  選擇已烘乾完成的半成品，設定分裝數量、規格（袋裝/罐裝），並在畫面上動態消耗包裝耗材與貼紙，自動算出零售成品的精準落地成本。
                </span>
              </div>
            </div>

            <form onSubmit={handlePortioningSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-t border-brand-camel/20 pt-4">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">1. 選擇分裝消耗之半成品 (RAW_DRY)</label>
                <select
                  value={portioning.selectedSemiMatId}
                  onChange={(e) => setPortioning({ ...portioning, selectedSemiMatId: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                  required
                >
                  <option value="">-- 選擇已有乾半成品 --</option>
                  {materials.filter(m => m.type === 'RAW_DRY').map(m => {
                    const totalQty = stocks
                      .filter(s => s.product_or_material_id === m.material_id && s.warehouse_id === 'WH_MAIN')
                      .reduce((sum, s) => sum + s.quantity, 0);
                    return (
                      <option key={m.material_id} value={m.material_id}>
                        {m.name} (可用餘額: {totalQty} KG)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">2. 選擇分裝成品商品名稱</label>
                <select
                  value={portioning.selectedProdId}
                  onChange={(e) => setPortioning({ ...portioning, selectedProdId: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                  required
                >
                  <option value="">-- 選擇已有成品規格 --</option>
                  {products.map(p => (
                    <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku_spec})</option>
                  ))}
                  <option value="NEW">➕ 分裝為全新成品品項...</option>
                </select>
              </div>

              {portioning.selectedProdId === 'NEW' && (
                <div className="grid grid-cols-2 gap-2 bg-brand-primary/5 p-3.5 rounded-xl border border-brand-primary/20 md:col-span-2 animate-fade-in">
                  <div>
                    <label className="block font-semibold mb-1 text-brand-primary">自訂成品名稱 (中文，如：南瓜乾罐裝)</label>
                    <input
                      type="text"
                      placeholder="如：南瓜凍乾罐裝"
                      value={portioning.newName}
                      onChange={(e) => setPortioning({ ...portioning, newName: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-primary/30 rounded-lg px-2.5 py-2 text-text-charcoal"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-brand-primary">分裝規格描述</label>
                    <input
                      type="text"
                      placeholder="如：罐裝150g 或 小包100g"
                      value={portioning.skuSpec}
                      onChange={(e) => setPortioning({ ...portioning, skuSpec: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-primary/30 rounded-lg px-2.5 py-2 text-text-charcoal"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">3. 消耗乾半成品重量 (KG)</label>
                <input
                  type="number"
                  step="0.001"
                  value={portioning.semiWeightToConsume}
                  onChange={(e) => setPortioning({ ...portioning, semiWeightToConsume: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">4. 實際分裝產出數量 (包/罐)</label>
                <input
                  type="number"
                  value={portioning.packagedQty}
                  onChange={(e) => setPortioning({ 
                    ...portioning, 
                    packagedQty: Number(e.target.value),
                    bagQty: Number(e.target.value),
                    stickerQty: Number(e.target.value),
                    desiccantQty: Number(e.target.value)
                  })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              {/* 耗材動態選擇 */}
              <div className="md:col-span-2 border border-brand-camel/30 rounded-xl p-4 space-y-4 bg-brand-camel/5">
                <span className="font-bold text-text-charcoal flex items-center gap-1">
                  📦 5. 選擇本次消耗的包裝耗材與數量 (FIFO 計算成本)
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold mb-1 text-text-charcoal/65">包裝袋 / 密封罐</label>
                    <select
                      value={portioning.bagId}
                      onChange={(e) => setPortioning({ ...portioning, bagId: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 text-[11px]"
                      required
                    >
                      <option value="">-- 選擇包材 --</option>
                      {materials.filter(m => m.type === 'CONSUMABLE' && m.category === '包材類').map(m => (
                        <option key={m.material_id} value={m.material_id}>{m.name}</option>
                      ))}
                    </select>
                    <div className="flex justify-between items-center mt-1 text-[10px] text-text-charcoal/50">
                      <span>消耗個數:</span>
                      <input
                        type="number"
                        value={portioning.bagQty}
                        onChange={(e) => setPortioning({ ...portioning, bagQty: Number(e.target.value) })}
                        className="w-16 bg-canvas-bg border border-brand-camel rounded px-1 py-0.5 text-center font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold mb-1 text-text-charcoal/65">貼紙 / 標籤</label>
                    <select
                      value={portioning.stickerId}
                      onChange={(e) => setPortioning({ ...portioning, stickerId: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 text-[11px]"
                      required
                    >
                      <option value="">-- 選擇貼紙 --</option>
                      {materials.filter(m => m.type === 'CONSUMABLE' && m.category === '貼紙類').map(m => (
                        <option key={m.material_id} value={m.material_id}>{m.name}</option>
                      ))}
                    </select>
                    <div className="flex justify-between items-center mt-1 text-[10px] text-text-charcoal/50">
                      <span>消耗張數:</span>
                      <input
                        type="number"
                        value={portioning.stickerQty}
                        onChange={(e) => setPortioning({ ...portioning, stickerQty: Number(e.target.value) })}
                        className="w-16 bg-canvas-bg border border-brand-camel rounded px-1 py-0.5 text-center font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold mb-1 text-text-charcoal/65">乾燥劑 / 其他</label>
                    <select
                      value={portioning.desiccantId}
                      onChange={(e) => setPortioning({ ...portioning, desiccantId: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 text-[11px]"
                    >
                      <option value="">-- 選擇乾燥劑 (選填) --</option>
                      {materials.filter(m => m.type === 'CONSUMABLE' && m.category !== '包材類' && m.category !== '貼紙類').map(m => (
                        <option key={m.material_id} value={m.material_id}>{m.name}</option>
                      ))}
                    </select>
                    <div className="flex justify-between items-center mt-1 text-[10px] text-text-charcoal/50">
                      <span>消耗個數:</span>
                      <input
                        type="number"
                        value={portioning.desiccantQty}
                        onChange={(e) => setPortioning({ ...portioning, desiccantQty: Number(e.target.value) })}
                        className="w-16 bg-canvas-bg border border-brand-camel rounded px-1 py-0.5 text-center font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">6. 製造日期</label>
                <input
                  type="date"
                  value={portioning.manufactureDate}
                  onChange={(e) => setPortioning({ ...portioning, manufactureDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">7. 有效期限</label>
                <input
                  type="date"
                  value={portioning.expiryDate}
                  onChange={(e) => setPortioning({ ...portioning, expiryDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div className="bg-brand-camel/15 p-4 rounded-xl border border-brand-camel/30 md:col-span-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-text-charcoal/70 font-bold block text-[10px] mb-1">分裝落地成本預估 (實時聯動)</span>
                  <div className="grid grid-cols-2 md:flex md:gap-6 text-[11px] gap-2">
                    <div>半成品成本: <span className="font-mono font-bold">${portionLive.semiCost}</span></div>
                    <div>包裝耗材成本: <span className="font-mono font-bold">${portionLive.consumableCost}</span></div>
                    <div>當批總成本: <span className="font-mono font-bold">${portionLive.totalCost}</span></div>
                    <div className="text-brand-accent font-bold text-xs">
                      預估落地單包/罐成本: <span className="font-mono font-black text-sm">${portionLive.perUnitCost}</span> / 包罐
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-brand-accent text-canvas-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0 self-end md:self-auto"
                >
                  <Package className="w-4 h-4" />
                  確認分裝入庫
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================
            分頁四：耗材進貨登記
            ======================================================== */}
        {activeSubTab === 'consumable_purchase' && (
          <div className="bg-canvas-alt p-6 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4 max-w-4xl">
            <div className="flex items-start gap-2.5">
              <ShoppingBag className="w-5 h-5 text-brand-primary mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-charcoal">
                  耗材資材進貨登記
                </h3>
                <span className="text-[10px] text-text-charcoal/50 leading-relaxed block mt-1">
                  用於採購夾鏈袋、瓶罐、貼紙、品牌紙箱、乾燥劑等耗材登記。進貨後系統會自動生成進貨批次以利先進先出 (FIFO) 扣減。
                </span>
              </div>
            </div>

            <form onSubmit={handleConsumablePurchaseSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs border-t border-brand-camel/20 pt-4">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">耗材品項種類</label>
                <select
                  value={consumablePurchase.selectedConsumableId}
                  onChange={(e) => setConsumablePurchase({ ...consumablePurchase, selectedConsumableId: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                  required
                >
                  <option value="">-- 選擇已有耗材 --</option>
                  {materials.filter(m => m.type === 'CONSUMABLE').map(m => (
                    <option key={m.material_id} value={m.material_id}>[{m.category}] {m.name}</option>
                  ))}
                  <option value="NEW">➕ 新增自訂包材/耗材...</option>
                </select>
              </div>

              {consumablePurchase.selectedConsumableId === 'NEW' && (
                <div className="bg-brand-primary/5 p-3.5 rounded-xl border border-brand-primary/20 md:col-span-2 animate-fade-in grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1 text-brand-primary">自訂耗材名稱 (中文，如：密封壓蓋玻璃瓶)</label>
                    <input
                      type="text"
                      placeholder="如：500ml 玻璃瓶"
                      value={consumablePurchase.newName}
                      onChange={(e) => setConsumablePurchase({ ...consumablePurchase, newName: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-primary/30 rounded-lg px-2.5 py-2 text-text-charcoal"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-brand-primary">耗材分類</label>
                    <select
                      value={consumablePurchase.category}
                      onChange={(e) => setConsumablePurchase({ ...consumablePurchase, category: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-primary/30 rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                      required
                    >
                      <option value="包材類">包材類 (如：包裝袋、密封罐)</option>
                      <option value="貼紙類">貼紙類 (如：標籤、貼紙)</option>
                      <option value="其他">其他 (如：乾燥劑、品牌紙箱等)</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">1. 採購數量 (個/張/箱)</label>
                <input
                  type="number"
                  value={consumablePurchase.quantity}
                  onChange={(e) => setConsumablePurchase({ ...consumablePurchase, quantity: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">2. 採購總金額 ($)</label>
                <input
                  type="number"
                  value={consumablePurchase.totalCost}
                  onChange={(e) => setConsumablePurchase({ ...consumablePurchase, totalCost: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">3. 採購進貨日期</label>
                <input
                  type="date"
                  value={consumablePurchase.manufactureDate}
                  onChange={(e) => setConsumablePurchase({ ...consumablePurchase, manufactureDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">4. 保管有效期限</label>
                <input
                  type="date"
                  value={consumablePurchase.expiryDate}
                  onChange={(e) => setConsumablePurchase({ ...consumablePurchase, expiryDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div className="bg-brand-primary/5 p-3.5 rounded-xl border border-brand-primary/20 md:col-span-2 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <span className="text-brand-primary font-bold">預計折合耗材單價: </span>
                  <span className="font-mono font-black text-sm text-brand-primary">
                    ${consumablePurchase.quantity > 0 ? (consumablePurchase.totalCost / consumablePurchase.quantity).toFixed(2) : 0}
                  </span> 元 / 單位
                </div>
                <button
                  type="submit"
                  className="bg-brand-primary text-canvas-bg px-6 py-2.5 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0 self-end md:self-auto"
                >
                  <PackagePlus className="w-4 h-4" />
                  確認登記進貨
                </button>
              </div>
            </form>
          </div>
        )}

      </div>

      {/* ========================================================
          烘乾出爐登記 Modal 彈窗 (Premium backdrop glassmorphism)
          ======================================================== */}
      {isDryModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-charcoal/40 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-canvas-alt w-full max-w-md rounded-2xl border border-brand-accent shadow-2xl overflow-hidden transform transition-all animate-scale-up">
            
            {/* Modal 標頭 */}
            <div className="bg-brand-accent/10 border-b border-brand-accent/20 px-5 py-4 flex justify-between items-center">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-brand-accent" />
                登記出爐重量 - 工單: {selectedJob.job_id}
              </h3>
              <button
                onClick={() => {
                  setIsDryModalOpen(false);
                  setSelectedJob(null);
                }}
                className="text-text-charcoal/50 hover:text-text-charcoal transition-colors p-1"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Modal 表單 */}
            <form onSubmit={handleDryModalSubmit} className="p-5 space-y-4 text-xs">
              <div className="bg-brand-accent/5 p-3.5 rounded-xl border border-brand-accent/15 space-y-1">
                <div className="font-bold text-text-charcoal text-xs">原料批次：{selectedJob.material_name}</div>
                <div className="text-[10px] text-text-charcoal/65 flex justify-between">
                  <span>進貨濕重: {selectedJob.wet_quantity} KG</span>
                  <span>採購總價: ${selectedJob.wet_total_cost} 元</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">1. 實際出爐乾貨重量 (KG)</label>
                <input
                  type="number"
                  step="0.001"
                  value={dryModalData.dryWeightYield}
                  onChange={(e) => setDryModalData({ ...dryModalData, dryWeightYield: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono font-bold"
                  required
                />
                <span className="text-[9px] text-text-charcoal/50 block mt-1 leading-normal">
                  出爐脫水重量一般為生料的 20%~30%。(目前預設帶入 25%)
                </span>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">2. 製造/出爐日期</label>
                <input
                  type="date"
                  value={dryModalData.manufactureDate}
                  onChange={(e) => setDryModalData({ ...dryModalData, manufactureDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">3. 保存有效期限</label>
                <input
                  type="date"
                  value={dryModalData.expiryDate}
                  onChange={(e) => setDryModalData({ ...dryModalData, expiryDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              {/* 實時動態折算乾料成本 */}
              <div className="bg-brand-accent/10 p-3.5 rounded-xl border border-brand-accent/25">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-text-charcoal">折合乾料成本:</span>
                  <span className="font-mono font-black text-sm text-brand-accent">
                    ${dryModalData.dryWeightYield > 0 
                      ? ((selectedJob.wet_total_cost + (selectedJob.fee_type === 'flat' ? selectedJob.processing_fee : selectedJob.processing_fee * selectedJob.wet_quantity)) / dryModalData.dryWeightYield).toFixed(2) 
                      : 0}
                  </span> 元 / KG
                </div>
              </div>

              {/* 按鈕 */}
              <div className="flex justify-end gap-2 pt-2 border-t border-brand-camel/20">
                <button
                  type="button"
                  onClick={() => {
                    setIsDryModalOpen(false);
                    setSelectedJob(null);
                  }}
                  className="bg-canvas-bg border border-brand-camel text-text-charcoal px-4 py-2 rounded-xl hover:bg-canvas-alt transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="bg-brand-accent text-canvas-bg px-5 py-2 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  確認登記出爐
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================
          實時輔助：總倉庫存明細 (批次明細)
          ======================================================== */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/30 shadow-sm space-y-3 no-print">
        <h3 className="text-xs font-bold text-text-charcoal flex items-center gap-1.5 opacity-85">
          <Info className="w-4.5 h-4.5 text-brand-camel" />
          總倉目前可用原料與耗材在庫量 (批次明細)
        </h3>
        
        <div className="overflow-x-auto text-[10px]">
          <table className="w-full text-left text-text-charcoal/80">
            <thead>
              <tr className="border-b border-brand-camel/20 text-text-charcoal/45">
                <th className="py-1.5 px-2.5">物料種類名稱</th>
                <th className="py-1.5 px-2.5">分類</th>
                <th className="py-1.5 px-2.5">在庫批號</th>
                <th className="py-1.5 px-2.5">單位成本</th>
                <th className="py-1.5 px-2.5">有效期限</th>
                <th className="py-1.5 px-2.5 text-right">在庫數量</th>
                {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                  <th className="py-1.5 px-2.5 text-center">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {stocks.filter(s => s.warehouse_id === 'WH_MAIN' && s.quantity > 0).map(s => {
                const mat = materials.find(m => m.material_id === s.product_or_material_id);
                // 排除成品商品，只展示原料與耗材
                if (!mat) return null;
                const b = batches.find(batch => batch.batch_no === s.batch_no);
                
                return (
                  <tr key={s.stock_id} className="border-b border-brand-camel/10 hover:bg-canvas-bg/20">
                    <td className="py-1.5 px-2.5 font-bold text-text-charcoal">{mat.name}</td>
                    <td className="py-1.5 px-2.5">
                      <span className="bg-brand-camel/20 text-text-charcoal text-[9px] px-1.5 py-0.25 rounded">
                        {mat.category}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5 font-mono text-text-charcoal/65">{s.batch_no}</td>
                    <td className="py-1.5 px-2.5 font-mono">${b?.unit_cost || 0}</td>
                    <td className="py-1.5 px-2.5 font-mono text-[9px]">{b?.expiry_date || 'N/A'}</td>
                    <td className="py-1.5 px-2.5 text-right font-mono font-bold text-brand-primary">
                      {s.quantity} {mat.type === 'CONSUMABLE' ? '個/張' : 'KG'}
                    </td>
                    {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                      <td className="py-1.5 px-2.5 text-center">
                        <div className="inline-flex gap-1.5 justify-center">
                          <button
                            onClick={() => startEditingStock(s, b)}
                            className="p-0.5 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                            title="編輯庫存批次"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteStock(s.stock_id)}
                            className="p-0.5 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                            title="刪除庫存記錄"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 編輯庫存批次 Modal */}
      {editingStock && (
        <div className="fixed inset-0 bg-text-charcoal/50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-canvas-bg max-w-md w-full rounded-2xl p-6 border border-brand-camel shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-camel/30 pb-2">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-brand-primary" />
                編輯總倉庫存批次明細
              </h3>
              <button onClick={() => setEditingStock(null)} className="text-text-charcoal/50 hover:text-text-charcoal">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleEditStockSubmit} className="space-y-3.5">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/70">物料名稱</label>
                <input
                  type="text"
                  value={editingStock.matName}
                  disabled
                  className="w-full bg-canvas-alt border border-brand-camel/50 rounded-lg px-2.5 py-2 text-text-charcoal/60 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">在庫批號</label>
                  <input
                    type="text"
                    value={editingStock.batchNo}
                    disabled
                    className="w-full bg-canvas-alt border border-brand-camel/50 rounded-lg px-2.5 py-2 text-text-charcoal/60 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70 font-sans">在庫數量 (KG 或 個/張)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={editingStock.quantity}
                    onChange={(e) => setEditingStock({ ...editingStock, quantity: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/70">單位成本 ($)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editingStock.unitCost}
                  onChange={(e) => setEditingStock({ ...editingStock, unitCost: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70 font-sans">製造日期</label>
                  <input
                    type="date"
                    value={editingStock.manufactureDate}
                    onChange={(e) => setEditingStock({ ...editingStock, manufactureDate: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 text-text-charcoal"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70 font-sans">有效期限</label>
                  <input
                    type="date"
                    value={editingStock.expiryDate}
                    onChange={(e) => setEditingStock({ ...editingStock, expiryDate: e.target.value })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 text-text-charcoal"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2 text-xs font-sans">
                <button
                  type="button"
                  onClick={() => setEditingStock(null)}
                  className="w-1/2 border border-brand-camel text-text-charcoal py-2 px-4 rounded-xl hover:bg-canvas-alt font-bold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-primary text-canvas-bg py-2 px-4 rounded-xl hover:opacity-90 font-bold"
                >
                  確認修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
