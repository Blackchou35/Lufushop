// 寵物凍乾與寄賣 ERP - 多方案平行對比與定價模擬模組 (定價矩陣、毛利率逆推與損益兩平警告)
import React, { useState, useEffect } from 'react';
import { getDb, getCurrentUser } from '../lib/db';
import { dbService } from '../services/dbService';
import { Warehouse, InventoryBatch, FeeType, WarehouseType } from '../types/erp';
import { Scale, Target, Landmark, Percent, HelpCircle, ShieldAlert, Award, Pencil, Trash2, Plus, X, Store } from 'lucide-react';

export const PricingSimulator: React.FC = () => {
  const db = getDb();
  const batches = dbService.getInventoryBatches();
  
  // 權限檢查
  const currentUser = getCurrentUser();
  const isAdmin = currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN');

  // 1. 模擬基礎設定
  const [costSetup, setCostSetup] = useState({
    selectedBatchNo: '',
    landingCost: 55, // 單包落地成本 C
    batchSize: 100, // 當批生產總量
    packMaterialCost: 10, // 單包成品包材與耗材總額 C_pack
  });

  // 2. 合作通路狀態 (用於動態編輯費率與即時試算)
  const [warehousesList, setWarehousesList] = useState<Warehouse[]>([]);

  // 商家管理狀態
  const [isAddingWh, setIsAddingWh] = useState(false);
  const [newWh, setNewWh] = useState<{ warehouse_id: string; name: string; type: WarehouseType; fee_type: FeeType; fee_value: number }>({
    warehouse_id: '',
    name: '',
    type: 'CONSIGNMENT',
    fee_type: 'NONE',
    fee_value: 0
  });
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);

  // 3. 目標毛利率模擬 (M)
  const [targetMargin, setTargetMargin] = useState(50); // 0 - 90 %

  // 4. 預估售價設定 (每個通道各自模擬)
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // 5. 市場競品錨定設定
  const [competitor, setCompetitor] = useState({
    price: 150,
    adjustmentRate: 10, // 溢價 % (如 +10 代表 10, -5 代表 -5)
  });

  // 從資料庫中計算商品的包裝耗材費用
  const getProductPackMaterialCost = (productId: string) => {
    const recipes = db.bom_recipes.filter(r => r.product_id === productId);
    let totalPackCost = 0;
    
    recipes.forEach(r => {
      const mat = db.materials.find(m => m.material_id === r.material_id);
      if (mat && mat.type === 'CONSUMABLE') {
        // 找出該耗材的最新批次單價
        const matBatches = db.inventory_batches.filter(b => b.item_id === r.material_id && b.item_type === 'MATERIAL');
        let unitCost = 0;
        if (matBatches.length > 0) {
          const sorted = [...matBatches].sort((a, b) => b.manufacture_date.localeCompare(a.manufacture_date));
          unitCost = sorted[0].unit_cost;
        } else {
          // 預設耗材估算單價
          if (r.material_id.includes('BAG')) unitCost = 2; // 袋子
          else if (r.material_id.includes('STICK')) unitCost = 1; // 貼紙
          else if (r.material_id.includes('DESI')) unitCost = 0.5; // 乾燥劑
          else unitCost = 1;
        }
        totalPackCost += r.quantity_required * unitCost;
      }
    });
    
    return Number(totalPackCost.toFixed(2));
  };

  // 當選擇批次時，自動帶入該批次之 Landing Cost 與包材耗材費，並同步推算各通路自訂價
  const handleBatchSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bNo = e.target.value;
    if (!bNo) {
      setCostSetup({ ...costSetup, selectedBatchNo: '' });
      return;
    }
    const batch = batches.find(b => b.batch_no === bNo);
    if (batch) {
      const calculatedPackCost = getProductPackMaterialCost(batch.item_id);
      setCostSetup({
        ...costSetup,
        selectedBatchNo: bNo,
        landingCost: batch.unit_cost,
        packMaterialCost: calculatedPackCost
      });

      // 同步推估新單包成本的自訂單價
      const newPrices: Record<string, number> = {};
      warehousesList.forEach(w => {
        const fee_p = w.fee_type === 'PERCENT' ? w.fee_value : 0;
        const fee_f = w.fee_type === 'FLAT' ? w.fee_value : 0;
        const M = 0.5;
        const C = batch.unit_cost;
        let p = (C + fee_f) / (1 - M - fee_p);
        if (p <= 0 || isNaN(p) || !isFinite(p)) p = C * 2;
        newPrices[w.warehouse_id] = Math.round(p);
      });
      setCustomPrices(newPrices);
    }
  };

  // 重新載入分倉商店清單，並動態補齊自訂售價
  const loadWarehouses = () => {
    const dbWhs = dbService.getWarehouses();
    setWarehousesList(dbWhs);

    setCustomPrices(prev => {
      const updated = { ...prev };
      dbWhs.forEach(w => {
        if (updated[w.warehouse_id] === undefined) {
          const fee_p = w.fee_type === 'PERCENT' ? w.fee_value : 0;
          const fee_f = w.fee_type === 'FLAT' ? w.fee_value : 0;
          const M = 0.5;
          const C = costSetup.landingCost;
          
          let p = (C + fee_f) / (1 - M - fee_p);
          if (p <= 0 || isNaN(p) || !isFinite(p)) p = C * 2;
          updated[w.warehouse_id] = Math.round(p);
        }
      });
      return updated;
    });
  };

  // 初始化自訂售價與預設帶入
  useEffect(() => {
    loadWarehouses();
  }, []);

  // 新增商家
  const handleAddWh = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWh.warehouse_id.trim() || !newWh.name.trim()) {
      alert('請填寫完整的分倉代號與店名！');
      return;
    }
    try {
      dbService.addWarehouse({
        warehouse_id: newWh.warehouse_id.trim().toUpperCase(),
        name: newWh.name.trim(),
        type: newWh.type,
        fee_type: newWh.fee_type,
        fee_value: Number(newWh.fee_value)
      });
      alert(`成功建立合作通路：${newWh.name}`);
      setIsAddingWh(false);
      setNewWh({ warehouse_id: '', name: '', type: 'CONSIGNMENT', fee_type: 'NONE', fee_value: 0 });
      loadWarehouses();
    } catch (err: any) {
      alert(`建立失敗：${err.message}`);
    }
  };

  // 編輯商家資料
  const handleEditWh = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWh) return;
    if (!editingWh.name.trim()) {
      alert('請填寫店名/分倉名稱！');
      return;
    }
    try {
      dbService.editWarehouse(editingWh.warehouse_id, {
        name: editingWh.name.trim(),
        type: editingWh.type,
        fee_type: editingWh.fee_type,
        fee_value: Number(editingWh.fee_value)
      });
      alert(`已成功更新「${editingWh.name}」的設定！`);
      setEditingWh(null);
      loadWarehouses();
    } catch (err: any) {
      alert(`更新失敗：${err.message}`);
    }
  };

  // 刪除商家
  const handleDeleteWh = (warehouseId: string) => {
    if (warehouseId === 'WH_MAIN') {
      alert('此為工廠防潮總倉，不可刪除！');
      return;
    }
    const wh = warehousesList.find(w => w.warehouse_id === warehouseId);
    if (!wh) return;
    
    if (!confirm(`確定要刪除合作分倉「${wh.name}」嗎？此操作不可逆。`)) {
      return;
    }
    
    try {
      dbService.deleteWarehouse(warehouseId);
      alert(`成功刪除分倉：${wh.name}`);
      setEditingWh(null);
      loadWarehouses();
    } catch (err: any) {
      alert(`刪除失敗：${err.message}`);
    }
  };

  // 變更通路本機設定 (觸發即時計算)
  const handleWarehouseFeeChange = (warehouseId: string, fields: Partial<Warehouse>) => {
    setWarehousesList(prev => prev.map(w => {
      if (w.warehouse_id === warehouseId) {
        return { ...w, ...fields };
      }
      return w;
    }));
  };

  // 持久化儲存通路抽成費率設定
  const handleSaveWarehouseFee = (wh: Warehouse) => {
    try {
      dbService.editWarehouse(wh.warehouse_id, {
        fee_type: wh.fee_type,
        fee_value: wh.fee_value
      });
      alert(`已成功儲存「${wh.name}」的抽成設定！`);
    } catch (err: any) {
      alert(`儲存失敗: ${err.message}`);
    }
  };

  // 套用競品錨定售價
  const applyCompetitorPrice = () => {
    const anchorPrice = Math.round(competitor.price * (1 + competitor.adjustmentRate / 100));
    const newPrices = { ...customPrices };
    Object.keys(newPrices).forEach(k => {
      newPrices[k] = anchorPrice;
    });
    setCustomPrices(newPrices);
  };

  // 定價矩陣計算器 (依據 warehousesList 狀態進行計算)
  const matrixData = warehousesList.map(wh => {
    const C = costSetup.landingCost;
    const F_flat = wh.fee_type === 'FLAT' ? wh.fee_value : 0;
    const R_percent = wh.fee_type === 'PERCENT' ? wh.fee_value : 0;
    
    // A. 目標毛利率逆推建議零售價 (公式 7.3)
    const M_decimal = targetMargin / 100;
    const denominator = 1 - M_decimal - R_percent;
    let suggestedPrice = 0;
    if (denominator > 0) {
      suggestedPrice = Number(((C + F_flat) / denominator).toFixed(2));
    }

    // B. 自訂/預估售價逆推利潤指標 (公式 7.4)
    const P = customPrices[wh.warehouse_id] || Math.round(suggestedPrice) || 100;
    const channelFee = Number((F_flat + (P * R_percent)).toFixed(2));
    const grossProfit = Number((P - channelFee - C).toFixed(2));
    const grossMargin = P > 0 ? Number(((grossProfit / P) * 100).toFixed(1)) : 0;

    // C. 損益兩平銷量計算 (公式 7.5)
    // Q = TC_batch / (P - P*R - F_flat - C_pack)
    // TC_batch = batchSize * C
    const TC_batch = costSetup.batchSize * C;
    const netRevenuePerUnit = P - (P * R_percent) - F_flat - costSetup.packMaterialCost;
    let breakevenQ = 0;
    if (netRevenuePerUnit > 0) {
      breakevenQ = Math.ceil(TC_batch / netRevenuePerUnit);
    } else {
      breakevenQ = 999999; // 代表定價過低，單包甚至無法覆蓋變動包材費
    }

    // 判斷是否低於兩平點 (若損益兩平包數大於當批生產總量，代表注定虧損)
    const isUnderBreakeven = breakevenQ > costSetup.batchSize || netRevenuePerUnit <= 0;

    return {
      wh,
      suggestedPrice,
      customPrice: P,
      channelFee,
      grossProfit,
      grossMargin,
      breakevenQ,
      isUnderBreakeven
    };
  });

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h2 className="text-2xl font-black text-text-charcoal flex items-center gap-2">
          🏷️ 價格與利潤試算 (定價與損益分析)
        </h2>
        <p className="text-sm text-text-charcoal/70">
          在這裡可以試算在不同商店、網店賣東西時的利潤，你可以拉動下方「期望獲利」滑桿來算出建議零售價，也可以自訂想賣的價格，系統會自動幫你計算出「最少要賣幾包才不虧錢」的損益平衡點。
        </p>
      </div>

      {/* 設定與競品錨定區 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 左側：成本基礎設定 (7格寬) */}
        <div className="lg:col-span-7 bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
            <Scale className="w-4.5 h-4.5 text-brand-primary" />
            產品成本與分裝包數設定
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-text-charcoal/75">1. 選擇已分裝的成品批次 (自動帶入成本)</label>
              <select
                value={costSetup.selectedBatchNo}
                onChange={handleBatchSelect}
                className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              >
                <option value="">-- 手動輸入成本模式 --</option>
                {batches.filter(b => b.item_type === 'PRODUCT').map(b => {
                  const prod = db.products.find(p => p.product_id === b.item_id);
                  const productName = prod ? `${prod.name} (${prod.sku_spec})` : '未知商品';
                  return (
                    <option key={b.batch_no} value={b.batch_no}>
                      {productName} - 批號: {b.batch_no} (成本 ${b.unit_cost}/包)
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-text-charcoal/75">商品單包成本 ($/包)</label>
              <input
                type="number"
                value={costSetup.landingCost}
                onChange={(e) => {
                  const newCost = Number(e.target.value);
                  setCostSetup({ ...costSetup, landingCost: newCost, selectedBatchNo: '' });
                  
                  // 同步更動自訂售價
                  const newPrices = { ...customPrices };
                  warehousesList.forEach(w => {
                    const fee_p = w.fee_type === 'PERCENT' ? w.fee_value : 0;
                    const fee_f = w.fee_type === 'FLAT' ? w.fee_value : 0;
                    const M = 0.5;
                    let p = (newCost + fee_f) / (1 - M - fee_p);
                    if (p <= 0 || isNaN(p) || !isFinite(p)) p = newCost * 2;
                    newPrices[w.warehouse_id] = Math.round(p);
                  });
                  setCustomPrices(newPrices);
                }}
                className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-text-charcoal/75">本批分裝的總包數</label>
              <input
                type="number"
                value={costSetup.batchSize}
                onChange={(e) => setCostSetup({ ...costSetup, batchSize: Number(e.target.value) })}
                className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-text-charcoal/75">單包成品所用之包材與耗材費 ($)</label>
              <input
                type="number"
                value={costSetup.packMaterialCost}
                onChange={(e) => setCostSetup({ ...costSetup, packMaterialCost: Number(e.target.value) })}
                className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
              />
            </div>
          </div>
        </div>

        {/* 右側：競品錨定模式 (5格寬) */}
        <div className="lg:col-span-5 bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
            <Award className="w-4.5 h-4.5 text-brand-accent animate-pulse" />
            參考市場對手售價
          </h3>
          
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">對手零售價 ($)</label>
                <input
                  type="number"
                  value={competitor.price}
                  onChange={(e) => setCompetitor({ ...competitor, price: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">希望比對手貴/便宜多少 (%)</label>
                <input
                  type="number"
                  placeholder="如：+10 或 -5"
                  value={competitor.adjustmentRate}
                  onChange={(e) => setCompetitor({ ...competitor, adjustmentRate: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                />
              </div>
            </div>

            <div className="bg-canvas-bg p-3.5 rounded-xl border border-brand-camel/30 flex justify-between items-center text-xs">
              <span className="text-text-charcoal/70">預計我方定位價格:</span>
              <span className="font-bold text-brand-accent font-mono text-sm">
                ${Math.round(competitor.price * (1 + competitor.adjustmentRate / 100))} 元
              </span>
            </div>

            <button
              type="button"
              onClick={applyCompetitorPrice}
              className="w-full bg-brand-camel text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
            >
              一鍵帶入下方所有通路的自訂售價
            </button>
          </div>
        </div>

      </div>

      {/* 滑動毛利率逆推滑桿 */}
      <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
        <div className="flex justify-between items-center text-xs font-semibold text-text-charcoal/80">
          <span className="flex items-center gap-1.5"><Target className="w-4 h-4 text-brand-primary" /> 希望達到的獲利成數 (期望毛利率)</span>
          <span className="text-brand-accent font-mono text-base font-bold">{targetMargin}%</span>
        </div>
        
        {/* 滑桿設計 */}
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="90"
            step="1"
            value={targetMargin}
            onChange={(e) => setTargetMargin(Number(e.target.value))}
            className="w-full accent-brand-primary cursor-pointer"
          />
        </div>
      </div>

      {/* 核心平行定價模擬矩陣 (Pricing Matrix View) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {matrixData.map(({ wh, suggestedPrice, customPrice, channelFee, grossProfit, grossMargin, breakevenQ, isUnderBreakeven }) => {
          return (
            <div 
              key={wh.warehouse_id} 
              className={`bg-canvas-alt p-5 rounded-2xl border shadow-sm transition-all flex flex-col justify-between h-auto min-h-[30rem] ${
                isUnderBreakeven 
                  ? 'border-brand-accent/60 ring-1 ring-brand-accent/20 bg-brand-accent/5' 
                  : 'border-brand-camel/40 hover:border-brand-primary'
              }`}
            >
              {/* 卡片頭部 */}
              <div>
                <div className="flex justify-between items-start">
                  <div className="max-w-[70%]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h4 className="font-black text-text-charcoal text-sm truncate" title={wh.name}>{wh.name}</h4>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setEditingWh(wh)}
                          className="text-text-charcoal/40 hover:text-brand-primary p-0.5 rounded transition-colors shrink-0"
                          title="編輯基本資料"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-text-charcoal/50 block mt-0.5">
                      {wh.type === 'INTERNAL' ? '直營零售' : wh.type === 'CONSIGNMENT' ? '商店寄賣' : '網路電商'}
                    </span>
                  </div>
                  <span className="text-[10px] bg-brand-camel/10 text-brand-camel border border-brand-camel/30 px-2 py-0.5 rounded font-mono shrink-0">
                    {wh.fee_type === 'FLAT' ? `$${wh.fee_value} /包` : wh.fee_type === 'PERCENT' ? `${wh.fee_value * 100}% 抽` : '免手續費'}
                  </span>
                </div>

                {/* 逆推建議價 */}
                <div className="mt-4 bg-canvas-bg/65 p-2.5 rounded-xl border border-brand-camel/20">
                  <span className="text-[10px] text-text-charcoal/55 block">期望獲利 {targetMargin}% 的建議售價</span>
                  <span className="text-base font-bold text-brand-primary font-mono mt-0.5 block">
                    {suggestedPrice > 0 ? `$${suggestedPrice}` : '無建議售價'}
                  </span>
                </div>
              </div>

              {/* 預計零售價自訂調整 */}
              <div className="mt-3">
                <label className="block text-[10px] font-bold text-text-charcoal/70 mb-1">自訂想賣的單價 ($)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customPrice}
                    onChange={(e) => {
                      const newPrices = { ...customPrices };
                      newPrices[wh.warehouse_id] = Number(e.target.value);
                      setCustomPrices(newPrices);
                    }}
                    className="w-full text-xs bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 font-bold text-text-charcoal font-mono"
                  />
                </div>
              </div>

              {/* 動態抽成與手續費調整區 */}
              <div className="mt-3 bg-canvas-bg/30 p-2 rounded-xl border border-brand-camel/15 space-y-2">
                <span className="text-[9px] font-bold text-text-charcoal/65 block">調整此地點的抽成與手續費：</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] text-text-charcoal/50 block mb-0.5">抽成方式</label>
                    <select
                      value={wh.fee_type}
                      onChange={(e) => {
                        const newType = e.target.value as FeeType;
                        let newVal = wh.fee_value;
                        if (newType === 'NONE') newVal = 0;
                        handleWarehouseFeeChange(wh.warehouse_id, { fee_type: newType, fee_value: newVal });
                      }}
                      className="w-full text-[10px] bg-canvas-bg border border-brand-camel rounded px-1.5 py-1 text-text-charcoal font-medium"
                    >
                      <option value="NONE">免手續費</option>
                      <option value="FLAT">固定扣費 ($/包)</option>
                      <option value="PERCENT">比例抽成 (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] text-text-charcoal/50 block mb-0.5">
                      {wh.fee_type === 'PERCENT' ? '抽成比例 (%)' : wh.fee_type === 'FLAT' ? '扣費金額 ($)' : '無'}
                    </label>
                    <input
                      type="number"
                      disabled={wh.fee_type === 'NONE'}
                      value={wh.fee_type === 'PERCENT' ? Number((wh.fee_value * 100).toFixed(1)) : wh.fee_value}
                      onChange={(e) => {
                        let val = Number(e.target.value);
                        if (wh.fee_type === 'PERCENT') {
                          val = val / 100;
                        }
                        handleWarehouseFeeChange(wh.warehouse_id, { fee_value: val });
                      }}
                      className="w-full text-[10px] bg-canvas-bg border border-brand-camel rounded px-1.5 py-1 text-text-charcoal disabled:opacity-50 font-mono"
                    />
                  </div>
                </div>
                {wh.fee_type !== 'NONE' && (
                  <button
                    type="button"
                    onClick={() => handleSaveWarehouseFee(wh)}
                    className="w-full bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary text-[9px] font-bold py-1 px-1.5 rounded transition-colors flex items-center justify-center gap-1"
                  >
                    💾 儲存此處設定
                  </button>
                )}
              </div>

              {/* 通路利潤反算區 */}
              <div className="space-y-1.5 border-t border-brand-camel/20 pt-3 mt-3">
                <div className="flex justify-between text-[10px] text-text-charcoal/65">
                  <span>通路費用:</span>
                  <span className="font-mono">${channelFee}</span>
                </div>

                <div className="flex justify-between text-[10px] text-text-charcoal/65">
                  <span>單包淨賺利潤:</span>
                  <span className={`font-mono font-bold ${isUnderBreakeven ? 'text-brand-accent' : 'text-brand-primary'}`}>
                    ${grossProfit}
                  </span>
                </div>

                <div className="flex justify-between text-xs font-bold text-text-charcoal/85">
                  <span>實際利潤成數:</span>
                  <span className={`font-mono ${isUnderBreakeven ? 'text-brand-accent' : 'text-brand-primary'}`}>
                    {grossMargin}%
                  </span>
                </div>

                <div className="flex justify-between text-[10px] border-t border-brand-camel/15 pt-1.5 text-text-charcoal/65 items-center">
                  <span>最少要賣幾包才不虧錢:</span>
                  <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${
                    isUnderBreakeven ? 'bg-brand-accent/20 text-brand-accent font-black' : 'bg-brand-primary/10 text-brand-primary'
                  }`}>
                    {breakevenQ === 999999 ? '虧本售價' : `${breakevenQ} 包`}
                  </span>
                </div>
              </div>

              {/* 兩平警告指示 */}
              {isUnderBreakeven && (
                <div className="text-[9px] bg-brand-accent/15 border border-brand-accent/25 rounded-md p-1.5 text-brand-accent mt-2 font-medium flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>警告: 價格定太低，就算全賣完還是虧本！</span>
                </div>
              )}
            </div>
          );
        })}

        {/* 新增合作通路卡片 */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setNewWh({ warehouse_id: '', name: '', type: 'CONSIGNMENT', fee_type: 'NONE', fee_value: 0 });
              setIsAddingWh(true);
            }}
            className="bg-canvas-alt/50 p-5 rounded-2xl border-2 border-dashed border-brand-camel/50 hover:border-brand-primary hover:bg-canvas-alt transition-all flex flex-col justify-center items-center h-auto min-h-[30rem] text-text-charcoal/50 hover:text-brand-primary group gap-3"
          >
            <div className="w-12 h-12 rounded-full border-2 border-dashed border-brand-camel/70 group-hover:border-brand-primary flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6 text-brand-camel group-hover:text-brand-primary transition-colors" />
            </div>
            <div className="text-center">
              <span className="font-bold text-sm block text-text-charcoal group-hover:text-brand-primary transition-colors">新增合作商家/通路</span>
              <span className="text-[10px] text-text-charcoal/40 mt-1 block">建立新的分倉商店、電商或實體寄賣點</span>
            </div>
          </button>
        )}
      </div>

      {/* 新增商家 Modal */}
      {isAddingWh && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-canvas-alt rounded-2xl border border-brand-camel/40 shadow-xl max-w-md w-full p-6 space-y-4 relative">
            <button 
              type="button"
              onClick={() => setIsAddingWh(false)}
              className="absolute top-4 right-4 text-text-charcoal/40 hover:text-text-charcoal"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2 border-b border-brand-camel/20 pb-3">
              <Store className="w-5 h-5 text-brand-primary" />
              <h3 className="text-base font-bold text-text-charcoal">新增合作分倉商店</h3>
            </div>

            <form onSubmit={handleAddWh} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/70">倉庫 ID (大寫英文代號，例如: WH_MOBI)</label>
                <input
                  type="text"
                  placeholder="如: WH_XYZ"
                  value={newWh.warehouse_id}
                  onChange={(e) => setNewWh({ ...newWh, warehouse_id: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono uppercase font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/70">店名/管道名稱</label>
                <input
                  type="text"
                  placeholder="如: 萌寵樂園寵物店"
                  value={newWh.name}
                  onChange={(e) => setNewWh({ ...newWh, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">管道類型</label>
                  <select
                    value={newWh.type}
                    onChange={(e) => setNewWh({ ...newWh, type: e.target.value as any })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-2 text-text-charcoal"
                  >
                    <option value="CONSIGNMENT">線下寄賣點</option>
                    <option value="PLATFORM">線上電商平台</option>
                    <option value="INTERNAL">總部直營倉</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">預設抽成方式</label>
                  <select
                    value={newWh.fee_type}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setNewWh({ ...newWh, fee_type: newType, fee_value: 0 });
                    }}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-2 text-text-charcoal"
                  >
                    <option value="NONE">免手續費</option>
                    <option value="FLAT">固定扣費 ($/包)</option>
                    <option value="PERCENT">比例抽成 (%)</option>
                  </select>
                </div>
              </div>

              {newWh.fee_type !== 'NONE' && (
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">
                    {newWh.fee_type === 'PERCENT' ? '預設抽成費率 (%)' : '預設單包扣費 ($)'}
                  </label>
                  <input
                    type="number"
                    placeholder={newWh.fee_type === 'PERCENT' ? '例如 10 代表 10%' : '例如 5 代表每包扣 5 元'}
                    value={newWh.fee_type === 'PERCENT' ? (newWh.fee_value * 100 || '') : (newWh.fee_value || '')}
                    onChange={(e) => {
                      let val = Number(e.target.value);
                      if (newWh.fee_type === 'PERCENT') {
                        val = val / 100;
                      }
                      setNewWh({ ...newWh, fee_value: val });
                    }}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
              )}

              <div className="flex gap-3 pt-3 border-t border-brand-camel/20 mt-4">
                <button
                  type="button"
                  onClick={() => setIsAddingWh(false)}
                  className="flex-1 bg-canvas-bg border border-brand-camel text-text-charcoal/80 font-bold py-2.5 px-4 rounded-xl hover:bg-canvas-bg/60 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
                >
                  確認新增
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編輯商家 Modal */}
      {editingWh && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-canvas-alt rounded-2xl border border-brand-camel/40 shadow-xl max-w-md w-full p-6 space-y-4 relative">
            <button 
              type="button"
              onClick={() => setEditingWh(null)}
              className="absolute top-4 right-4 text-text-charcoal/40 hover:text-text-charcoal"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2 border-b border-brand-camel/20 pb-3">
              <Store className="w-5 h-5 text-brand-primary" />
              <h3 className="text-base font-bold text-text-charcoal">編輯分倉商店資料</h3>
            </div>

            <form onSubmit={handleEditWh} className="space-y-3.5 text-xs text-left">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/50">倉庫 ID (不可修改)</label>
                <input
                  type="text"
                  value={editingWh.warehouse_id}
                  disabled
                  className="w-full bg-canvas-bg/50 border border-brand-camel/60 rounded-lg px-2.5 py-2 text-text-charcoal/55 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/70">店名/管道名稱</label>
                <input
                  type="text"
                  placeholder="如: 萌寵樂園寵物店"
                  value={editingWh.name}
                  onChange={(e) => setEditingWh({ ...editingWh, name: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">管道類型</label>
                  <select
                    value={editingWh.type}
                    onChange={(e) => setEditingWh({ ...editingWh, type: e.target.value as any })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-2 text-text-charcoal"
                  >
                    <option value="CONSIGNMENT">線下寄賣點</option>
                    <option value="PLATFORM">線上電商平台</option>
                    <option value="INTERNAL">總部直營倉</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">預設抽成方式</label>
                  <select
                    value={editingWh.fee_type}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setEditingWh({ ...editingWh, fee_type: newType, fee_value: 0 });
                    }}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2 py-2 text-text-charcoal"
                  >
                    <option value="NONE">免手續費</option>
                    <option value="FLAT">固定扣費 ($/包)</option>
                    <option value="PERCENT">比例抽成 (%)</option>
                  </select>
                </div>
              </div>

              {editingWh.fee_type !== 'NONE' && (
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/70">
                    {editingWh.fee_type === 'PERCENT' ? '預設抽成費率 (%)' : '預設單包扣費 ($)'}
                  </label>
                  <input
                    type="number"
                    placeholder={editingWh.fee_type === 'PERCENT' ? '例如 10 代表 10%' : '例如 5 代表每包扣 5 元'}
                    value={editingWh.fee_type === 'PERCENT' ? Number((editingWh.fee_value * 100).toFixed(1)) : editingWh.fee_value}
                    onChange={(e) => {
                      let val = Number(e.target.value);
                      if (editingWh.fee_type === 'PERCENT') {
                        val = val / 100;
                      }
                      setEditingWh({ ...editingWh, fee_value: val });
                    }}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal font-mono"
                    required
                  />
                </div>
              )}

              <div className="flex justify-between items-center gap-3 pt-3 border-t border-brand-camel/20 mt-4">
                {editingWh.warehouse_id !== 'WH_MAIN' ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteWh(editingWh.warehouse_id)}
                    className="bg-warm-red/10 border border-warm-red/30 text-warm-red font-bold py-2.5 px-4 rounded-xl hover:bg-warm-red hover:text-canvas-bg transition-colors text-xs flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 刪除商家
                  </button>
                ) : (
                  <div />
                )}
                
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingWh(null)}
                    className="bg-canvas-bg border border-brand-camel text-text-charcoal/80 font-bold py-2.5 px-4 rounded-xl hover:bg-canvas-bg/60 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
                  >
                    儲存變更
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default PricingSimulator;
