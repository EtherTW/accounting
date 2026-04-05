# Record Transaction 技能設計

從 GitHub Issue 自動擷取以太坊交易資訊，產生 Beancount 記帳紀錄並寫入 TEM 帳本。

## 概述

一個 Claude Code 技能（`record-transaction`），使用者提供 GitHub Issue URL 後，自動解析鏈上交易資料、查詢匯率，產生 Beancount 紀錄並 append 到 `main.bean`。

## 架構

兩個元件，職責分離：

### 1. TypeScript Script（`scripts/fetch-tx.ts`）

純資料擷取。不處理 GitHub 互動，也不產生 Beancount 紀錄。

**輸入：** TX hash，透過 CLI 參數

```bash
bun run scripts/fetch-tx.ts --tx 0xa298...
```

**職責：**
- 透過 viem + Alchemy RPC 取得交易資料（`getTransaction`、`getTransactionReceipt`、`getBlock`）
- 判斷轉帳類型：原生 ETH 轉帳 vs ERC-20 token 轉帳（解析 receipt logs）
- 透過 CoinGecko `/coins/{id}/history` 取得交易當天的 ETH/TWD、DAI/TWD 匯率
- 透過 viem 取得 GnosisSafe 目前的 ETH 餘額（`getBalance`）及 DAI 餘額（ERC-20 `balanceOf`）

**輸出：** JSON 到 stdout

```json
{
  "tx": {
    "hash": "0xa298...",
    "from": "0x3BB6...",
    "to": "0x96A4...",
    "value": "1.22",
    "token": "ETH",
    "timestamp": "2025-03-15T10:30:00Z",
    "date": "2025-03-15"
  },
  "price": {
    "ETH_TWD": 78664.43,
    "DAI_TWD": 32.14
  },
  "balance": {
    "ETH": "10.516392141",
    "DAI": "908.282827068036191747"
  }
}
```

**依賴：**
- `viem` — Ethereum RPC 客戶端
- 環境變數：`ALCHEMY_API_KEY`、`COINGECKO_API_KEY`

**寫死的地址：**
- GnosisSafe：`0x3BB6938118bbc1e63e56ABB94dBa66570F4BB0d0`
- 舊版 GnosisWallet：`0x91a06469ded8eeb064c7a273ee947e380e1494d8`
- DAI 合約：`0x6B175474E89094C44Da98b954EedeAC495271d0F`

### 2. Claude Code 技能（`record-transaction`）

協調者。負責 GitHub 互動、帳戶推斷、Beancount 紀錄產生。

**觸發方式：** 使用者提供 GitHub Issue URL

```
/record-transaction https://github.com/EtherTW/accounting/issues/24
```

**技能流程：**

1. **讀取 Issue** — 用 `gh issue view <number> --repo EtherTW/accounting --comments` 取得 issue 內容與留言
2. **解析 TX hash** — 用 regex `0x[a-fA-F0-9]{64}` 從留言中找出交易 hash（可能是裸 hash 或 Etherscan URL 中的一部分）
3. **執行 script** — 呼叫 `bun run scripts/fetch-tx.ts --tx <hash>`，解析 JSON 輸出
4. **判斷方向** — 比對 `tx.from` 和 `tx.to` 與 GnosisSafe 地址，判斷是支出還是收入
5. **推斷帳戶** — 根據 issue 標題和內容推斷 Beancount 帳戶：
   - 提到 "grant" → `Expenses:Grant`
   - 提到 "salary" 或 "coordination" → `Expenses:Salary`
   - 提到 "venue" 或 "場地" → `Expenses:Venue`
   - 提到 "donation" 或 "捐" → `Income:Donation`
   - 無法判斷時，列出現有帳戶讓使用者選擇
6. **產生 Beancount 紀錄** — 產出三個區塊：
   - 交易當天的 `price` 指令
   - 交易紀錄，含 metadata（`url`、`github`）
   - 隔天的 `balance` assertion
7. **寫入檔案** — 將紀錄 append 到 `main.bean` 尾端

## Beancount 輸出格式

以 issue #24（支出 ETH）為例：

```beancount
2025-03-15 price ETH 78,664.43 TWD

2025-03-15 * "NIC619" "TEM Grant - 去中心化領稿費機制實驗 2"
    url: "https://etherscan.io/tx/0xa298..."
    github: "https://github.com/EtherTW/accounting/issues/24"
    Assets:Ethereum:GnosisSafe                 -1.22 ETH {}
    Expenses:Grant

2025-03-16 balance Assets:Ethereum:GnosisSafe 10.516392141 ETH
```

### 格式規則：
- **price**：放在交易前面，只寫在 `main.bean`（不動 `eth-prices.bean`）
- **payee**：issue 作者的顯示名稱，或 issue 內容中的暱稱
- **narration**：issue 標題，去掉 `[請款]:` 前綴
- **metadata**：`url` = Etherscan 交易連結，`github` = issue URL
- **成本基礎**：支出用 `{}`（FIFO 自動配對），收入用 `{<price> TWD}`
- **balance assertion 日期**：交易日期 + 1 天
- **DAI 匯率**：如果交易涉及 DAI，同時加上 DAI/TWD 的 price

## 錯誤處理

- issue 留言中找不到 TX hash：回報使用者，請手動提供
- TX hash 無效或鏈上查無此交易：回報錯誤
- CoinGecko 超過速率限制：回報錯誤，建議稍後重試
- 無法推斷帳戶：列出現有的支出/收入帳戶讓使用者選擇

## 環境設定

必要的環境變數：
- `ALCHEMY_API_KEY` — Alchemy API key，用於 Ethereum mainnet RPC
- `COINGECKO_API_KEY` — CoinGecko API key，用於查詢匯率

必要的工具：
- `bun` — TypeScript 執行環境
- `gh` — GitHub CLI（需已登入）
