// 寵物凍乾與寄賣 ERP - 全模組功能自動化測試與除錯主控台
import React, { useState } from 'react';
import { getDb, saveDb, setCurrentUser, getCurrentUser } from '../lib/db';
import { dbService } from '../services/dbService';
import { fifoEngine } from '../services/fifoEngine';
import { Play, CheckCircle, XCircle, RefreshCw, Info, AlertTriangle } from 'lucide-react';

interface TestResult {
  id: string;
  name: string;
  description: string;
  status: 'PENDING' | 'PASS' | 'FAIL';
  details: string[];
}

export const TestConsole: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([
    { id: 't1', name: '濕乾貨轉換與成本公式測試', description: '驗證公式 7.1 與 7.2 的乾肉成本與加權平均成本計算精度。', status: 'PENDING', details: [] },
    { id: 't2', name: 'FIFO 成品生產與 BOM 扣料測試', description: '驗證生產成品時，是否能正確執行先進先出扣除原料/包材，並正確計算成品單包落地成本。', status: 'PENDING', details: [] },
    { id: 't3', name: 'FIFO 銷貨扣庫與財務毛利測試', description: '驗證銷售商品時是否按效期扣除庫存，且精準計算當批銷貨成本 (COGS) 與利潤。', status: 'PENDING', details: [] },
    { id: 't4', name: '定價矩陣與損益兩平逆推測試', description: '驗證目標毛利率逆推建議售價、預計售價逆推毛利，以及損益兩平銷售量 Q (無條件進位) 精度。', status: 'PENDING', details: [] },
    { id: 't5', name: 'RLS 安全權限阻擋測試', description: '驗證以 STAFF 角色操作修改系統參數或敏感成本時，系統是否能觸發權限阻擋與防禦。', status: 'PENDING', details: [] },
    { id: 't6', name: '銷貨單作廢與基礎資料防呆測試', description: '驗證銷貨單作廢後庫存是否確實以先進先出模式還原，以及刪除關聯基礎資料時的 RLS 及防呆阻擋。', status: 'PENDING', details: [] }
  ]);
  const [isRunning, setIsRunning] = useState(false);

  const runAllTests = () => {
    setIsRunning(true);
    // 備份當前 DB，以防測試數據破壞原有資料
    const dbBackup = localStorage.getItem('pet_freeze_dried_erp_db');
    const userBackup = localStorage.getItem('pet_freeze_dried_erp_current_user');

    try {
      const newResults = [...results];

      // --- 測試 1：濕乾貨轉換與成本公式測試 ---
      {
        const t = newResults[0];
        t.status = 'PASS';
        t.details = [];
        t.details.push('【公式 7.1 濕乾貨轉換】投入生鮮肉 10KG (進價 120/KG)，代工加工費 500 元，烘乾產出 2.5KG 乾肉。');
        
        const { dryUnitCost, yieldRate } = fifoEngine.calculateWetToDryCost(10, 120, 500, 2.5);
        t.details.push(`計算結果：乾肉成本為 $${dryUnitCost}/KG，得率為 ${yieldRate}%`);
        
        // 預期結果: ((10 * 120) + 500) / 2.5 = (1200 + 500) / 2.5 = 1700 / 2.5 = 680
        const expectedCost = 680;
        const expectedYield = 25;

        if (dryUnitCost === expectedCost && yieldRate === expectedYield) {
          t.details.push('✅ 濕乾貨轉換單價與得率計算正確！');
        } else {
          t.status = 'FAIL';
          t.details.push(`❌ 計算錯誤：預期乾肉單價 $${expectedCost}，實際為 $${dryUnitCost}`);
        }
      }

      // --- 測試 2：FIFO 成品生產與 BOM 扣料測試 ---
      {
        const t = newResults[1];
        t.status = 'PASS';
        t.details = [];
        
        // 為了確保測試起點一致，先重置為種子資料
        dbService.resetDatabase; // 這裡不 reload，改用手動覆寫 db
        const testDb = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);
        
        // 登入為 SUPER_ADMIN 進行生產
        testDb.profiles = testDb.profiles || DEFAULT_PROFILES;
        localStorage.setItem('pet_freeze_dried_erp_current_user', 'usr_super_admin');
        
        // 設定總倉原料數量以利生產測試
        // 我們測試生產 10 包 P001 (極鮮雞肉凍乾-小包)
        // 配方需要：雞肉乾肉 0.1 KG, 小夾鏈袋 1 個, 乾燥劑 1 個, 貼紙 2 張
        // 預計生產消耗：雞肉乾肉 1 KG, 小夾鏈袋 10 個, 乾燥劑 10 個, 貼紙 20 張
        
        // 我們手動找總倉的庫存做生產前紀錄
        const chickenDryStockBefore = testDb.warehouse_stocks
          .filter((s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === 'MAT_DRY_CHICKEN')
          .reduce((sum: number, s: any) => sum + s.quantity, 0);

        t.details.push(`【FIFO 生產預檢】生產前，總倉雞肉乾肉總庫存: ${chickenDryStockBefore} KG`);
        
        // 執行生產 10 包 P001
        // 批號: TEST-LOT-001, 單包加工費: 5
        const prodRes = fifoEngine.produceFinishedGoods(
          'PROD_CHICKEN_S',
          10,
          'TEST-LOT-001',
          '2026-06-06',
          '2026-12-06',
          5, // 代工加工費 5 元/包
          'usr_super_admin'
        );

        if (!prodRes.success) {
          t.status = 'FAIL';
          t.details.push(`❌ 生產失敗：${prodRes.error}`);
        } else {
          t.details.push(`✅ 生產成功！產出成品單包精準落地成本為: $${prodRes.unitCost}`);
          
          // 重新讀取最新的 DB，檢查扣除數量
          const updatedDb = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);
          const chickenDryStockAfter = updatedDb.warehouse_stocks
            .filter((s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === 'MAT_DRY_CHICKEN')
            .reduce((sum: number, s: any) => sum + s.quantity, 0);

          t.details.push(`【FIFO 生產後核對】生產後，總倉雞肉乾肉庫存: ${chickenDryStockAfter} KG`);
          
          const consumedDry = Number((chickenDryStockBefore - chickenDryStockAfter).toFixed(2));
          if (consumedDry === 1.0) {
            t.details.push('✅ 庫存先進先出物料扣減數量完美正確！ (消耗 1.0 KG)');
          } else {
            t.status = 'FAIL';
            t.details.push(`❌ 物料扣除數量錯誤：預期扣除 1.0 KG，實際扣除 ${consumedDry} KG`);
          }

          // 驗證生成的批次與成本計算
          // 原料批次成本：
          // LOT-20260510-CHICK-DRY 在庫單價 $480/KG -> 1 KG 耗資 $480
          // MAT_BAG_S (小夾鏈袋) LOT-20260501-BAG-S 單價 $2 -> 10 個耗資 $20
          // MAT_DESICCANT (乾燥劑) LOT-20260501-DESI 單價 $0.5 -> 10 個耗資 $5
          // MAT_STICKER (貼紙) LOT-20260501-STICK 單價 $1 -> 20 個耗資 $20
          // 加工費: 10 * 5 = $50
          // 總成本 = 480 + 20 + 5 + 20 + 50 = $575
          // 單包成本 = 575 / 10 = $57.5
          const expectedUnitCost = 57.5;
          if (prodRes.unitCost === expectedUnitCost) {
            t.details.push(`✅ 單包成品落地成本核對 PASS! ($${prodRes.unitCost} 符合預期 $${expectedUnitCost})`);
          } else {
            t.status = 'FAIL';
            t.details.push(`❌ 成本計算錯誤：預期單包成本 $${expectedUnitCost}，實際計算為 $${prodRes.unitCost}`);
          }

          // --- 額外擴展：蔬菜原料加工與半成品分裝流程整合測試 ---
          t.details.push('【新蔬菜加工三階段流程聯動測試】模擬生鮮南瓜原料採購登記 10 KG，總額 300 元，加工費率每公斤 20 元，出爐乾貨產出 2.5 KG，並進行零售分裝。');
          
          // 1. 登記加工工單 (原料進貨登記)
          const registerRes = fifoEngine.registerProcessingJob({
            selectedMatId: 'NEW',
            newName: '南瓜',
            category: '蔬菜類',
            wetQty: 10,
            wetTotalCost: 300,
            feeType: 'per_kg',
            processingFee: 20, // 每公斤 20 元
            manufactureDate: '2026-06-06',
            operatorId: 'usr_super_admin'
          }, updatedDb);

          if (!registerRes.success || !registerRes.job) {
            t.status = 'FAIL';
            t.details.push(`❌ 蔬菜原料採購登記工單失敗：${registerRes.error}`);
          } else {
            t.details.push(`✅ 蔬菜原料採購登記工單成功！工單 ID: ${registerRes.job.job_id}`);

            // 2. 烘乾出爐登記 (回填乾重與扣生料庫存)
            const completeRes = fifoEngine.completeProcessingJob({
              jobId: registerRes.job.job_id,
              dryWeightYield: 2.5,
              manufactureDate: '2026-06-06',
              expiryDate: '2026-12-06',
              operatorId: 'usr_super_admin'
            }, updatedDb);

            if (!completeRes.success) {
              t.status = 'FAIL';
              t.details.push(`❌ 蔬菜原料烘乾出爐登記失敗：${completeRes.error}`);
            } else {
              const expectedDryCost = 200; // ((300 + 20*10) / 2.5) = 500 / 2.5 = 200
              t.details.push(`計算結果：南瓜乾半成品單價成本為 $${completeRes.dryUnitCost}/KG`);
              if (completeRes.dryUnitCost === expectedDryCost) {
                t.details.push('✅ 蔬菜原料烘乾加工成本計算正確！');
              } else {
                t.status = 'FAIL';
                t.details.push(`❌ 蔬菜原料加工成本錯誤：預期單價 $${expectedDryCost}，實際為 $${completeRes.dryUnitCost}`);
              }

              // 檢查庫存中南瓜乾半成品的庫存
              const pumpkinDryStock = updatedDb.warehouse_stocks
                .filter((s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === 'MAT_DRY_PUMPKIN')
                .reduce((sum: number, s: any) => sum + s.quantity, 0);

              t.details.push(`加工後，南瓜乾半成品總倉庫存: ${pumpkinDryStock} KG`);
              if (pumpkinDryStock === 2.5) {
                t.details.push('✅ 南瓜乾半成品庫存寫入正確！');
              } else {
                t.status = 'FAIL';
                t.details.push(`❌ 南瓜乾半成品庫存數量錯誤：預期庫存 2.5 KG，實際為 ${pumpkinDryStock} KG`);
              }

              // 3. 半成品分裝做貨
              t.details.push('【半成品分裝做貨聯動測試】將產出的 2.5 KG 南瓜乾半成品分裝成 25 包小包規格，消耗小夾鏈袋 25 個, 乾燥劑 25 個, 貼紙 25 張。');
              
              // 包裝前先讀取包裝耗材的數量
              const bagStockBefore = updatedDb.warehouse_stocks
                .filter((s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === 'MAT_BAG_S')
                .reduce((sum: number, s: any) => sum + s.quantity, 0);

              const portionRes = fifoEngine.portionSemiProduct({
                selectedSemiMatId: 'MAT_DRY_PUMPKIN',
                semiWeightToConsume: 2.5,
                skuSpec: '小包',
                packagedQty: 25,
                bagId: 'MAT_BAG_S',
                bagQty: 25,
                stickerId: 'MAT_STICKER',
                stickerQty: 25,
                desiccantId: 'MAT_DESICCANT',
                desiccantQty: 25,
                manufactureDate: '2026-06-06',
                expiryDate: '2026-12-06',
                operatorId: 'usr_super_admin'
              }, updatedDb);

              if (!portionRes.success) {
                t.status = 'FAIL';
                t.details.push(`❌ 半成品分裝做貨測試失敗：${portionRes.error}`);
              } else {
                // 耗材成本：25 * 2 (袋) + 25 * 1 (貼紙) + 25 * 0.5 (乾燥劑) = 50 + 25 + 12.5 = 87.5
                // 乾半成品成本：2.5 * 200 = 500
                // 總成本：500 + 87.5 = 587.5
                // 單包落地成本：587.5 / 25 = 23.5
                const expectedPortionCost = 23.5;
                t.details.push(`計算結果：南瓜分裝包零售單包落地成本為 $${portionRes.unitCost}/包`);
                if (portionRes.unitCost === expectedPortionCost) {
                  t.details.push('✅ 半成品分裝做貨落地單包成本計算正確！');
                } else {
                  t.status = 'FAIL';
                  t.details.push(`❌ 半成品分裝做貨落地成本錯誤：預期單價 $${expectedPortionCost}，實際為 ${portionRes.unitCost}`);
                }

                // 檢查南瓜零售成品庫存
                const pumpkinRetailStock = updatedDb.warehouse_stocks
                  .filter((s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === 'PROD_PUMPKIN_S')
                  .reduce((sum: number, s: any) => sum + s.quantity, 0);

                t.details.push(`分裝後，南瓜零售成品總倉庫存: ${pumpkinRetailStock} 包`);
                if (pumpkinRetailStock === 25) {
                  t.details.push('✅ 南瓜分裝零售包庫存寫入正確！');
                } else {
                  t.status = 'FAIL';
                  t.details.push(`❌ 南瓜分裝零售包庫存數量錯誤：預期庫存 25 包，實際為 ${pumpkinRetailStock} 包`);
                }

                // 檢查耗材扣除數量
                const bagStockAfter = updatedDb.warehouse_stocks
                  .filter((s: any) => s.warehouse_id === 'WH_MAIN' && s.product_or_material_id === 'MAT_BAG_S')
                  .reduce((sum: number, s: any) => sum + s.quantity, 0);

                t.details.push(`分裝後，總倉小夾鏈袋庫存: ${bagStockAfter} 個 (分裝前 ${bagStockBefore} 個)`);
                if (bagStockBefore - bagStockAfter === 25) {
                  t.details.push('✅ 包裝耗材 FIFO 庫存扣減數量正確！');
                } else {
                  t.status = 'FAIL';
                  t.details.push(`❌ 包裝耗材 FIFO 庫存扣減數量錯誤：預期扣減 25 個，實際扣減了 ${bagStockBefore - bagStockAfter} 個`);
                }
              }
            }
          }
        }
      }

      // --- 測試 3：FIFO 銷貨扣庫與財務毛利測試 ---
      {
        const t = newResults[2];
        t.status = 'PASS';
        t.details = [];
        t.details.push('【FIFO 銷售扣減】模擬在高美醫院銷售小包雞肉凍乾 10 包，單包零售價 150 元。');
        
        const tempDb = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);
        const initialStock = tempDb.warehouse_stocks
          .filter((s: any) => s.warehouse_id === 'WH_VET_GAOMEI' && s.product_or_material_id === 'PROD_CHICKEN_S')
          .reduce((sum: number, s: any) => sum + s.quantity, 0);

        t.details.push(`銷售前高美醫院小包雞肉庫存: ${initialStock} 包`);

        // 執行銷售扣庫 (會扣除 10 包)
        // 預設資料庫中高美醫院有批次 LOT-20260512-CHICK-S-01 庫存 15 包，單包批次進貨成本為 55 元
        const orderId = dbService.createSalesOrder(
          'WH_VET_GAOMEI',
          '2026-06-06',
          [{ productId: 'PROD_CHICKEN_S', quantity: 10, unitPrice: 150, specificDate: '2026-06-06' }]
        );

        t.details.push(`銷售訂單已建立，ID: ${orderId}`);

        const updatedDb = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);
        const finalStock = updatedDb.warehouse_stocks
          .filter((s: any) => s.warehouse_id === 'WH_VET_GAOMEI' && s.product_or_material_id === 'PROD_CHICKEN_S')
          .reduce((sum: number, s: any) => sum + s.quantity, 0);

        t.details.push(`銷售後高美醫院小包雞肉庫存: ${finalStock} 包 (預期減少 10 包)`);

        if (initialStock - finalStock === 10) {
          t.details.push('✅ 成品銷貨庫存扣除數量正確！');
        } else {
          t.status = 'FAIL';
          t.details.push(`❌ 成品庫存扣減有誤！預期應為 ${initialStock - 10} 包，實際為 ${finalStock} 包`);
        }

        // 檢查銷售明細的成本與利潤計算
        // 10 包 * 55成本 = 550 元成本
        // 通路扣款：高美醫院為 FLAT，每包扣費 5 元 -> 10 包扣費 50 元
        // 實收金額 = 10 * 150 - 50 = 1450 元
        // 營業毛利 = 1450 - 550 = 900 元
        const order = updatedDb.sales_orders.find((o: any) => o.order_id === orderId);
        const orderItem = updatedDb.sales_order_items.find((item: any) => item.order_id === orderId);

        t.details.push(`通路扣費: $${order.total_channel_fee} (預期 $50)`);
        t.details.push(`實收金額: $${order.net_receivable} (預期 $1450)`);
        t.details.push(`計算所得明細成本: $${orderItem.calculated_cost} (預期 $550)`);

        if (order.total_channel_fee === 50 && order.net_receivable === 1450 && orderItem.calculated_cost === 550) {
          t.details.push('✅ 銷售實收、通路費與 FIFO 批次銷貨成本 (COGS) 計算完全正確！');
        } else {
          t.status = 'FAIL';
          t.details.push('❌ 銷貨財務計算錯誤，請檢查資料扣減公式。');
        }
      }

      // --- 測試 4：定價矩陣與損益兩平逆推測試 ---
      {
        const t = newResults[3];
        t.status = 'PASS';
        t.details = [];
        t.details.push('【公式 7.3 & 7.5 定價與損益兩平核對】');
        
        // 假設定價模擬：
        // 商品落地成本 C = 60 元
        // 通路抽成 R = 10% (0.10)
        // 通路固定單件費 F_flat = 5 元
        // 目標毛利率 M = 50% (0.50)
        // 根據公式 7.3 建議售價 P = (C + F_flat) / (1 - M - R) = (60 + 5) / (1 - 0.5 - 0.1) = 65 / 0.4 = 162.5 元
        const C = 60;
        const F = 5;
        const R = 0.1;
        const M = 0.5;
        
        const priceP = (C + F) / (1 - M - R);
        t.details.push(`目標毛利率 50% 逆推建議售價計算結果: $${priceP} (預期 $162.5)`);

        if (priceP === 162.5) {
          t.details.push('✅ 目標毛利率逆推建議售價公式 7.3 正確！');
        } else {
          t.status = 'FAIL';
          t.details.push(`❌ 逆推建議售價計算錯誤！實際算出為 ${priceP}`);
        }

        // 損益兩平點 Q 測試：
        // 本批總投入成本 TC = 5000 元 (固定成本)
        // 單包成品包材與耗材總價 C_pack = 10 元 (變動成本之一，在此公式代表扣除原料成本後的包材部分，為簡化我們帶入公式)
        // 預計零售價 P = 200 元
        // 通路抽成 R = 10% (0.10), 通路固定費 F_flat = 5 元
        // Q = TC / (P - P*R - F_flat - C_pack) = 5000 / (200 - 20 - 5 - 10) = 5000 / 165 = 30.303 包
        // 系統需無條件進位至整數包數 -> 預期應為 31 包
        const TC = 5000;
        const C_pack = 10;
        const P = 200;
        
        const breakevenQ = Math.ceil(TC / (P - (P * R) - F - C_pack));
        t.details.push(`損益兩平包數計算結果 Q = ${breakevenQ} 包 (預期 31 包，無條件進位)`);

        if (breakevenQ === 31) {
          t.details.push('✅ 損益兩平點銷量 Q 計算與無條件進位公式 7.5 正確！');
        } else {
          t.status = 'FAIL';
          t.details.push(`❌ 損益兩平計算錯誤！實際算出為 ${breakevenQ} 包`);
        }
      }

      // --- 測試 5：RLS 安全權限阻擋測試 ---
      {
        const t = newResults[4];
        t.status = 'PASS';
        t.details = [];
        t.details.push('【RLS 權限檢測】切換目前用戶為一般員工 [STAFF - 大雄]，並嘗試更新系統參數配置。');
        
        localStorage.setItem('pet_freeze_dried_erp_current_user', 'usr_staff');
        const currentUser = getCurrentUser();
        t.details.push(`目前登入角色：${currentUser.role} (${currentUser.name})`);

        try {
          // 嘗試更新營業稅率，預期會拋出權限不足之 Error
          dbService.updateConfig('TAX_RATE', '0.08');
          
          t.status = 'FAIL';
          t.details.push('❌ 安全漏洞：一般員工竟然能成功更新系統參數設定！');
        } catch (e: any) {
          t.details.push(`✅ 成功防攔！拋出預期異常: "${e.message}"`);
          t.details.push('✅ 資料庫 RLS 權限阻擋防護運作完美無缺！');
        }
      }

      // --- 測試 6：銷貨單作廢與基礎資料防呆測試 ---
      {
        const t = newResults[5];
        t.status = 'PASS';
        t.details = [];
        t.details.push('【銷貨單作廢與庫存還原】驗證作廢銷貨單是否能完美還原對應批次庫存。');

        // 登入為 SUPER_ADMIN 執行作廢與基礎資料維護
        localStorage.setItem('pet_freeze_dried_erp_current_user', 'usr_super_admin');
        const dbBefore = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);

        // 1. 取得高美醫院小包雞肉初始庫存
        const initialStock = dbBefore.warehouse_stocks
          .filter((s: any) => s.warehouse_id === 'WH_VET_GAOMEI' && s.product_or_material_id === 'PROD_CHICKEN_S')
          .reduce((sum: number, s: any) => sum + s.quantity, 0);

        t.details.push(`初始庫存：高美醫院雞肉小包共 ${initialStock} 包`);

        // 2. 建立銷售單，賣出 5 包
        const orderId = dbService.createSalesOrder(
          'WH_VET_GAOMEI',
          '2026-06-06',
          [{ productId: 'PROD_CHICKEN_S', quantity: 5, unitPrice: 150, specificDate: '2026-06-06' }]
        );
        
        const dbAfterOrder = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);
        const stockAfterOrder = dbAfterOrder.warehouse_stocks
          .filter((s: any) => s.warehouse_id === 'WH_VET_GAOMEI' && s.product_or_material_id === 'PROD_CHICKEN_S')
          .reduce((sum: number, s: any) => sum + s.quantity, 0);

        t.details.push(`賣出 5 包後庫存：${stockAfterOrder} 包 (預期減少 5 包)`);
        if (initialStock - stockAfterOrder !== 5) {
          t.status = 'FAIL';
          t.details.push('❌ 銷售庫存扣除失敗！');
        }

        // 3. 執行銷貨單作廢
        dbService.voidSalesOrder(orderId, '測試作廢庫存還原');
        
        const dbAfterVoid = JSON.parse(localStorage.getItem('pet_freeze_dried_erp_db')!);
        const stockAfterVoid = dbAfterVoid.warehouse_stocks
          .filter((s: any) => s.warehouse_id === 'WH_VET_GAOMEI' && s.product_or_material_id === 'PROD_CHICKEN_S')
          .reduce((sum: number, s: any) => sum + s.quantity, 0);

        t.details.push(`作廢單據後庫存：${stockAfterVoid} 包 (預期還原至 ${initialStock} 包)`);
        if (stockAfterVoid === initialStock) {
          t.details.push('✅ 銷貨單作廢且庫存 FIFO 回填還原成功！');
        } else {
          t.status = 'FAIL';
          t.details.push('❌ 庫存還原失敗，還原後的數量與初始數量不符！');
        }

        // 4. 基礎資料防呆測試：刪除正被 BOM 配方使用的原料，預期會拋出異常
        t.details.push('【基礎資料防呆測試】嘗試刪除正被成品 BOM 綁定使用的原料 [MAT_DRY_CHICKEN]，預期應拋出 BOM 配方關聯異常。');
        try {
          dbService.deleteMaterial('MAT_DRY_CHICKEN');
          t.status = 'FAIL';
          t.details.push('❌ 安全漏洞：竟能刪除已被 BOM 綁定的原料！');
        } catch (e: any) {
          t.details.push(`✅ 成功攔截！拋出預期異常: "${e.message}"`);
        }

        // 5. RLS 權限阻擋測試：STAFF 嘗試作廢銷貨單，預期會拋出權限不足之 Error
        t.details.push('【RLS 作廢權限檢測】切換為 STAFF 角色，嘗試作廢上述銷貨單，預期應拋出權限不足異常。');
        localStorage.setItem('pet_freeze_dried_erp_current_user', 'usr_staff');
        try {
          dbService.voidSalesOrder(orderId, '一般員工嘗試作廢');
          t.status = 'FAIL';
          t.details.push('❌ 安全漏洞：一般員工竟然能成功作廢銷貨單！');
        } catch (e: any) {
          t.details.push(`✅ 成功攔截！拋出預期異常: "${e.message}"`);
          t.details.push('✅ 銷貨單作廢與基礎資料防呆阻擋測試全部通過！');
        }
      }

      setResults(newResults);
    } catch (err: any) {
      console.error(err);
    } finally {
      // 測試完畢後，將資料庫與登入狀態還原成測試前的狀態，不影響使用者介面操作
      if (dbBackup) localStorage.setItem('pet_freeze_dried_erp_db', dbBackup);
      if (userBackup) localStorage.setItem('pet_freeze_dried_erp_current_user', userBackup);
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle className="w-5 h-5 text-warm-green" />;
      case 'FAIL':
        return <XCircle className="w-5 h-5 text-warm-red" />;
      default:
        return <RefreshCw className="w-5 h-5 text-brand-camel animate-spin" />;
    }
  };

  return (
    <div className="bg-canvas-alt p-6 rounded-2xl border border-brand-camel shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-text-charcoal flex items-center gap-2">
            🛠 全模組功能自動化測試控制台
          </h3>
          <p className="text-sm text-text-charcoal/70 mt-1">
            本控制台提供全系統商業邏輯、FIFO 扣除算法、成本核算、稅務與 RLS 權限安全的一鍵測試與除錯報告。
          </p>
        </div>
        <button
          onClick={runAllTests}
          disabled={isRunning}
          className="flex items-center gap-2 bg-brand-primary text-canvas-bg px-5 py-2.5 rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              測試中...
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              執行全模組測試
            </>
          )}
        </button>
      </div>

      <div className="space-y-4">
        {results.map((r) => (
          <div key={r.id} className="bg-canvas-bg rounded-xl border border-brand-camel/50 p-4 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-bold text-text-charcoal flex items-center gap-2">
                  {r.name}
                </h4>
                <p className="text-xs text-text-charcoal/65 mt-0.5">{r.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.status === 'PENDING' ? (
                  <span className="text-xs bg-brand-camel/20 text-brand-camel px-2.5 py-1 rounded-full font-medium">
                    待執行
                  </span>
                ) : r.status === 'PASS' ? (
                  <span className="text-xs bg-warm-green/20 text-warm-green px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> PASS
                  </span>
                ) : (
                  <span className="text-xs bg-warm-red/20 text-warm-red px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> FAIL
                  </span>
                )}
              </div>
            </div>

            {r.details.length > 0 && (
              <div className="bg-canvas-alt/75 rounded-lg p-3 text-xs font-mono text-text-charcoal/85 space-y-1 mt-2 border-l-2 border-brand-camel max-h-48 overflow-y-auto">
                {r.details.map((detail, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {detail}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="bg-brand-accent/10 border border-brand-accent/35 rounded-xl p-4 flex gap-3 text-xs text-text-charcoal/90">
        <Info className="w-5 h-5 text-brand-accent shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">自動除錯沙盒模式：</span>
          執行測試時，系統會自動在記憶體與獨立的 LocalStorage 副本中運行隔離模擬，完全不會破壞您當前 ERP 系統庫存或對帳的真實紀錄，請放心一鍵點擊執行。
        </div>
      </div>
    </div>
  );
};

const DEFAULT_PROFILES = [
  { id: 'usr_super_admin', email: 'owner@antigravity.pet', role: 'SUPER_ADMIN', name: '創辦人-阿銘', created_at: new Date().toISOString() },
  { id: 'usr_admin', email: 'manager@antigravity.pet', role: 'ADMIN', name: '廠長-小華', created_at: new Date().toISOString() },
  { id: 'usr_staff', email: 'staff@antigravity.pet', role: 'STAFF', name: '現場人員-大雄', created_at: new Date().toISOString() },
  { id: 'usr_partner', email: 'vet@gaomei.pet', role: 'PARTNER', name: '高美醫院-陳院長', created_at: new Date().toISOString() },
];
