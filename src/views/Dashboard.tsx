// 寵物凍乾與寄賣 ERP - 營運數據儀表板 (含雙重預警、Recharts 暖色 BI 圖表與 DSI 計算)
import React, { useMemo } from 'react';
import { getDb, getCurrentUser } from '../lib/db';
import { dbService } from '../services/dbService';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { 
  TrendingUp, AlertTriangle, ShieldAlert, DollarSign, 
  Calendar, Inbox, ShoppingCart, Award, ArrowUpRight 
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const user = getCurrentUser();
  const db = getDb();

  // 1. 庫存資料 (經 RLS 過濾過)
  const stocks = dbService.getWarehouseStocks();
  const products = db.products;
  const materials = db.materials;
  const batches = db.inventory_batches;
  const warehouses = db.warehouses;
  const orders = dbService.getSalesOrders();
  const orderItems = dbService.getSalesOrderItems();

  const isStaffOrPartner = user.role === 'STAFF' || user.role === 'PARTNER';

  // --- KPI 計算邏輯 ---

  // A. 總庫存資產價值 (Sum of stock.qty * batch.unit_cost)
  const totalInventoryValue = useMemo(() => {
    if (isStaffOrPartner) return 0;
    return stocks.reduce((sum, s) => {
      const batch = batches.find(b => b.batch_no === s.batch_no);
      if (!batch) return sum;
      return sum + (s.quantity * batch.unit_cost);
    }, 0);
  }, [stocks, batches, isStaffOrPartner]);

  // B. DSI 存貨周轉天數 (公式 7.6)
  // DSI = (當前總庫存成本價值 / 過去 30 天日平均銷貨成本) * 30
  const dsiValue = useMemo(() => {
    if (isStaffOrPartner) return 'N/A';
    
    // 計算過去 30 天的總銷貨成本 (COGS)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const totalCogs30Days = orderItems.reduce((sum, item) => {
      const order = orders.find(o => o.order_id === item.order_id);
      if (!order) return sum;
      const orderDate = new Date(order.order_date);
      if (orderDate >= thirtyDaysAgo) {
        return sum + item.calculated_cost; // 批次成本已在銷售時記錄
      }
      return sum;
    }, 0);

    const dailyAvgCogs = totalCogs30Days / 30;
    if (dailyAvgCogs <= 0) return '30+ 天 (無近期銷貨)';
    
    const dsi = (totalInventoryValue / dailyAvgCogs);
    return `${Math.round(dsi)} 天`;
  }, [totalInventoryValue, orderItems, orders, isStaffOrPartner]);

  // C. 未結帳應收款項 (AR)
  const unpaidAR = useMemo(() => {
    return orders
      .filter(o => o.payment_status === 'UNPAID')
      .reduce((sum, o) => sum + o.net_receivable, 0);
  }, [orders]);

  // D. 本月熱銷商品王
  const bestSeller = useMemo(() => {
    const counts: Record<string, number> = {};
    orderItems.forEach(item => {
      counts[item.product_id] = (counts[item.product_id] || 0) + item.quantity;
    });

    let topProdId = '';
    let maxQty = 0;
    Object.entries(counts).forEach(([id, qty]) => {
      if (qty > maxQty) {
        maxQty = qty;
        topProdId = id;
      }
    });

    const prod = products.find(p => p.product_id === topProdId);
    return prod ? `${prod.name} (${maxQty} 包)` : '無銷售紀錄';
  }, [orderItems, products]);


  // --- 雙重預警系統邏輯 ---

  // 讀取設定配置以實現係數與效期預警連動
  const configs = db.system_configs || [];
  const yellowDays = parseInt(configs.find(c => c.config_key === 'ALERT_EXPIRY_YELLOW')?.config_value || '60', 10);
  const redDays = parseInt(configs.find(c => c.config_key === 'ALERT_EXPIRY_RED')?.config_value || '30', 10);
  const stockMultiplier = parseFloat(configs.find(c => c.config_key === 'STOCK_MULTIPLIER')?.config_value || '1.0');

  // 1. 數量安全水位預警 (安全量預警)
  const quantityAlerts = useMemo(() => {
    const alerts: { id: string; name: string; type: '成品' | '原料' | '耗材'; current: number; min: number; wh: string }[] = [];
    
    // 檢查成品
    products.forEach(p => {
      const totalQty = stocks
        .filter(s => s.product_or_material_id === p.product_id)
        .reduce((sum, s) => sum + s.quantity, 0);
      
      const adjustedMin = Number((p.min_stock_alert * stockMultiplier).toFixed(2));
      if (totalQty < adjustedMin) {
        alerts.push({ id: p.product_id, name: p.name, type: '成品', current: totalQty, min: adjustedMin, wh: '全倉總和' });
      }
    });

    // 檢查原料與耗材 (僅當前用戶非 PARTNER 才能看原料)
    if (user.role !== 'PARTNER') {
      materials.forEach(m => {
        const totalQty = stocks
          .filter(s => s.product_or_material_id === m.material_id)
          .reduce((sum, s) => sum + s.quantity, 0);
        
        const adjustedMin = Number((m.min_stock_alert * stockMultiplier).toFixed(2));
        if (totalQty < adjustedMin) {
          const typeLabel = m.type === 'CONSUMABLE' ? '耗材' : '原料';
          alerts.push({ id: m.material_id, name: m.name, type: typeLabel, current: totalQty, min: adjustedMin, wh: '總倉' });
        }
      });
    }

    return alerts;
  }, [products, materials, stocks, user.role, stockMultiplier]);

  // 2. 效期安全到期預警 (動態讀取系統設定參數)
  const expiryAlerts = useMemo(() => {
    const alerts: { batchNo: string; name: string; qty: number; whName: string; daysLeft: number; level: 'RED' | 'YELLOW' }[] = [];
    const now = new Date().getTime();

    stocks.forEach(s => {
      if (s.quantity <= 0) return;
      const batch = batches.find(b => b.batch_no === s.batch_no);
      if (!batch) return;

      const expiryTime = new Date(batch.expiry_date).getTime();
      const diffTime = expiryTime - now;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 動態讀取黃燈與紅燈警戒天數
      if (diffDays <= yellowDays) {
        const itemObj = batch.item_type === 'PRODUCT' 
          ? products.find(p => p.product_id === batch.item_id)
          : materials.find(m => m.material_id === batch.item_id);

        if (!itemObj) return;

        const wh = warehouses.find(w => w.warehouse_id === s.warehouse_id);

        alerts.push({
          batchNo: s.batch_no,
          name: `${itemObj.name} (${batch.item_type === 'PRODUCT' ? '成品' : '資材'})`,
          qty: s.quantity,
          whName: wh ? wh.name : s.warehouse_id,
          daysLeft: diffDays,
          level: diffDays <= redDays ? 'RED' : 'YELLOW'
        });
      }
    });

    return alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [stocks, batches, products, materials, warehouses, yellowDays, redDays]);


  // --- BI 圖表數據整理 ---

  // 1. 各管道利潤與毛利率對比 (Recharts 暖色直條圖)
  const channelData = useMemo(() => {
    const cData: Record<string, { name: string; revenue: number; cost: number; profit: number }> = {};
    
    // 初始化倉庫別名
    warehouses.forEach(w => {
      cData[w.warehouse_id] = { name: w.name, revenue: 0, cost: 0, profit: 0 };
    });

    orders.forEach(order => {
      const items = orderItems.filter(item => item.order_id === order.order_id);
      const orderCost = items.reduce((sum, item) => sum + item.calculated_cost, 0);
      
      const whId = order.warehouse_id;
      if (cData[whId]) {
        cData[whId].revenue += order.gross_revenue;
        cData[whId].cost += orderCost;
        // 實收淨額扣除成本為純利
        cData[whId].profit += (order.net_receivable - orderCost);
      }
    });

    return Object.values(cData).map(c => {
      const margin = c.revenue > 0 ? Number(((c.profit / c.revenue) * 100).toFixed(1)) : 0;
      return {
        ...c,
        revenue: Number(c.revenue.toFixed(2)),
        profit: Number(c.profit.toFixed(2)),
        margin: margin
      };
    });
  }, [orders, orderItems, warehouses]);

  // 2. 月份銷售走勢
  const trendData = useMemo(() => {
    // 聚合最近幾天的訂單
    const dates: Record<string, number> = {};
    orders.forEach(o => {
      dates[o.order_date] = (dates[o.order_date] || 0) + o.gross_revenue;
    });

    return Object.entries(dates)
      .map(([date, val]) => ({ date, amount: val }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* 頂部標題與迎賓語 */}
      <div>
        <h2 className="text-2xl font-black text-text-charcoal flex items-center gap-2">
          ✨ 凍乾營運狀況總覽
        </h2>
        <p className="text-sm text-text-charcoal/70">
          這裡可以看目前倉庫剩餘價值、是否有商品快要過期，以及各個銷售管道賣貨賺錢的比例。
        </p>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-text-charcoal/65">現有庫存價值 (進貨總成本)</span>
            <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary">
              <Inbox className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            {isStaffOrPartner ? (
              <div className="flex items-center gap-1.5 text-warm-red text-sm font-semibold mt-1">
                <ShieldAlert className="w-4 h-4" /> 權限不足已隱藏
              </div>
            ) : (
              <>
                <span className="text-2xl font-black text-text-charcoal">
                  ${totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <span className="text-[10px] text-text-charcoal/50 block mt-1">
                  倉庫裡所有生肉、乾肉和包裝成品的成本總和
                </span>
              </>
            )}
          </div>
          <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-300">
            <DollarSign className="w-24 h-24 text-text-charcoal" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-text-charcoal/65">預估多少天可以賣完現貨</span>
            <div className="w-8 h-8 rounded-lg bg-brand-camel/15 flex items-center justify-center text-brand-camel">
              <Calendar className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            {isStaffOrPartner ? (
              <div className="flex items-center gap-1.5 text-warm-red text-sm font-semibold mt-1">
                <ShieldAlert className="w-4 h-4" /> 權限不足已隱藏
              </div>
            ) : (
              <>
                <span className="text-2xl font-black text-text-charcoal">{dsiValue}</span>
                <span className="text-[10px] text-text-charcoal/50 block mt-1">
                  根據最近 30 天的平均賣貨速度計算
                </span>
              </>
            )}
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-text-charcoal/65">店家還沒給我們的錢 (應收帳款)</span>
            <div className="w-8 h-8 rounded-lg bg-brand-accent/10 flex items-center justify-center text-brand-accent">
              <ShoppingCart className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-text-charcoal">
              ${unpaidAR.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-[10px] text-text-charcoal/50 block mt-1">
              送去吉米等寄賣點但店家還沒結算給我們的錢
            </span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-text-charcoal/65">本月最熱賣商品</span>
            <div className="w-8 h-8 rounded-lg bg-warm-yellow/15 flex items-center justify-center text-warm-yellow">
              <Award className="w-4.5 h-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-base font-black text-text-charcoal leading-tight block truncate">
              {bestSeller}
            </span>
            <span className="text-[10px] text-text-charcoal/50 block mt-1">
              最近出貨和對帳數量最多的明星商品
            </span>
          </div>
        </div>
      </div>

      {/* 雙重預警系統看板 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 預警一：數量低於安全量 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm">
          <h3 className="text-base font-bold text-text-charcoal flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-brand-accent" />
            庫存不夠警示 (請記得補貨) ({quantityAlerts.length} 項)
          </h3>
          {quantityAlerts.length === 0 ? (
            <div className="bg-canvas-bg rounded-xl p-6 text-center border border-brand-camel/30 text-sm text-text-charcoal/50">
              🎉 棒極了！目前所有商品與資材水位皆在安全標準以上。
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2.5">
              {quantityAlerts.map(alert => (
                <div key={alert.id} className="bg-canvas-bg border border-brand-camel/30 rounded-xl p-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="bg-brand-accent/10 text-brand-accent border border-brand-accent/30 text-[10px] px-2 py-0.5 rounded font-bold mr-2">
                      {alert.type}
                    </span>
                    <span className="font-bold text-text-charcoal">{alert.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-warm-red font-bold font-mono">{alert.current}</span>
                    <span className="text-text-charcoal/50"> / 安全量 {alert.min} ({alert.id.startsWith('PROD') ? '包' : 'KG/個'})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 預警二：效期到期警示 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm">
          <h3 className="text-base font-bold text-text-charcoal flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-warm-red" />
            商品快過期警示 (請優先賣出) ({expiryAlerts.length} 批)
          </h3>
          {expiryAlerts.length === 0 ? (
            <div className="bg-canvas-bg rounded-xl p-6 text-center border border-brand-camel/30 text-sm text-text-charcoal/50">
              🍃 無過期風險！所有倉庫在庫成品的效期皆大於 60 天。
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2.5">
              {expiryAlerts.map(alert => {
                const isRed = alert.level === 'RED';
                return (
                  <div key={alert.batchNo} className="bg-canvas-bg border border-brand-camel/30 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${isRed ? 'bg-warm-red animate-pulse' : 'bg-warm-yellow'}`} />
                        <span className="font-bold text-text-charcoal">{alert.name}</span>
                      </div>
                      <div className="text-[10px] text-text-charcoal/50 font-mono">
                        批號: {alert.batchNo} | 庫存: {alert.qty} 包/KG | 倉儲: {alert.whName}
                      </div>
                    </div>
                    <div className={`shrink-0 text-right font-bold ${isRed ? 'text-warm-red' : 'text-warm-yellow'}`}>
                      剩餘效期: {alert.daysLeft} 天
                      {isRed ? ' (極危!!)' : ' (提醒)'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* BI 圖表區域 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左二欄：管道利潤與毛利率 PK */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm lg:col-span-2 space-y-4">
          <div>
            <h3 className="text-base font-bold text-text-charcoal flex items-center justify-between">
              📊 各通路賣貨利潤對比
              <span className="text-xs font-normal text-text-charcoal/50">各店銷售額扣除店家抽成費後的公司利潤</span>
            </h3>
          </div>
          <div className="h-68">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={channelData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
                <XAxis dataKey="name" tick={{ fill: '#2c2520', fontSize: 10 }} />
                <YAxis tick={{ fill: '#2c2520', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fdfbf7', border: '1px solid #c2a68e', borderRadius: '12px', fontSize: '12px' }}
                  labelStyle={{ fontWeight: 'bold', color: '#2c2520' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar name="賣出金額 ($)" dataKey="revenue" fill="#C2A68E" radius={[4, 4, 0, 0]} />
                <Bar name="公司淨利 ($)" dataKey="profit" fill="#7A8B7B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 右一欄：近十次銷售營收走勢 */}
        <div className="bg-canvas-alt p-5 rounded-2xl border border-brand-camel/40 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-text-charcoal flex items-center justify-between">
              📈 營業額走勢圖
            </h3>
          </div>
          <div className="h-68">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-text-charcoal/50">
                暫無銷售數據繪製趨勢圖
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
                  <XAxis dataKey="date" tick={{ fill: '#2c2520', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#2c2520', fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fdfbf7', border: '1px solid #c2a68e', borderRadius: '12px', fontSize: '12px' }}
                  />
                  <Area name="營收" type="monotone" dataKey="amount" stroke="#E89A7B" fill="rgba(232, 154, 123, 0.15)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
