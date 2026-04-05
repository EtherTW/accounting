# Record Transaction 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個 Claude Code 技能，從 GitHub Issue 自動擷取以太坊交易資訊，產生 Beancount 記帳紀錄並寫入帳本。

**Architecture:** 兩個元件 — TypeScript script (`scripts/fetch-tx.ts`) 負責鏈上資料擷取與匯率查詢，Claude Code skill (`record-transaction`) 負責 GitHub 互動、帳戶推斷、Beancount 紀錄產生與檔案寫入。Script 透過 stdout JSON 與 skill 溝通。

**Tech Stack:** Bun, TypeScript, viem (Ethereum RPC), CoinGecko API, gh CLI

---

## 檔案結構

```
accounting/
├── scripts/
│   └── fetch-tx.ts          # (Create) CLI script - fetch on-chain tx data + price + balance
├── package.json              # (Create) bun project with viem dependency
├── tsconfig.json             # (Create) TypeScript config
└── .claude/
    └── skills/
        └── record-transaction/
            └── SKILL.md      # (Create) Claude Code skill definition
```

---

### Task 1: 初始化 Bun 專案

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: 初始化 package.json**

```bash
cd c:/Users/yuren/Documents/30-resources/src/EtherTW/accounting
bun init -y
```

This creates a default `package.json`. Then edit it to remove unneeded fields and add the project name.

- [ ] **Step 2: 安裝 viem**

```bash
bun add viem
```

- [ ] **Step 3: 確認 tsconfig.json**

`bun init` generates a `tsconfig.json`. Verify it exists and has sensible defaults. If not, create one:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: 加 .gitignore 項目**

Append to existing `.gitignore`:

```
node_modules/
bun.lock
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore
git commit -m "feat: initialize bun project with viem dependency"
```

---

### Task 2: 實作 fetch-tx.ts — 解析 CLI 參數與常數定義

**Files:**
- Create: `scripts/fetch-tx.ts`

- [ ] **Step 1: 建立 scripts/fetch-tx.ts 骨架**

```typescript
import { createPublicClient, http, formatEther, formatUnits, type Hex } from "viem";
import { mainnet } from "viem/chains";

// Hardcoded addresses
const GNOSIS_SAFE = "0x3BB6938118bbc1e63e56ABB94dBa66570F4BB0d0" as const;
const LEGACY_GNOSIS_WALLET = "0x91a06469ded8eeb064c7a273ee947e380e1494d8" as const;
const DAI_CONTRACT = "0x6B175474E89094C44Da98b954EedeAC495271d0F" as const;

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
if (!ALCHEMY_API_KEY) {
  console.error("Error: ALCHEMY_API_KEY environment variable is required");
  process.exit(1);
}

const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
if (!COINGECKO_API_KEY) {
  console.error("Error: COINGECKO_API_KEY environment variable is required");
  process.exit(1);
}

// Parse CLI args
const args = process.argv.slice(2);
const txIndex = args.indexOf("--tx");
if (txIndex === -1 || !args[txIndex + 1]) {
  console.error("Usage: bun run scripts/fetch-tx.ts --tx <tx-hash>");
  process.exit(1);
}
const txHash = args[txIndex + 1] as Hex;

const client = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`),
});

async function main() {
  // Will be filled in next tasks
  console.log(JSON.stringify({ txHash }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 驗證 script 可以執行**

```bash
ALCHEMY_API_KEY=test COINGECKO_API_KEY=test bun run scripts/fetch-tx.ts --tx 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

Expected: prints JSON with `txHash` field.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-tx.ts
git commit -m "feat: add fetch-tx.ts skeleton with CLI args and constants"
```

---

### Task 3: 實作 fetch-tx.ts — 取得鏈上交易資料

**Files:**
- Modify: `scripts/fetch-tx.ts`

Gnosis Safe 交易的特殊性：Safe 的 `execTransaction` 呼叫中，外層交易的 `from` 是提交者（signer/relayer），`to` 是 Safe 合約本身。實際的 ETH/token 轉帳發生在 internal transaction 中。

為了取得實際轉帳資訊，使用 Alchemy 的 `alchemy_getAssetTransfers` API，它能解碼 internal transactions 和 ERC-20 Transfer events。

- [ ] **Step 1: 加入 fetchTransactionData 函式**

在 `main()` 函式之前加入：

```typescript
interface TransferInfo {
  from: string;
  to: string;
  value: string;
  token: "ETH" | "DAI";
}

async function fetchTransactionData(hash: Hex) {
  const tx = await client.getTransaction({ hash });
  const block = await client.getBlock({ blockNumber: tx.blockNumber! });
  const timestamp = new Date(Number(block.timestamp) * 1000);
  const date = timestamp.toISOString().split("T")[0];

  // Find the actual transfer from/to the Safe
  // Use Alchemy's asset transfers API for accurate internal tx parsing
  const response = await fetch(
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [
          {
            fromBlock: `0x${tx.blockNumber!.toString(16)}`,
            toBlock: `0x${tx.blockNumber!.toString(16)}`,
            category: ["external", "internal", "erc20"],
            withMetadata: false,
            excludeZeroValue: true,
            maxCount: "0x64",
            // Filter by this specific tx
          },
        ],
      }),
    }
  );
  const data = (await response.json()) as any;
  const allTransfers = data.result?.transfers ?? [];

  // Filter transfers belonging to this tx hash and involving the Safe
  const safeLower = GNOSIS_SAFE.toLowerCase();
  const transfers: TransferInfo[] = allTransfers
    .filter(
      (t: any) =>
        t.hash.toLowerCase() === hash.toLowerCase() &&
        (t.from.toLowerCase() === safeLower ||
          t.to.toLowerCase() === safeLower)
    )
    .map((t: any) => ({
      from: t.from,
      to: t.to,
      value: String(t.value),
      token: t.asset === "DAI" ? "DAI" as const : "ETH" as const,
    }));

  if (transfers.length === 0) {
    throw new Error(
      `No transfers involving GnosisSafe found in tx ${hash}`
    );
  }

  // Use the first relevant transfer (typically the main one)
  const transfer = transfers[0];

  return {
    hash,
    from: transfer.from,
    to: transfer.to,
    value: transfer.value,
    token: transfer.token,
    timestamp: timestamp.toISOString(),
    date,
  };
}
```

- [ ] **Step 2: 在 main() 中呼叫並輸出**

Replace the `main()` function:

```typescript
async function main() {
  const txData = await fetchTransactionData(txHash);
  console.log(JSON.stringify({ tx: txData }, null, 2));
}
```

- [ ] **Step 3: 用真實交易測試**

Use a known tx from the ledger (the grant transfer from issue #23):

```bash
bun run scripts/fetch-tx.ts --tx 0x4c01c6ac5381dc81cfc2a814fc3f6030444cb93fe529423be12d44cc498388c5
```

Expected: JSON output with `tx.from` containing the Safe address, `tx.token` = "ETH", `tx.value` = "0.386".

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-tx.ts
git commit -m "feat: fetch on-chain transaction data via Alchemy"
```

---

### Task 4: 實作 fetch-tx.ts — 查詢 CoinGecko 匯率

**Files:**
- Modify: `scripts/fetch-tx.ts`

CoinGecko `/coins/{id}/history` API 回傳指定日期的價格。需要 Pro API key 才能使用此 endpoint。

- [ ] **Step 1: 加入 fetchPrice 函式**

在 `fetchTransactionData` 函式之後加入：

```typescript
interface PriceData {
  ETH_TWD: number;
  DAI_TWD: number;
}

async function fetchPrice(date: string): Promise<PriceData> {
  // CoinGecko expects dd-mm-yyyy format
  const [year, month, day] = date.split("-");
  const cgDate = `${day}-${month}-${year}`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "x-cg-demo-api-key": COINGECKO_API_KEY!,
  };

  const [ethRes, daiRes] = await Promise.all([
    fetch(
      `https://api.coingecko.com/api/v3/coins/ethereum/history?date=${cgDate}`,
      { headers }
    ),
    fetch(
      `https://api.coingecko.com/api/v3/coins/dai/history?date=${cgDate}`,
      { headers }
    ),
  ]);

  if (!ethRes.ok) {
    throw new Error(`CoinGecko ETH request failed: ${ethRes.status} ${ethRes.statusText}`);
  }
  if (!daiRes.ok) {
    throw new Error(`CoinGecko DAI request failed: ${daiRes.status} ${daiRes.statusText}`);
  }

  const ethData = (await ethRes.json()) as any;
  const daiData = (await daiRes.json()) as any;

  const ethTwd = ethData.market_data?.current_price?.twd;
  const daiTwd = daiData.market_data?.current_price?.twd;

  if (ethTwd === undefined) {
    throw new Error("ETH/TWD price not available from CoinGecko");
  }
  if (daiTwd === undefined) {
    throw new Error("DAI/TWD price not available from CoinGecko");
  }

  return {
    ETH_TWD: Math.round(ethTwd * 100) / 100,
    DAI_TWD: Math.round(daiTwd * 100) / 100,
  };
}
```

- [ ] **Step 2: 在 main() 中整合**

Update `main()`:

```typescript
async function main() {
  const txData = await fetchTransactionData(txHash);
  const price = await fetchPrice(txData.date);
  console.log(JSON.stringify({ tx: txData, price }, null, 2));
}
```

- [ ] **Step 3: 測試匯率查詢**

```bash
bun run scripts/fetch-tx.ts --tx 0x4c01c6ac5381dc81cfc2a814fc3f6030444cb93fe529423be12d44cc498388c5
```

Expected: JSON now includes `price` with `ETH_TWD` and `DAI_TWD` values.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-tx.ts
git commit -m "feat: fetch ETH/TWD and DAI/TWD prices from CoinGecko"
```

---

### Task 5: 實作 fetch-tx.ts — 查詢 GnosisSafe 餘額

**Files:**
- Modify: `scripts/fetch-tx.ts`

- [ ] **Step 1: 加入 fetchBalances 函式**

在 `fetchPrice` 函式之後加入：

```typescript
// Minimal ERC-20 ABI for balanceOf
const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface BalanceData {
  ETH: string;
  DAI: string;
}

async function fetchBalances(): Promise<BalanceData> {
  const [ethBalance, daiBalance] = await Promise.all([
    client.getBalance({ address: GNOSIS_SAFE }),
    client.readContract({
      address: DAI_CONTRACT,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [GNOSIS_SAFE],
    }),
  ]);

  return {
    ETH: formatEther(ethBalance),
    DAI: formatUnits(daiBalance, 18),
  };
}
```

- [ ] **Step 2: 在 main() 中整合完整輸出**

Final `main()`:

```typescript
async function main() {
  const txData = await fetchTransactionData(txHash);
  const [price, balance] = await Promise.all([
    fetchPrice(txData.date),
    fetchBalances(),
  ]);

  const result = { tx: txData, price, balance };
  console.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 3: 完整測試**

```bash
bun run scripts/fetch-tx.ts --tx 0x4c01c6ac5381dc81cfc2a814fc3f6030444cb93fe529423be12d44cc498388c5
```

Expected: Complete JSON with `tx`, `price`, and `balance` fields. `balance.ETH` should reflect the current Safe ETH balance.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-tx.ts
git commit -m "feat: fetch GnosisSafe ETH and DAI balances"
```

---

### Task 6: 建立 Claude Code Skill

**Files:**
- Create: `.claude/skills/record-transaction/SKILL.md`

- [ ] **Step 1: 建立 skill 目錄與檔案**

```bash
mkdir -p .claude/skills/record-transaction
```

- [ ] **Step 2: 撰寫 SKILL.md**

```markdown
---
name: record-transaction
description: Record an Ethereum transaction from a GitHub Issue into the Beancount ledger. Use when the user provides a GitHub Issue URL from EtherTW/accounting and wants to record the transaction. Trigger words - "record", "記帳", "record-transaction".
---

# Record Transaction

Record an Ethereum transaction into the TEM Beancount ledger from a GitHub Issue.

## Input

The user provides a GitHub Issue URL: `https://github.com/EtherTW/accounting/issues/<number>`

## Workflow

### Step 1: Read the GitHub Issue

Run this command to get the issue content and comments:

```bash
gh issue view <number> --repo EtherTW/accounting --comments
```

Extract:
- **Issue title**: strip `[請款]:` prefix for the narration
- **Issue author**: use as payee (check the issue body for a "暱稱" field first)
- **TX hash**: find `0x[a-fA-F0-9]{64}` in the comments (may be inside an Etherscan URL)
- **Issue URL**: `https://github.com/EtherTW/accounting/issues/<number>`

If no TX hash is found in comments, ask the user to provide one.

### Step 2: Fetch on-chain data

Run the fetch script:

```bash
bun run scripts/fetch-tx.ts --tx <hash>
```

This returns JSON with `tx`, `price`, and `balance` fields.

### Step 3: Determine transaction direction

Compare `tx.from` and `tx.to` against the GnosisSafe address `0x3BB6938118bbc1e63e56ABB94dBa66570F4BB0d0` (case-insensitive):
- If Safe is the sender (`tx.from`): this is an **outgoing** transaction (expense)
- If Safe is the receiver (`tx.to`): this is an **incoming** transaction (income)

### Step 4: Infer the Beancount account

Based on the issue title and body, infer the account:
- Mentions "grant" → `Expenses:Grant`
- Mentions "salary" or "coordination" → `Expenses:Salary`
- Mentions "venue" or "場地" → `Expenses:Venue`
- Mentions "host" or "主持" → `Expenses:HostFee`
- Mentions "donation" or "捐" → `Income:Donation`
- Mentions "sponsor" or "贊助" → `Income:Sponsor:ETH` or `Income:Sponsor:TWD`

If uncertain, list the existing accounts from `main.bean` (look for `open` directives) and ask the user to choose.

### Step 5: Generate Beancount entries

Produce three blocks to append to `main.bean`:

**For outgoing ETH transactions:**

```
<date> price ETH <ETH_TWD price> TWD

<date> * "<payee>" "<narration>"
    url: "https://etherscan.io/tx/<hash>"
    github: "https://github.com/EtherTW/accounting/issues/<number>"
    Assets:Ethereum:GnosisSafe                 -<value> ETH {}
    <Expense account>

<date+1> balance Assets:Ethereum:GnosisSafe <ETH balance> ETH
```

**For outgoing DAI transactions:**

```
<date> price DAI <DAI_TWD price> TWD

<date> * "<payee>" "<narration>"
    url: "https://etherscan.io/tx/<hash>"
    github: "https://github.com/EtherTW/accounting/issues/<number>"
    Assets:Ethereum:GnosisSafe                 -<value> DAI {}
    <Expense account>

<date+1> balance Assets:Ethereum:GnosisSafe <DAI balance> DAI
```

**For incoming transactions**, use `{<price> TWD}` instead of `{}` for cost basis.

### Step 6: Write to file

Use the Edit tool to append the generated entries to the end of `main.bean`.

### Step 7: Validate

Run `bean-check main.bean` to verify the ledger is still valid. If it fails, show the error and help the user fix it.

## Format rules

- price: placed before the transaction, only in `main.bean`
- payee: issue author's display name or nickname from the issue body
- narration: issue title with `[請款]:` prefix stripped
- metadata: `url` = Etherscan TX link, `github` = issue URL
- Cost basis: outgoing uses `{}` (FIFO auto-match), incoming uses `{<price> TWD}`
- Balance assertion date: transaction date + 1 day
- Use 4-space indentation for transaction lines
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/record-transaction/SKILL.md
git commit -m "feat: add record-transaction Claude Code skill"
```

---

### Task 7: 端對端測試

用 issue #24 的交易進行端對端驗證。

**Files:**
- None (manual testing)

- [ ] **Step 1: 確認環境變數已設定**

```bash
echo $ALCHEMY_API_KEY | head -c 5
echo $COINGECKO_API_KEY | head -c 5
```

Both should print the first 5 characters of the keys.

- [ ] **Step 2: 用 issue #24 的 TX hash 測試 script**

```bash
bun run scripts/fetch-tx.ts --tx 0xa29804f3fff078bbac3f4197258fa209bb70b924effeffa8483dc391b090895f
```

Expected: JSON output showing:
- `tx.token` = "ETH"
- `tx.value` ≈ "1.22"
- `tx.from` containing the Safe address (case-insensitive)
- `price.ETH_TWD` = a reasonable TWD price
- `balance.ETH` = current Safe ETH balance

- [ ] **Step 3: 測試 skill 完整流程**

In Claude Code, run:

```
/record-transaction https://github.com/EtherTW/accounting/issues/24
```

Verify:
- Correctly reads issue and finds TX hash from comments
- Runs script and parses output
- Generates correct Beancount entry with `Expenses:Grant`
- Appends to `main.bean`
- Balance assertion matches current Safe balance

- [ ] **Step 4: 驗證 Beancount 語法**

```bash
bean-check main.bean
```

Expected: no errors.

- [ ] **Step 5: 最終 commit**

```bash
git add main.bean
git commit -m "fix #24: transfer for TEM Grant - 去中心化領稿費機制實驗 2"
```
