# QuantStart — 美股量化選股／回測入門工具

一個為初學者而設的瀏覽器量化工具：匯入每日價格 CSV、設定 SMA／RSI 規則、執行無前視偏差的等權重回測，並匯出每日結果。

> **教育用途，不構成投資建議。** 回測是基於歷史數據的假設結果，不代表未來或實際交易表現。

## 功能

- 支援一隻或多隻股票的每日數據
- SMA 趨勢、RSI 區間及可選成交量規則
- 訊號延遲一個交易日執行，避免把同日收市訊號套用同日回報
- 可設定單邊交易成本（basis points）
- 顯示總回報、CAGR、最大回撤、波動率及 Sharpe ratio
- 與匯入股票的每日等權買入持有基準比較
- 匯出每日回測結果 CSV
- 中英文欄位兼容、手機版、深色模式
- 全部運算在瀏覽器內進行；不會上載你的 CSV

## 立即使用

1. 開啟網站後，準備 CSV：`date,ticker,close,volume`。
2. `date` 使用 `YYYY-MM-DD`；`close` 建議使用已調整收市價；`volume` 為選填。
3. 每個 `date + ticker` 組合只可出現一次。
4. 上載檔案、設定參數，再按「開始回測」。

範例結構：

```csv
date,ticker,close,volume
2024-01-02,AAPL,185.64,82488700
2024-01-02,MSFT,370.87,25258600
```

以上兩行只示範格式；建立研究數據時，請使用可信來源並自行核對調整方式及授權。

## 策略邏輯

股票在日期 \(t\) 收市後符合以下條件，策略才會在日期 \(t+1\) 持有：

- 快速 SMA 高於慢速 SMA
- 收市價高於慢速 SMA
- RSI(14) 介乎設定上下限
- 如啟用成交量確認：成交量高於 20 日平均

所有合資格股票採等權重。策略每日計算目標權重，按權重變化估算換手率，再扣除設定的單邊成本。基準是當日所有可交易匯入股票的等權回報。

## 重要限制

- 工具不會自動處理除牌股票、股息、拆股、稅項、借貨成本或市場衝擊。
- 如股票清單只包含現時仍然存在的公司，可能有倖存者偏差。
- 多次調整參數以追求最佳歷史結果，可能造成過度擬合。
- Sharpe ratio 在本工具假設無風險利率為 0%，一年 252 個交易日。
- 不同股票缺少日期時，當天只使用前後兩日均有價格的股票。
- 正式使用前，應進行 out-of-sample、walk-forward 及模擬交易測試。

## 本機開啟

直接雙擊 `index.html`，或在專案資料夾執行：

```bash
python -m http.server 8000
```

然後開啟 `http://localhost:8000`。

## GitHub Pages

Repository 已包含 GitHub Actions workflow。若網站沒有自動發佈：

1. 到 `Settings → Pages`。
2. 在 `Build and deployment` 的 `Source` 選擇 `GitHub Actions`。
3. 到 `Actions` 重新執行 `Deploy static site to Pages`。

## 檔案

- `index.html`：介面及內容
- `styles.css`：響應式設計及深／淺色主題
- `app.js`：CSV 解析、指標、回測、圖表及匯出
- `data-template.csv`：CSV 格式範本
- `.github/workflows/pages.yml`：GitHub Pages 發佈流程

## 私隱與依賴

CSV 只在你的瀏覽器記憶體處理，重新整理後即清除。圖表使用 Chart.js CDN；首次開啟網站需要網絡連線載入圖表庫及字體。

## License

MIT
