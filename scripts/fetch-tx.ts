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

async function main() {
  // Will be filled in next tasks
  console.log(JSON.stringify({ txHash }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
