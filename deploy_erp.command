#!/bin/bash
# 寵物凍乾 ERP 一鍵部署工具

# 切換到專案目錄
cd "/Users/blackchao/Documents/GitHub/Lufushop"

echo "========================================="
echo "  正在手動部署「寵物凍乾 ERP」至 GitHub Pages...  "
echo "========================================="
echo ""

# 執行部署指令
npm run deploy

if [ $? -eq 0 ]; then
  echo ""
  echo "========================================="
  echo "  🎉 部署成功！"
  echo "  您的最新版大字體網頁已成功上線！"
  echo "  請等待約 30 秒，再用手機/iPad 打開網頁確認。"
  echo "========================================="
else
  echo ""
  echo "========================================="
  echo "  ❌ 部署失敗！"
  echo "  請確認您的電腦是否已連接網路，"
  echo "  或已在 GitHub Desktop 中登入正確的 GitHub 帳號。"
  echo "========================================="
fi

echo ""
echo "請按任意鍵關閉此視窗..."
read -n 1
