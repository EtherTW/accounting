---
name: record-transaction
description: 從 GitHub Issue 記錄以太坊交易到 Beancount 帳本。當使用者提供 EtherTW/accounting 的 GitHub Issue URL 並想要記帳時使用。觸發詞 - "record"、"記帳"、"record-transaction"。
---

# 記錄交易

從 GitHub Issue 記錄以太坊交易到 TEM Beancount 帳本。

## 輸入

使用者提供 GitHub Issue URL：`https://github.com/EtherTW/accounting/issues/<number>`

## 工作流程

### 步驟 1：讀取 GitHub Issue

執行以下指令取得 issue 內容與留言：

```bash
gh issue view <number> --repo EtherTW/accounting --comments
```

擷取以下資訊：
- **Issue 標題**：去除 `[請款]:` 前綴作為 narration
- **Issue 作者**：作為 payee（優先檢查 issue 內文的「暱稱」欄位）
- **TX hash**：在留言中尋找 `0x[a-fA-F0-9]{64}`（可能包含在 Etherscan URL 中）
- **Issue URL**：`https://github.com/EtherTW/accounting/issues/<number>`

如果留言中找不到 TX hash，請要求使用者提供。

### 步驟 2：取得鏈上資料

執行取得交易資料的腳本：

```bash
bun run scripts/fetch-tx.ts --tx <hash>
```

此指令會回傳包含 `tx`、`price` 和 `balance` 欄位的 JSON。

### 步驟 3：判斷交易方向

比對 `tx.from` 和 `tx.to` 與 GnosisSafe 地址 `0x3BB6938118bbc1e63e56ABB94dBa66570F4BB0d0`（不分大小寫）：
- 如果 Safe 是發送方（`tx.from`）：這是一筆**支出**交易（expense）
- 如果 Safe 是接收方（`tx.to`）：這是一筆**收入**交易（income）

### 步驟 4：推斷 Beancount 帳戶

根據 issue 標題和內文推斷帳戶：
- 提及 "grant" → `Expenses:Grant`
- 提及 "salary" 或 "coordination" → `Expenses:Salary`
- 提及 "venue" 或 "場地" → `Expenses:Venue`
- 提及 "host" 或 "主持" → `Expenses:HostFee`
- 提及 "donation" 或 "捐" → `Income:Donation`
- 提及 "sponsor" 或 "贊助" → `Income:Sponsor:ETH` 或 `Income:Sponsor:TWD`

如果無法確定，列出 `main.bean` 中現有的帳戶（查看 `open` 指令）並請使用者選擇。

### 步驟 5：產生 Beancount 記帳項目

產生三個區塊附加到 `main.bean`：

**支出 ETH 交易：**

```
<date> price ETH <ETH_TWD price> TWD

<date> * "<payee>" "<narration>"
    url: "https://etherscan.io/tx/<hash>"
    github: "https://github.com/EtherTW/accounting/issues/<number>"
    Assets:Ethereum:GnosisSafe                 -<value> ETH {}
    <Expense account>

<date+1> balance Assets:Ethereum:GnosisSafe <ETH balance> ETH
```

**支出 DAI 交易：**

```
<date> price DAI <DAI_TWD price> TWD

<date> * "<payee>" "<narration>"
    url: "https://etherscan.io/tx/<hash>"
    github: "https://github.com/EtherTW/accounting/issues/<number>"
    Assets:Ethereum:GnosisSafe                 -<value> DAI {}
    <Expense account>

<date+1> balance Assets:Ethereum:GnosisSafe <DAI balance> DAI
```

**收入交易**使用 `{<price> TWD}` 取代 `{}` 作為成本基準。

### 步驟 6：寫入檔案

使用 Edit 工具將產生的記帳項目附加到 `main.bean` 的末尾。

### 步驟 7：驗證

執行 `bean-check main.bean` 確認帳本仍然有效。如果失敗，顯示錯誤並協助使用者修正。

## 格式規則

- price：放在交易之前，僅在 `main.bean` 中
- payee：issue 作者的顯示名稱或 issue 內文中的暱稱
- narration：去除 `[請款]:` 前綴的 issue 標題
- metadata：`url` = Etherscan 交易連結，`github` = issue URL
- 成本基準：支出使用 `{}`（FIFO 自動配對），收入使用 `{<price> TWD}`
- 餘額斷言日期：交易日期 + 1 天
- 交易行使用 4 個空格縮排
