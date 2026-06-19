// 寵物凍乾與寄賣 ERP - 雙軌銷售紀錄與半月對帳網格頁面 (含 AI 文字拆解、A4 紙本銷售 PDF 導出、財務解鎖稽核)
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { getDb, getCurrentUser } from '../lib/db';
import { Warehouse, Product, SalesOrder, SalesOrderItem } from '../types/erp';
import { 
  ShoppingCart, FileText, ClipboardCheck, Sparkles, 
  Lock, Unlock, RefreshCw, Printer, CheckCircle, AlertCircle, 
  HelpCircle, CheckSquare, Square
} from 'lucide-react';

export const ConsignmentReconciliation: React.FC = () => {
  const user = getCurrentUser();
  const db = getDb();
  
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [orderItems, setOrderItems] = useState<SalesOrderItem[]>([]);

  // 零售快登狀態
  const [retail, setRetail] = useState({
    productId: '',
    quantity: 1,
    unitPrice: 150,
    orderDate: new Date().toISOString().split('T')[0]
  });

  // 寄賣點品項開關狀態 (倉庫ID -> 商品ID陣列)
  const [activeCatalog, setActiveCatalog] = useState<Record<string, string[]>>({});
  const [selectedWhId, setSelectedWhId] = useState('');

  // 15天網格對帳快登狀態
  const [reconcileGrid, setReconcileGrid] = useState<Record<string, number[]>>({}); // 商品ID -> 15天銷量的陣列
  const [reconcileDate, setReconcileDate] = useState(new Date().toISOString().split('T')[0]);

  // Line 對話複製貼上文字框
  const [lineText, setLineText] = useState('');

  // 財務解鎖與修改狀態 (Super Admin 稽核用)
  const [unlockingOrderId, setUnlockingOrderId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [modifiedItems, setModifiedItems] = useState<{ productId: string; quantity: number; unitPrice: number }[]>([]);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // A4 紙本每日銷售表 PDF 預覽資料
  const [paperPrintData, setPaperPrintData] = useState<{
    whName: string;
    items: { name: string; sku: string; price: number }[];
    date: string;
  } | null>(null);

  const loadData = () => {
    setWarehouses(dbService.getWarehouses());
    setProducts(dbService.getProducts());
    setOrders(dbService.getSalesOrders());
    setOrderItems(dbService.getSalesOrderItems());
  };

  useEffect(() => {
    loadData();
    
    // 初始化寄賣點品項上架開關 (Mock 資料預設為全部上架)
    const initialCatalog: Record<string, string[]> = {};
    const whs = dbService.getWarehouses();
    const prods = dbService.getProducts();
    whs.forEach(w => {
      initialCatalog[w.warehouse_id] = prods.map(p => p.product_id);
    });
    setActiveCatalog(initialCatalog);
  }, []);

  // 當選擇的寄賣點改變，初始化對帳網格
  useEffect(() => {
    if (!selectedWhId) return;
    const initialGrid: Record<string, number[]> = {};
    const activeProds = activeCatalog[selectedWhId] || [];
    
    activeProds.forEach(pId => {
      initialGrid[pId] = Array(15).fill(0); // 15 天皆預設為 0 包
    });
    setReconcileGrid(initialGrid);
  }, [selectedWhId, activeCatalog]);

  // 自有零售快登
  const handleRetailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!retail.productId) throw new Error('請選擇商品品項');
      
      const whId = 'WH_MAIN'; // 零售預設使用總倉庫存出貨
      dbService.createSalesOrder(
        whId,
        retail.orderDate,
        [{ productId: retail.productId, quantity: retail.quantity, unitPrice: retail.unitPrice, specificDate: retail.orderDate }]
      );

      setNotification({ type: 'success', message: '自有通路零售登記成功！已執行 FIFO 總倉庫存扣減。' });
      setRetail({ ...retail, productId: '', quantity: 1 });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 寄賣點品項上架開關切換
  const toggleCatalogItem = (whId: string, prodId: string) => {
    const list = activeCatalog[whId] || [];
    const newList = list.includes(prodId) 
      ? list.filter(id => id !== prodId) 
      : [...list, prodId];
    
    setActiveCatalog({
      ...activeCatalog,
      [whId]: newList
    });
  };

  // 導出紙本對帳單 A4 預覽
  const handleGeneratePaperSheet = () => {
    if (!selectedWhId) {
      setNotification({ type: 'error', message: '請先選擇寄賣點！' });
      return;
    }
    const wh = warehouses.find(w => w.warehouse_id === selectedWhId);
    const activeProds = activeCatalog[selectedWhId] || [];
    const items = products
      .filter(p => activeProds.includes(p.product_id))
      .map(p => ({
        name: p.name,
        sku: p.sku_spec,
        price: p.default_price
      }));

    setPaperPrintData({
      whName: wh ? wh.name : selectedWhId,
      items,
      date: new Date().toLocaleDateString('zh-TW')
    });
  };

  // 15天對帳網格單項儲存格變動
  const handleGridChange = (prodId: string, dayIndex: number, val: number) => {
    const grid = { ...reconcileGrid };
    if (!grid[prodId]) {
      grid[prodId] = Array(15).fill(0);
    }
    grid[prodId][dayIndex] = Math.max(0, val);
    setReconcileGrid(grid);
  };

  // --- 應收現鈔防呆公式計算 7.7 ---
  // 應收現鈔 = ∑(單項商品實售數量 * 單項商品售價) - (總銷售商品數量 * 該店固定單件費用)
  const calcReconciliationAR = () => {
    if (!selectedWhId) return { totalQty: 0, gross: 0, fee: 0, ar: 0 };
    const wh = warehouses.find(w => w.warehouse_id === selectedWhId);
    if (!wh) return { totalQty: 0, gross: 0, fee: 0, ar: 0 };

    let totalQty = 0;
    let gross = 0;

    Object.entries(reconcileGrid).forEach(([prodId, days]) => {
      const prod = products.find(p => p.product_id === prodId);
      const price = prod ? prod.default_price : 0;
      const sumQty = days.reduce((sum, q) => sum + q, 0);

      totalQty += sumQty;
      gross += sumQty * price;
    });

    let fee = 0;
    if (wh.fee_type === 'FLAT') {
      fee = totalQty * wh.fee_value;
    } else if (wh.fee_type === 'PERCENT') {
      fee = Number((gross * wh.fee_value).toFixed(2));
    }

    const ar = Number((gross - fee).toFixed(2));
    return { totalQty, gross, fee, ar };
  };

  const arCalc = calcReconciliationAR();

  // Line 通訊對話正則解析拆解 (LLM 模擬)
  const parseLineText = () => {
    if (!lineText) {
      alert('請先貼入 Line 對話文本！');
      return;
    }
    
    // 正則比對：[商品關鍵字] 賣/售/出 [數量] 包/個/件
    // 如：雞肉小包賣 3 包、牛肉小包賣 5 包
    // 或者 P001-3, P002-5, 雞肉小-3
    const parsedData: Record<string, number> = {};

    // 建立比對辭典
    const matchRules = [
      { id: 'PROD_CHICKEN_S', keywords: ['雞肉小', '雞肉小包', '雞胸肉小'] },
      { id: 'PROD_CHICKEN_L', keywords: ['雞肉大', '雞肉大包', '雞胸肉大'] },
      { id: 'PROD_BEEF_S', keywords: ['牛肉小', '牛肉小包', '牛肉小'] }
    ];

    // 分割對話行
    const lines = lineText.split(/[\n,，、]/);
    lines.forEach(line => {
      matchRules.forEach(rule => {
        rule.keywords.forEach(kw => {
          if (line.includes(kw)) {
            // 尋找此關鍵字後面的數字
            const match = line.match(/\d+/);
            if (match) {
              const qty = parseInt(match[0], 10);
              parsedData[rule.id] = (parsedData[rule.id] || 0) + qty;
            }
          }
        });
      });
    });

    if (Object.keys(parsedData).length === 0) {
      alert('AI 拆解失敗：無法識別關鍵字或數量，請確保格式如「雞肉小包賣 5 包、牛肉小包售 3 件」。');
      return;
    }

    // 帶入網格的第一天 (Day 1)
    const newGrid = { ...reconcileGrid };
    Object.entries(parsedData).forEach(([prodId, qty]) => {
      if (newGrid[prodId]) {
        newGrid[prodId][0] = qty; // 預設塞入第 1 天
      }
    });

    setReconcileGrid(newGrid);
    setLineText('');
    setNotification({ 
      type: 'success', 
      message: `AI 成功解構對帳文本！已將 ${Object.entries(parsedData).map(([id, q]) => `${products.find(p=>p.product_id===id)?.name}: ${q}包`).join(', ')} 自動寫入對帳矩陣 Day 1 儲存格。` 
    });
  };

  // 提交半月對帳並扣減庫存 (一鍵結帳)
  const handleReconcileSubmit = () => {
    try {
      if (!selectedWhId) throw new Error('請選擇寄賣據點！');
      
      const salesItems: { productId: string; quantity: number; unitPrice: number; specificDate: string }[] = [];
      const wh = warehouses.find(w => w.warehouse_id === selectedWhId);
      
      // 依據 Reconcile Grid 組合每日訂單項目
      Object.entries(reconcileGrid).forEach(([prodId, days]) => {
        const prod = products.find(p => p.product_id === prodId);
        const price = prod ? prod.default_price : 0;
        
        days.forEach((qty, idx) => {
          if (qty <= 0) return;
          // 計算對應銷售日期
          const dateObj = new Date(reconcileDate);
          dateObj.setDate(dateObj.getDate() - (14 - idx)); // 往前推 15 天
          const dateStr = dateObj.toISOString().split('T')[0];

          salesItems.push({
            productId: prodId,
            quantity: qty,
            unitPrice: price,
            specificDate: dateStr
          });
        });
      });

      if (salesItems.length === 0) {
        throw new Error('對帳網格中無任何銷量資料，無法結帳扣庫！');
      }

      // 執行銷售結帳 (這會自動扣庫存)
      dbService.createSalesOrder(
        selectedWhId,
        reconcileDate,
        salesItems
      );

      setNotification({ type: 'success', message: `對帳成功！已建立對帳單並完成現場 FIFO 扣庫，共收款 $${arCalc.ar} 元。` });
      
      // 清空 Grid
      const cleanedGrid = { ...reconcileGrid };
      Object.keys(cleanedGrid).forEach(k => {
        cleanedGrid[k] = Array(15).fill(0);
      });
      setReconcileGrid(cleanedGrid);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 申請已結帳單解鎖編輯 (Super Admin)
  const handleUnlockAndModify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockingOrderId) return;
    try {
      const originalOrder = orders.find(o => o.order_id === unlockingOrderId);
      const orderDate = originalOrder ? originalOrder.order_date : reconcileDate;
      
      dbService.unlockAndModifyOrder(
        unlockingOrderId, 
        modifiedItems.map(item => ({ ...item, specificDate: orderDate })), 
        unlockReason
      );
      setNotification({ type: 'success', message: `帳單 [${unlockingOrderId}] 已解鎖並修改完成！庫存與稽核已重新整理。` });
      setUnlockingOrderId(null);
      setUnlockReason('');
      setModifiedItems([]);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 作廢銷貨單
  const handleVoidOrder = (orderId: string) => {
    const reason = window.prompt('確定要作廢此銷貨單嗎？此操作將會還原扣減的庫存。\n請輸入作廢原因：');
    if (reason === null) return; // 使用者取消
    if (!reason.trim()) {
      setNotification({ type: 'error', message: '必須輸入作廢原因才能進行作廢操作。' });
      return;
    }
    try {
      dbService.voidSalesOrder(orderId, reason.trim());
      setNotification({ type: 'success', message: `銷貨單 [${orderId}] 已作廢，庫存已成功還原！` });
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  // 開啟解鎖編輯對話框
  const openUnlockModal = (order: SalesOrder) => {
    const items = orderItems
      .filter(i => i.order_id === order.order_id)
      // 將同商品的批次合併顯示以便編輯
      .reduce((acc, curr) => {
        const exist = acc.find(a => a.productId === curr.product_id);
        if (exist) {
          exist.quantity += curr.quantity;
        } else {
          acc.push({
            productId: curr.product_id,
            quantity: curr.quantity,
            unitPrice: curr.unit_price
          });
        }
        return acc;
      }, [] as { productId: string; quantity: number; unitPrice: number }[]);

    setModifiedItems(items);
    setUnlockingOrderId(order.order_id);
  };

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h2 className="text-2xl font-black text-text-charcoal flex items-center gap-2">
          📝 賣貨登記與算帳格子
        </h2>
        <p className="text-sm text-text-charcoal/70">
          在這裡可以登記直接賣給散客的零售紀錄，或是選擇合作商店並列印「手寫每日銷量表」給店家。當回收手寫表後，可以使用下方的「15天盤點算帳表」或「LINE對話貼上」來快速算帳並結算庫存。
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

      {/* 介面配置為左右兩大區 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 左側：對帳網格快登 (8格寬) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* 紙本每日銷售表 A4 預覽 */}
          {paperPrintData && (
            <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-primary shadow-sm space-y-3">
              <div className="flex justify-between items-center border-b border-brand-camel/30 pb-2">
                <h4 className="text-xs font-bold text-text-charcoal flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-brand-primary" />
                  紙本每日銷量表 (A4 送店備查單)
                </h4>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 bg-brand-primary text-canvas-bg px-2.5 py-1.2 rounded-lg text-[10px] font-bold hover:opacity-90 transition-opacity"
                >
                  <Printer className="w-3.5 h-3.5" />
                  列印紙本
                </button>
              </div>

              <div className="bg-white p-6 rounded-xl border border-brand-camel/20 overflow-x-auto">
                <div className="print-page w-[210mm] mx-auto bg-white p-6 text-black text-xs font-sans">
                  <div className="text-center font-bold text-base border-b border-black pb-2 mb-3">
                    【{paperPrintData.whName}】每日凍乾銷售手寫紀錄表
                  </div>
                  <div className="text-[10px] text-right text-gray-500 mb-2">
                    列印日期: {paperPrintData.date} | 請店家每日打勾或填寫銷量數字
                  </div>

                  <table className="w-full border-collapse border border-black text-[10px] mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-black p-1.5 text-left w-36">商品品項</th>
                        <th className="border border-black p-1.5 text-center">規格</th>
                        <th className="border border-black p-1.5 text-right">單價</th>
                        {Array(15).fill(0).map((_, i) => (
                          <th key={i} className="border border-black p-1 text-center w-7 font-mono">{i + 1}日</th>
                        ))}
                        <th className="border border-black p-1.5 text-right w-12">小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paperPrintData.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="border border-black p-1.5 font-bold">{it.name}</td>
                          <td className="border border-black p-1.5 text-center">{it.sku}</td>
                          <td className="border border-black p-1.5 text-right font-mono">${it.price}</td>
                          {Array(15).fill(0).map((_, i) => (
                            <td key={i} className="border border-black p-1 text-center text-gray-200 font-mono"></td>
                          ))}
                          <td className="border border-black p-1.5 text-right text-gray-300">______</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="text-[9px] text-gray-500 italic mt-8">
                    ※ 本表供店家主管及現場人員半月盤點時覆核簽字，回收本表後請登錄 ERP 系統完成銷售沖銷。
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 15天網格快登引擎 */}
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-brand-camel/20 pb-3">
              <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-brand-primary" />
                15天盤點算帳表 (Excel式網格)
              </h3>
              
              <div className="flex gap-2">
                <select
                  value={selectedWhId}
                  onChange={(e) => setSelectedWhId(e.target.value)}
                  className="text-xs bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-1.5 text-text-charcoal"
                >
                  <option value="">-- 選擇合作商店 --</option>
                  {warehouses.filter(w => w.type === 'CONSIGNMENT').map(w => (
                    <option key={w.warehouse_id} value={w.warehouse_id}>{w.name}</option>
                  ))}
                </select>
                
                <input
                  type="date"
                  value={reconcileDate}
                  onChange={(e) => setReconcileDate(e.target.value)}
                  className="text-xs bg-canvas-bg border border-brand-camel rounded-lg px-2 py-1.5 text-text-charcoal"
                />
              </div>
            </div>

            {/* 網格核心渲染 */}
            {!selectedWhId ? (
              <div className="py-16 text-center text-xs text-text-charcoal/50 bg-canvas-bg rounded-xl border border-brand-camel/20">
                請先從上方下拉選單選擇你要算帳的「合作商店」以載入算帳格子。
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-text-charcoal text-[11px]">
                    <thead>
                      <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50">
                        <th className="py-2 px-1 w-24">商品名稱</th>
                        <th className="py-2 px-1 text-right w-12">單價</th>
                        {Array(15).fill(0).map((_, i) => (
                          <th key={i} className="py-2 px-1 text-center w-7 font-mono">D{i+1}</th>
                        ))}
                        <th className="py-2 px-1 text-right w-10">合計包數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(reconcileGrid).map(prodId => {
                        const prod = products.find(p => p.product_id === prodId);
                        const days = reconcileGrid[prodId] || Array(15).fill(0);
                        const sumQty = days.reduce((sum, q) => sum + q, 0);

                        return (
                          <tr key={prodId} className="border-b border-brand-camel/15 hover:bg-canvas-bg/30">
                            <td className="py-2 px-1 font-bold truncate max-w-28" title={prod?.name}>
                              {prod?.name || prodId}
                            </td>
                            <td className="py-2 px-1 text-right font-mono text-text-charcoal/65">
                              ${prod?.default_price}
                            </td>
                            {days.map((qty, idx) => (
                              <td key={idx} className="py-1 px-0.5 text-center">
                                <input
                                  type="number"
                                  value={qty || ''}
                                  onChange={(e) => handleGridChange(prodId, idx, Number(e.target.value))}
                                  placeholder="0"
                                  className="w-7 text-center bg-canvas-bg border border-brand-camel/50 rounded py-0.5 font-mono text-[10px] focus:border-brand-primary"
                                />
                              </td>
                            ))}
                            <td className="py-2 px-1 text-right font-bold font-mono text-brand-primary">
                              {sumQty}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 對帳計算回饋 */}
                <div className="bg-canvas-bg p-4 rounded-xl border border-brand-camel/40 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-text-charcoal/50 text-[10px] block">本次賣出總包數</span>
                    <span className="text-sm font-black font-mono">{arCalc.totalQty} 包</span>
                  </div>
                  <div>
                    <span className="text-text-charcoal/50 text-[10px] block">銷售總金額 (定價總計)</span>
                    <span className="text-sm font-black font-mono">${arCalc.gross}</span>
                  </div>
                  <div>
                    <span className="text-text-charcoal/50 text-[10px] block">扣除商店通路費</span>
                    <span className="text-sm font-black font-mono">${arCalc.fee}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-accent block">本次實收現鈔 (扣費後金額)</span>
                    <span className="text-base font-black text-brand-accent font-mono">${arCalc.ar}</span>
                  </div>
                </div>

                {/* 提交按鈕 */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={handleGeneratePaperSheet}
                    className="flex items-center gap-1.5 border border-brand-primary text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    預覽並列印手寫每日銷售表
                  </button>
                  <button
                    onClick={handleReconcileSubmit}
                    className="bg-brand-primary text-canvas-bg font-bold py-2 px-6 rounded-xl text-xs shadow-sm hover:opacity-90 transition-opacity"
                  >
                    確認算帳無誤，進行結帳扣庫存
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 歷史訂單鎖定與 Super Admin 解鎖稽核 */}
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
              <Lock className="w-5 h-5 text-brand-camel" />
              歷史結帳單與帳目鎖定狀態
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-text-charcoal">
                <thead>
                  <tr className="border-b border-brand-camel/30 text-[10px] text-text-charcoal/50">
                    <th className="py-2.5 px-3">單號</th>
                    <th className="py-2.5 px-3">銷售商店/管道</th>
                    <th className="py-2.5 px-3">結帳日期</th>
                    <th className="py-2.5 px-3 text-right">銷售總價</th>
                    <th className="py-2.5 px-3 text-right">實收現鈔</th>
                    <th className="py-2.5 px-3 text-center">付款狀態</th>
                    <th className="py-2.5 px-3 text-center">帳單操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-text-charcoal/45">尚無任何銷售或對帳紀錄</td>
                    </tr>
                  ) : (
                    orders.map(o => {
                      const wh = warehouses.find(w => w.warehouse_id === o.warehouse_id);
                      const isPaid = o.payment_status === 'PAID';
                      return (
                        <tr key={o.order_id} className="border-b border-brand-camel/15 hover:bg-canvas-bg/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-text-charcoal/85">{o.order_id}</td>
                          <td className="py-2.5 px-3 font-medium text-brand-primary">{wh?.name || o.warehouse_id}</td>
                          <td className="py-2.5 px-3 font-mono text-[10px]">{o.order_date}</td>
                          <td className="py-2.5 px-3 text-right font-mono">${o.gross_revenue}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">${o.net_receivable}</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              isPaid ? 'bg-warm-green/20 text-warm-green' : 'bg-warm-yellow/20 text-warm-yellow'
                            }`}>
                              {isPaid ? '已結款' : '對帳中'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isPaid ? (
                                <button
                                  onClick={() => openUnlockModal(o)}
                                  className="inline-flex items-center gap-1 border border-brand-accent text-brand-accent bg-brand-accent/5 hover:bg-brand-accent/10 text-[10px] px-2 py-0.8 rounded-lg font-bold transition-colors"
                                >
                                  <Unlock className="w-3 h-3" /> 解鎖修改
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    try {
                                      dbService.updateOrderStatus(o.order_id, 'PAID');
                                      setNotification({ type: 'success', message: `帳單 [${o.order_id}] 已成功結帳！` });
                                      loadData();
                                    } catch (err: any) {
                                      setNotification({ type: 'error', message: err.message });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 bg-warm-green text-canvas-bg text-[10px] px-2.5 py-1 rounded-lg font-bold hover:opacity-90 transition-opacity"
                                >
                                  <CheckSquare className="w-3 h-3" /> 結款
                                </button>
                              )}
                              {(user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') && (
                                <button
                                  onClick={() => handleVoidOrder(o.order_id)}
                                  className="inline-flex items-center gap-1 border border-warm-red text-warm-red bg-warm-red/5 hover:bg-warm-red/10 text-[10px] px-2 py-0.8 rounded-lg font-bold transition-colors"
                                >
                                  ❌ 作廢
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* 右側：零售登記與 Line 文字對話拆解 (4格寬) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 自有零售快登 */}
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-brand-primary animate-pulse" />
              散客零售快速登記 (直營)
            </h3>

            <form onSubmit={handleRetailSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">選擇賣出的商品規格</label>
                <select
                  value={retail.productId}
                  onChange={(e) => {
                    const prodId = e.target.value;
                    const prod = products.find(p => p.product_id === prodId);
                    setRetail({
                      ...retail,
                      productId: prodId,
                      unitPrice: prod ? prod.default_price : 150
                    });
                  }}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                >
                  <option value="">-- 選擇成品規格 --</option>
                  {products.map(p => (
                    <option key={p.product_id} value={p.product_id}>{p.name} ({p.sku_spec})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">賣出數量 (包)</label>
                  <input
                    type="number"
                    value={retail.quantity}
                    onChange={(e) => setRetail({ ...retail, quantity: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-text-charcoal/75">實際賣出的單價 ($)</label>
                  <input
                    type="number"
                    value={retail.unitPrice}
                    onChange={(e) => setRetail({ ...retail, unitPrice: Number(e.target.value) })}
                    className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">賣出日期</label>
                <input
                  type="date"
                  value={retail.orderDate}
                  onChange={(e) => setRetail({ ...retail, orderDate: e.target.value })}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-primary text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity"
              >
                確認登錄並扣除庫存
              </button>
            </form>
          </div>

          {/* Line 通訊對話自動拆解區 */}
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-accent" />
              直接複製貼上 LINE 訊息算帳 (自動解析)
            </h3>
            
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">在此處貼上 LINE 店家回報文字</label>
                <textarea
                  placeholder="請在此貼上店家傳來的訊息。例如：吉米醫院：今日雞肉大包賣 3 包，雞肉小包賣 5 包喔"
                  value={lineText}
                  onChange={(e) => setLineText(e.target.value)}
                  rows={4}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-xl px-2.5 py-2 text-text-charcoal"
                />
              </div>

              <button
                type="button"
                onClick={parseLineText}
                className="w-full bg-brand-accent text-canvas-bg font-bold py-2.5 px-4 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                自動辨識並填入算帳格子
              </button>
            </div>
          </div>

          {/* 寄賣點通路商品開關設定 */}
          <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-text-charcoal flex items-center gap-2">
              <CheckSquare className="w-4.5 h-4.5 text-brand-primary" />
              設定各商店只賣哪些商品
            </h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-text-charcoal/75">選擇商店</label>
                <select
                  value={selectedWhId}
                  onChange={(e) => setSelectedWhId(e.target.value)}
                  className="w-full bg-canvas-bg border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                >
                  <option value="">-- 選擇商店 --</option>
                  {warehouses.filter(w => w.type === 'CONSIGNMENT').map(w => (
                    <option key={w.warehouse_id} value={w.warehouse_id}>{w.name}</option>
                  ))}
                </select>
              </div>

              {selectedWhId && (
                <div className="space-y-2.5 bg-canvas-bg p-3.5 rounded-xl border border-brand-camel/30">
                  <span className="font-bold text-text-charcoal/70 text-[10px] block mb-1">勾選該商店有上架的商品 (沒勾的商品將不顯示在手寫表與算帳網格中)</span>
                  {products.map(p => {
                    const isChecked = (activeCatalog[selectedWhId] || []).includes(p.product_id);
                    return (
                      <button
                        key={p.product_id}
                        type="button"
                        onClick={() => toggleCatalogItem(selectedWhId, p.product_id)}
                        className="w-full flex items-center gap-2 text-[10px] text-text-charcoal hover:opacity-90 py-1 transition-opacity text-left"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4.5 h-4.5 text-brand-primary" />
                        ) : (
                          <Square className="w-4.5 h-4.5 text-brand-camel" />
                        )}
                        <span>{p.name} (${p.default_price}/包)</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Super Admin 解鎖對帳單 Modal/區塊 (當 unlockingOrderId 有值時顯示) */}
      {unlockingOrderId && (
        <div className="fixed inset-0 bg-text-charcoal/50 flex items-center justify-center p-4 z-50 backdrop-blur-xs">
          <div className="bg-canvas-bg max-w-md w-full rounded-2xl p-6 border border-brand-camel shadow-lg space-y-4 text-xs">
            <h3 className="text-base font-bold text-text-charcoal flex items-center gap-2 border-b border-brand-camel/30 pb-2">
              <Unlock className="w-5 h-5 text-brand-accent animate-pulse" />
              解鎖已結帳單並修正帳目 (最高管理者專用)
            </h3>
            
            <form onSubmit={handleUnlockAndModify} className="space-y-4">
              <div className="space-y-2">
                <span className="font-bold text-text-charcoal/70">要修正的帳單單號: {unlockingOrderId}</span>
                <textarea
                  placeholder="請輸入修改帳目的具體原因 (修改原因會記錄在日誌中防竄改)..."
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  rows={2}
                  className="w-full bg-canvas-alt border border-brand-camel rounded-lg px-2.5 py-2 text-text-charcoal"
                  required
                />
              </div>

              <div className="space-y-2">
                <span className="font-bold text-text-charcoal/70 block">修正商品銷售數量 (輸入 0 代表不賣此商品)</span>
                <div className="space-y-2.5 max-h-36 overflow-y-auto bg-canvas-alt p-3 rounded-lg border border-brand-camel/35">
                  {modifiedItems.map((item, idx) => {
                    const pObj = products.find(p => p.product_id === item.productId);
                    return (
                      <div key={item.productId} className="flex justify-between items-center gap-2">
                        <span className="font-medium text-[10px] truncate max-w-28">{pObj?.name || item.productId}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const newMods = [...modifiedItems];
                              newMods[idx].quantity = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setModifiedItems(newMods);
                            }}
                            className="w-10 text-center bg-canvas-bg border border-brand-camel rounded py-0.5 font-mono"
                          />
                          <span className="text-[10px] text-text-charcoal/50">包</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setUnlockingOrderId(null)}
                  className="w-1/2 border border-brand-camel text-text-charcoal py-2 px-4 rounded-xl hover:bg-canvas-alt"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-brand-accent text-canvas-bg py-2 px-4 rounded-xl hover:opacity-90"
                >
                  確認修正並記錄修改日誌
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default ConsignmentReconciliation;
