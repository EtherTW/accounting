import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";

// Hardcoded addresses
const GNOSIS_SAFE =
  "0x3BB6938118bbc1e63e56ABB94dBa66570F4BB0d0" as const;
const LEGACY_GNOSIS_WALLET =
  "0x91a06469ded8eeb064c7a273ee947e380e1494d8" as const;
const DAI_CONTRACT =
  "0x6B175474E89094C44Da98b954EedeAC495271d0F" as const;

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
  transport: http(
    `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
  ),
});

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
  const date = timestamp.toISOString().split("T")[0]!;

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
      token: t.asset === "DAI" ? ("DAI" as const) : ("ETH" as const),
    }));

  if (transfers.length === 0) {
    throw new Error(
      `No transfers involving GnosisSafe found in tx ${hash}`
    );
  }

  const transfer = transfers[0]!;

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
    throw new Error(
      `CoinGecko ETH request failed: ${ethRes.status} ${ethRes.statusText}`
    );
  }
  if (!daiRes.ok) {
    throw new Error(
      `CoinGecko DAI request failed: ${daiRes.status} ${daiRes.statusText}`
    );
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

async function main() {
  const txData = await fetchTransactionData(txHash);
  const price = await fetchPrice(txData.date);
  console.log(JSON.stringify({ tx: txData, price }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
