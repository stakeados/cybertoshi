import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getAddress,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
const argv = process.argv.slice(2),
  network = argv.includes("--network")
    ? argv[argv.indexOf("--network") + 1]
    : "base-sepolia";
if (!["local", "base-sepolia", "base"].includes(network))
  throw Error("Network must be local, base-sepolia or base.");
const selected = network;
const chain =
  selected === "base"
    ? base
    : selected === "base-sepolia"
      ? baseSepolia
      : defineChain({
          id: 31337,
          name: "Local test chain",
          nativeCurrency: { name: "Test Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
        });
const rpc = process.env.RPC_URL || chain.rpcUrls.default.http[0];
const client = createPublicClient({ chain, transport: http(rpc) });
if ((await client.getChainId()) !== chain.id)
  throw Error("RPC chain does not match selected network.");
const artifact = (name) =>
  JSON.parse(readFileSync(`out/${name}.sol/${name}.json`, "utf8"));
const broadcast = argv.includes("--broadcast");
if (!broadcast) {
  console.log(
    JSON.stringify(
      {
        network: selected,
        chainId: chain.id,
        mode: "review only",
        steps:
          selected === "base"
            ? [
                "deploy renderer",
                "deploy collection, token and immutable community vault",
              ]
            : [
                "deploy TEST ONLY DEX",
                "deploy renderer",
                "deploy collection, token and immutable community vault",
              ],
        initialTokenSupply: 0,
        communityReserve: "1000000 BCAT issued only at pool launch",
        poolThreshold: "0.02 ETH",
        creatorAllocation: 0,
        notice: "Use --broadcast to send transactions. No transaction sent.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (selected === "base" && !argv.includes("--ack-mainnet"))
  throw Error(
    "Mainnet requires explicit --ack-mainnet. Review tests, bytecode, DEX addresses and funding first.",
  );
let account;
if (selected === "local") {
  const addresses = await client.request({ method: "eth_accounts" });
  account = addresses[0];
} else {
  if (!process.env.DEPLOYER_PRIVATE_KEY)
    throw Error(
      "Set DEPLOYER_PRIVATE_KEY locally. Never paste keys into chat.",
    );
  account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
}
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
mkdirSync("deployments", { recursive: true });
const file = `deployments/${chain.id}.json`;
if (argv.includes('--fresh-local')) {
  if (selected !== 'local') throw Error('--fresh-local is only allowed on the local test chain.');
  if (existsSync(file)) writeFileSync(`deployments/31337-${Date.now()}.json`, readFileSync(file));
}
let state = existsSync(file) && !argv.includes('--fresh-local')
  ? JSON.parse(readFileSync(file, "utf8"))
  : { chainId: chain.id, receipts: [] };
async function deploy(name, args = []) {
  if (state[name]) {
    const code = await client.getCode({ address: state[name] });
    if (code && code !== "0x") return state[name];
    throw Error(
      "Saved deployment is missing from chain. Archive the old deployment manifest before starting a new local chain.",
    );
  }
  const a = artifact(name);
  const hash = await wallet.deployContract({
    abi: a.abi,
    bytecode: a.bytecode.object,
    args,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress)
    throw Error(name + " deployment failed");
  state[name] = receipt.contractAddress;
  state.receipts.push({
    name,
    hash,
    gasUsed: receipt.gasUsed.toString(),
    block: receipt.blockNumber.toString(),
  });
  writeFileSync(file, JSON.stringify(state, null, 2));
  console.log(name + ": " + receipt.contractAddress);
  return receipt.contractAddress;
}
let router, weth, factory;
if (selected === "base") {
  router = getAddress("0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43");
  weth = getAddress("0x4200000000000000000000000000000000000006");
  factory = getAddress("0x420dd381b31aef6683db6b902084cb0ffece40da");
  for (const address of [router, weth, factory]) {
    const code = await client.getCode({ address });
    if (!code || code === "0x")
      throw Error("Missing production DEX code: " + address);
  }
} else {
  router = await deploy("TestDex");
  weth = router;
  factory = router;
}
const renderer = await deploy("CyberToshiRenderer");
if (!state.mintStartsAt) {
  state.mintStartsAt = selected === 'base'
    ? JSON.parse(readFileSync('launch-config.json')).mintStartsAt
    : Number((await client.getBlock()).timestamp) + 300;
  writeFileSync(file, JSON.stringify(state, null, 2));
}
const collection = await deploy("CyberToshiNFT", [
  renderer,
  router,
  weth,
  factory,
  BigInt(state.mintStartsAt),
]);
const nft = artifact("CyberToshiNFT");
const read = (fn) =>
  client.readContract({ address: collection, abi: nft.abi, functionName: fn });
const [token, vault] = await Promise.all([
  read("bcatToken"),
  read("buybackRouter"),
]);
const config = {
  chainId: chain.id,
  collection,
  renderer,
  token,
  vault,
  testDex: selected !== "base",
  rpcUrl: selected === "local" ? rpc : chain.rpcUrls.default.http[0],
};
state.config = config;
writeFileSync(file, JSON.stringify(state, null, 2));
writeFileSync(
  "frontend/public/deployment.json",
  JSON.stringify(config, null, 2),
);
console.log(
  "Deployment verified and frontend configured. " +
    (config.testDex
      ? "TEST DEX: not real market liquidity."
      : "Production network."),
);
