// 寵物凍乾與寄賣 ERP - 多倉儲存貨管理頁面 (雙軌制庫存、調撥簽收單 A4 PDF 預覽與列印、行銷損耗)
import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/dbService';
import { Warehouse, WarehouseStock, Product, Material, InventoryBatch } from '../types/erp';
import { Warehouse as WhIcon, ArrowRightLeft, FileText, Plus, ShieldAlert, Sparkles, Printer, CheckCircle, AlertCircle, Pencil, Trash2, X } from 'lucide-react';
import { getCurrentUser } from '../lib/db';
import { translateChineseName } from '../utils/idTranslator';

export const WarehouseManager: React.FC = () => {
  const user = getCurrentUser();
  const [activeSubTab, setActiveSubTab] = useState<'bulk' | 'packaged' | 'transfer'>('bulk');
  
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stocks, setStocks] = useState<WarehouseStock[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);

  // 新增倉庫表單
  const [newWh, setNewWh] = useState({
    warehouse_id: '',
    name: '',
    type: 'CONSIGNMENT' as Warehouse['type'],
    fee_type: 'FLAT' as Warehouse['fee_type'],
    fee_value: 5
  });

  // 調撥表單
  const [transfer, setTransfer] = useState({
    productId: '',
    fromWhId: 'WH_MAIN',
    toWhId: '',
    quantity: 10,
    isMarketingLoss: false
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 調撥簽收單預覽狀態
  const [printInvoice, setPrintInvoice] = useState<{
    transferId: string;
    date: string;
    productName: string;
    qty: number;
    fromName: string;
    toName: string;
    isLoss: boolean;
    batches: { batch_no: string; qty: number }[];
  } | null>(null);

  const loadData = () => {
    setWarehouses(dbService.getWarehouses());
    setStocks(dbService.getWarehouseStocks());
    setProducts(dbService.getProducts());
    setMaterials(dbService.getMaterials());
    setBatches(dbService.getInventoryBatches());
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
    const prod = products.find(p => p.product_id === s.product_or_material_id);
    const name = mat?.name || prod?.name || s.product_or_material_id;
    setEditingStock({
      stockId: s.stock_id,
      batchNo: s.batch_no,
      matName: name,
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

  // 新增倉庫
  const handleAddWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const name = newWh.name.trim();
      if (!name) throw new Error('請填寫商店/管道名稱！');
      
      const translatedPieces = translateChineseName(name);
      const pinyinFragment = translatedPieces.join('_').toUpperCase();
      const randomNum = Math.floor(Math.random() * 90) + 10;
      const generatedWhId = pinyinFragment ? `WH_${pinyinFragment}_${randomNum}` : `WH_SHOP_${Date.now()}`;
      
      const finalWh = {
        ...newWh,
        warehouse_id: generatedWhId
      };

      dbService.addWarehouse(finalWh);
      setNotification({ type: 'success', message: `成功新增通路倉儲 [${newWh.name}]！` });
      setNewWh({ warehouse_id: '', name: '', type: 'CONSIGNMENT', fee_type: 'FLAT', fee_value: 5 });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 執行調撥
  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!transfer.productId || !transfer.toWhId) {
        throw new Error('請填寫完整商品與目的分倉！');
      }
      if (transfer.fromWhId === transfer.toWhId) {
        throw new Error('來源倉與目的倉不能相同！');
      }

      // 直接呼叫服務執行真實調撥
      dbService.transferStock(
        transfer.productId,
        transfer.fromWhId,
        transfer.toWhId,
        transfer.quantity,
        transfer.isMarketingLoss
      );

      // 獲取剛剛寫入的最後一筆日誌（用來產生簽收單 PDF）
      const lastAudit = dbService.getAuditLogs()[0];
      const deductedBatches = lastAudit && lastAudit.new_values?.deductions 
        ? lastAudit.new_values.deductions.map((d: any) => ({ batch_no: d.batch_no, qty: d.quantityDeducted })) 
        : [{ batch_no: 'FIFO 自動選批', qty: transfer.quantity }];

      const pObj = products.find(p => p.product_id === transfer.productId);
      const fWh = warehouses.find(w => w.warehouse_id === transfer.fromWhId);
      const tWh = warehouses.find(w => w.warehouse_id === transfer.toWhId);

      // 設定簽收單列印資料
      setPrintInvoice({
        transferId: `TRF-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(Math.random()*900+100)}`,
        date: new Date().toLocaleDateString('zh-TW'),
        productName: pObj ? `${pObj.name} (${pObj.sku_spec})` : transfer.productId,
        qty: transfer.quantity,
        fromName: fWh ? fWh.name : transfer.fromWhId,
        toName: tWh ? tWh.name : transfer.toWhId,
        isLoss: transfer.isMarketingLoss,
        batches: deductedBatches
      });

      setNotification({ 
        type: 'success', 
        message: `庫存調撥執行成功！已扣減 [${fWh?.name}]，增加 [${tWh?.name}] 庫存，並生成簽收單預覽。` 
      });

      setTransfer({
        ...transfer,
        productId: '',
        quantity: 10,
        isMarketingLoss: false
      });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 列印調撥單
  const triggerPrint = () => {
    window.print();
  };

  // 整理「雙軌制庫存資料」
  // A. 鋁箔大袋半成品庫存 (KG) (原料類型為 RAW_WET, RAW_DRY)
  const bulkStocks = stocks.filter(s => {
    const mat = materials.find(m => m.material_id === s.product_or_material_id);
    return mat && (mat.type === 'RAW_WET' || mat.type === 'RAW_DRY');
  });

  // B. 架上成品庫存 (包/件) (屬於成品商品)
  const packagedStocks = stocks.filter(s => {
    return products.some(p => p.product_id === s.product_or_material_id);
  });

  return (
    <div className="space-y-6">
      {/* 標頭 */}
      <div>
        <h2 className="text-2xl font-black text-text-charcoal flex items-center gap-2">
          📦 倉庫庫存與移貨
        </h2>
        <p className="text-sm text-text-charcoal/70">
          在這裡可以查看目前工廠「大袋原料 (KG)」與各個店家「包裝好成品 (包)」的數量。你可以在這裡把成品移到指定店家、新增新的合作商店，並列印送貨簽收單。
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

      {/* 分頁按鈕 */}
      <div className="flex border-b border-brand-camel/30 gap-2">
        <button
          onClick={() => setActiveSubTab('bulk')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
            activeSubTab === 'bulk' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          大袋肉品原料與半成品 (KG)
        </button>
        <button
          onClick={() => setActiveSubTab('packaged')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
            activeSubTab === 'packaged' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          包裝好的成品 (包)
        </button>
        <button
          onClick={() => setActiveSubTab('transfer')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
            activeSubTab === 'transfer' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-text-charcoal/65 hover:text-brand-primary'
          }`}
        >
          開通新合作商店與移貨
        </button>
      </div>

      {/* 分頁內容 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 左側：數據主表 (8格寬) */}
        <div className="lg:col-span-8 space-y-6">
          
          {activeSubTab === 'bulk' && (
            <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-brand-camel" />
                大袋原料與半成品庫存明細 (KG)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-text-charcoal">
                  <thead>
                    <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50 uppercase">
                      <th className="py-2.5 px-3">物料名稱</th>
                      <th className="py-2.5 px-3">類型</th>
                      <th className="py-2.5 px-3">批號</th>
                      <th className="py-2.5 px-3">製造/有效效期</th>
                      <th className="py-2.5 px-3 font-mono">進價成本</th>
                      <th className="py-2.5 px-3 text-right">在庫量 (KG)</th>
                      {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                        <th className="py-2.5 px-3 text-center">操作</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkStocks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-text-charcoal/45">目前工廠內沒有任何大袋原料或半成品。</td>
                      </tr>
                    ) : (
                      bulkStocks.map(s => {
                        const mat = materials.find(m => m.material_id === s.product_or_material_id);
                        const b = batches.find(batch => batch.batch_no === s.batch_no);
                        return (
                          <tr key={s.stock_id} className="border-b border-brand-camel/20 hover:bg-canvas-bg/35">
                            <td className="py-2.5 px-3 font-bold">{mat?.name || s.product_or_material_id}</td>
                            <td className="py-2.5 px-3">
                              <span className="bg-brand-primary/10 text-brand-primary text-[10px] px-2 py-0.5 rounded">
                                {mat?.type === 'RAW_WET' ? '濕肉原料' : '乾肉半成品'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-text-charcoal/70">{s.batch_no}</td>
                            <td className="py-2.5 px-3 font-mono text-[10px]">
                              {b ? `${b.manufacture_date} / ${b.expiry_date}` : 'N/A'}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {user.role === 'STAFF' ? '***' : `$${b?.unit_cost || 0}`}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold font-mono text-brand-primary">
                              {s.quantity} KG
                            </td>
                            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                              <td className="py-2.5 px-3 text-center">
                                <div className="inline-flex gap-1.5 justify-center">
                                  <button
                                    onClick={() => startEditingStock(s, b)}
                                    className="p-0.5 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                                    title="編輯庫存批次"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStock(s.stock_id)}
                                    className="p-0.5 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                                    title="刪除庫存記錄"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSubTab === 'packaged' && (
            <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-brand-camel" />
                各商店包裝成品庫存分佈 (包)
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-text-charcoal">
                  <thead>
                    <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50 uppercase">
                      <th className="py-2.5 px-3">商品名稱</th>
                      <th className="py-2.5 px-3">規格</th>
                      <th className="py-2.5 px-3">存放倉庫</th>
                      <th className="py-2.5 px-3">批號</th>
                      <th className="py-2.5 px-3">有效期限</th>
                      <th className="py-2.5 px-3 text-right font-mono">包裝成本</th>
                      <th className="py-2.5 px-3 text-right">在庫數量 (包)</th>
                      {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                        <th className="py-2.5 px-3 text-center">操作</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {packagedStocks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-text-charcoal/45">目前所有商店與總倉都沒有包裝成品。</td>
                      </tr>
                    ) : (
                      packagedStocks.map(s => {
                        const prod = products.find(p => p.product_id === s.product_or_material_id);
                        const b = batches.find(batch => batch.batch_no === s.batch_no);
                        const wh = warehouses.find(w => w.warehouse_id === s.warehouse_id);
                        
                        // 計算天數看是否快過期
                        const daysLeft = b ? Math.ceil((new Date(b.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 999;
                        const isRed = daysLeft <= 30;
                        const isYellow = daysLeft <= 60 && daysLeft > 30;

                        return (
                          <tr key={s.stock_id} className="border-b border-brand-camel/20 hover:bg-canvas-bg/35">
                            <td className="py-2.5 px-3 font-bold">{prod?.name || s.product_or_material_id}</td>
                            <td className="py-2.5 px-3 text-[10px] text-text-charcoal/70">{prod?.sku_spec}</td>
                            <td className="py-2.5 px-3 font-medium text-brand-primary">{wh?.name || s.warehouse_id}</td>
                            <td className="py-2.5 px-3 font-mono text-text-charcoal/70">{s.batch_no}</td>
                            <td className="py-2.5 px-3 font-mono text-[10px]">
                              <span className={`inline-flex items-center gap-1 ${isRed ? 'text-warm-red font-bold' : isYellow ? 'text-warm-yellow font-bold' : ''}`}>
                                {b?.expiry_date}
                                {isRed && ' (過期特警)'}
                                {isYellow && ' (效期告急)'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {user.role === 'STAFF' ? '***' : `$${b?.unit_cost || 0}`}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold font-mono text-brand-accent">
                              {s.quantity} 包
                            </td>
                            {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                              <td className="py-2.5 px-3 text-center">
                                <div className="inline-flex gap-1.5 justify-center">
                                  <button
                                    onClick={() => startEditingStock(s, b)}
                                    className="p-0.5 hover:bg-brand-primary/10 text-brand-primary rounded transition-colors"
                                    title="編輯庫存批次"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteStock(s.stock_id)}
                                    className="p-0.5 hover:bg-warm-red/10 text-warm-red rounded transition-colors"
                                    title="刪除庫存記錄"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSubTab === 'transfer' && (
            <div className="space-y-6">
              {/* 調撥單 preview 與列印 */}
              {printInvoice && (
                <div className="bg-canvas-alt p-6 rounded-2xl border border-brand-primary shadow-sm space-y-4">
                  <div className="flex justify-between items-center border-b border-brand-camel/30 pb-3">
                    <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
                      <FileText className="w-5 h-5 text-brand-primary" />
                      送貨簽收單 A4 紙本預覽
                    </h3>
                    <button
                      onClick={triggerPrint}
                      className="flex items-center gap-1 bg-brand-primary text-canvas-bg px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      列印紙本簽收單 (A4 格式)
                    </button>
                  </div>

                  {/* HTML A4 紙本列印渲染區 */}
                  <div className="bg-white p-8 rounded-xl border border-brand-camel/30 text-text-charcoal max-w-full overflow-x-auto">
                    <div className="print-page w-[210mm] mx-auto bg-white p-6 min-h-[120mm] text-black text-xs font-sans">
                      <div className="text-center font-bold text-lg border-b-2 border-black pb-2 mb-4 tracking-wider">
                        寵物凍乾出庫調撥與送貨簽收單
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p><strong>單據編號:</strong> {printInvoice.transferId}</p>
                          <p><strong>調撥日期:</strong> {printInvoice.date}</p>
                          <p><strong>類型:</strong> {printInvoice.isLoss ? '行銷損耗 / 免費試吃包 (非賣品)' : '寄賣點庫存調撥'}</p>
                        </div>
                        <div className="text-right">
                          <p><strong>出貨單位:</strong> 總部總倉 (WH_MAIN)</p>
                          <p><strong>收貨點:</strong> {printInvoice.toName}</p>
                        </div>
                      </div>

                      <table className="w-full border-collapse border border-black text-xs mb-6">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-black p-2 text-left">調撥商品品項</th>
                            <th className="border border-black p-2 text-left">扣除批號</th>
                            <th className="border border-black p-2 text-right">數量 (包)</th>
                            <th className="border border-black p-2 text-center">簽收確認</th>
                          </tr>
                        </thead>
                        <tbody>
                          {printInvoice.batches.map((b, idx) => (
                            <tr key={idx}>
                              <td className="border border-black p-2 font-bold">{printInvoice.productName}</td>
                              <td className="border border-black p-2 font-mono">{b.batch_no}</td>
                              <td className="border border-black p-2 text-right font-mono">{b.qty}</td>
                              <td className="border border-black p-2 text-center text-gray-300">[ 留白網格 ]</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="grid grid-cols-3 gap-4 pt-12">
                        <div className="text-center border-t border-black pt-2">
                          送貨人簽名: __________________
                        </div>
                        <div className="text-center border-t border-black pt-2">
                          現場點交人: __________________
                        </div>
                        <div className="text-center border-t border-black pt-2">
                          店家主管確認: __________________
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 開通寄賣虛擬分倉 */}
              <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
                  <Plus className="w-4.5 h-4.5 text-brand-primary" />
                  新增合作商店或銷售管道
                </h3>
                
                <form onSubmit={handleAddWarehouse} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block font-semibold mb-1 text-text-charcoal/75">商店/管道名稱 (如：吉米動物醫院)</label>
                    <input
                      type="text"
                      placeholder="如：天母動物醫院"
                      value={newWh.name}
                      onChange={(e) => setNewWh({ ...newWh, name: e.target.value })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-text-charcoal/75">通路費率類型</label>
                    <select
                      value={newWh.fee_type}
                      onChange={(e) => setNewWh({ ...newWh, fee_type: e.target.value as Warehouse['fee_type'] })}
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
                      placeholder="如 FLAT 填 5, PERCENT 填 0.085"
                      value={newWh.fee_value}
                      onChange={(e) => setNewWh({ ...newWh, fee_value: Number(e.target.value) })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold mb-1 text-text-charcoal/75">商店類型</label>
                    <select
                      value={newWh.type}
                      onChange={(e) => setNewWh({ ...newWh, type: e.target.value as Warehouse['type'] })}
                      className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    >
                      <option value="CONSIGNMENT">線下據點寄賣點</option>
                      <option value="PLATFORM">平台線上電商</option>
                      <option value="INTERNAL">公司內部實體倉</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
                    >
                      確認新增商店
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}

        </div>

        {/* 右側欄：調撥指令表單 (4格寬) */}
        <div className="lg:col-span-4 space-y-6">
          
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-brand-accent animate-pulse" />
              把商品移到其他商店 (移貨)
            </h3>

            <form onSubmit={handleTransfer} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">1. 選擇要移貨的成品商品</label>
                <select
                  value={transfer.productId}
                  onChange={(e) => setTransfer({ ...transfer, productId: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                >
                  <option value="">-- 選擇成品規格 --</option>
                  {products.map(p => (
                    <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku_spec})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">從哪個倉庫/商店移出</label>
                <select
                  value={transfer.fromWhId}
                  onChange={(e) => setTransfer({ ...transfer, fromWhId: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="WH_MAIN">總部防潮主倉庫 (WH_MAIN)</option>
                  {warehouses.filter(w => w.warehouse_id !== 'WH_MAIN').map(w => (
                    <option key={w.warehouse_id} value={w.warehouse_id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">移入到哪個合作商店</label>
                <select
                  value={transfer.toWhId}
                  onChange={(e) => setTransfer({ ...transfer, toWhId: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                >
                  <option value="">-- 選擇移入商店 --</option>
                  {warehouses.map(w => (
                    <option key={w.warehouse_id} value={w.warehouse_id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">移貨數量 (包)</label>
                <input
                  type="number"
                  value={transfer.quantity}
                  onChange={(e) => setTransfer({ ...transfer, quantity: Number(e.target.value) })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div className="bg-canvas-bg border border-brand-camel/30 rounded-xl p-3 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="font-bold text-text-charcoal text-[11px] block">標記為免費試吃包 (不收錢)</span>
                  <span className="text-[9px] text-text-charcoal/50 leading-tight block">
                    這批貨是免費給店家推廣用的，不會計入結帳的應收金額。
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={transfer.isMarketingLoss}
                  onChange={(e) => setTransfer({ ...transfer, isMarketingLoss: e.target.checked })}
                  className="w-4.5 h-4.5 accent-brand-accent cursor-pointer"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-accent text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
              >
                確認執行移貨 (自動依效期出貨)
              </button>
            </form>
          </div>

          {/* 庫存預警警示燈 (輔助展示) */}
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-text-charcoal flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-brand-accent animate-pulse" />
              防潮防損效期提示
            </h4>
            <p className="text-[10px] text-text-charcoal/65 leading-relaxed">
              系統採用雙軌制，出貨前才進行鋁箔大袋分裝。所有移入各寄賣點的產品，剩餘效期低於 60 天將在系統亮黃燈，低於 30 天亮紅燈，現場調撥時請注意先進先出原則。
            </p>
          </div>

        </div>

      </div>

      {/* 編輯庫存批次 Modal */}
      {editingStock && (
        <div className="fixed inset-0 bg-text-charcoal/50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-canvas-bg max-w-md w-full rounded-2xl p-6 border border-brand-camel shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-camel/30 pb-2">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-1.5 font-sans">
                <Pencil className="w-4 h-4 text-brand-primary" />
                編輯庫存批次明細
              </h3>
              <button onClick={() => setEditingStock(null)} className="text-text-charcoal/50 hover:text-text-charcoal">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleEditStockSubmit} className="space-y-3.5 font-sans">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/70">品項名稱</label>
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
                  <label className="block font-semibold mb-1 text-text-charcoal/70">在庫數量 (KG 或 包/件)</label>
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
export default WarehouseManager;
