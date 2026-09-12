import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  defineChain,
  formatEther,
  parseEther,
  isAddress,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import abis from "./abis.json";
import { makeInput, hashNonce } from './pow.js';
const $ = (id) => document.getElementById(id);
let cfg,
  chain,
  client,
  wallet,
  account,
  provider,
  ready = false,
  busy = false,
  starting = false,
  generation = 0,
  gpuWatchdog = null,
  workers = [],
  job = null,
  solution = null,
  monitor = null,
  checking = false,
  launched = false,
  pageSize = 12;
const say = (text, error = false) => {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
};
const fail = (error) =>
  say(error.shortMessage || error.message || String(error), true);
const amount = (value) =>
  Number(formatEther(value)).toLocaleString("en-US", {
    maximumFractionDigits: 6,
  });
const read = (kind, fn, args = [], extra = {}) =>
  client.readContract({
    address: cfg[kind === "nft" ? "collection" : kind],
    abi: abis[kind],
    functionName: fn,
    args,
    ...extra,
  });
function buttons() {
  const allowed = ready && !!account && !busy;
  $("mine").disabled = !allowed || starting || workers.length > 0 || !!solution;
  $("connect").disabled = busy;
  $("submit").disabled = !allowed || !solution;
  $("stop").disabled = !starting && workers.length === 0 && !solution;
  $("stop").textContent = solution ? 'Discard proof' : 'Stop';
  $("engine").disabled = starting || workers.length > 0;
  $("threads").disabled = starting || workers.length > 0 || $("engine").value === 'gpu';
}
function stop(clear = true) {
  clearTimeout(gpuWatchdog);
  generation++;
  starting = false;
  workers.forEach((w) => w.terminate());
  workers = [];
  if (clear) {
    solution = null;
    job = null;
    $("submit").hidden = true;
    clearInterval(monitor);
    monitor = null;
  }
  $("rate").textContent = "0 H/s";
  buttons();
}
async function refresh() {
  if (!ready) return;
  const [minted, alive, eth, boot, burned, price] = await Promise.all([
    read("nft", "totalMinted"),
    read("nft", "totalSupply"),
    client.getBalance({ address: cfg.vault }),
    read("vault", "bootstrapped"),
    read("vault", "totalBcatBurned"),
    read("nft", "mintPrice"),
  ]);
  launched = boot;
  $("mint-price").textContent = amount(price);
  $("price-note").textContent = minted >= 16384n ? 'Fully minted.' : `Epoch ${Number(minted / 512n) + 1} of 32 · ${Number(512n - minted % 512n)} mints left at this price. +0.0001 ETH per epoch.`;
  $("minted").textContent = Number(minted).toLocaleString("en-US");
  $("alive").textContent = Number(alive).toLocaleString("en-US");
  $("treasury").textContent = amount(eth) + " ETH";
  $("burned").textContent = amount(burned);
  $("progress").value = boot ? 100 : Math.min(100, (Number(eth) * 100) / 2e16);
  $("launch-state").textContent = boot ? "Pool launched" : "Funding the pool";
  $("funding-text").textContent = boot
    ? "Liquidity is permanently locked in the community vault. Pool fees fund BCAT burns and buybacks."
    : `${amount(eth)} / 0.02 ETH collected. Burns unlock when the pool launches.`;
  $("bootstrap").disabled =
    busy || !account || boot || eth < parseEther("0.02");
  $("checkpoint").disabled = busy || !account || !boot;
  $("collect-fees").disabled = busy || !account || !boot;
  try {
    const [spend] = await read("vault", "buybackQuote");
    $("buyback").disabled = busy || !account;
    $("buyback-note").textContent =
      `Eligible buyback: ${amount(spend)} ETH. The contract enforces a historical minimum output. The caller pays gas.`;
  } catch {
    $("buyback").disabled = true;
    $("buyback-note").textContent =
      "Buyback waiting for funds, cooldown or fresh price history. Update price history at intervals longer than 30 minutes; the first buyback needs at least three intervals.";
  }
  if (minted > 0n) {
    const uri = await read("nft", "tokenURI", [minted]).catch(() => null);
    if (uri) {
      const metadata = decode(uri);
      $("featured").src = metadata.image;
      $("featured").alt = metadata.name;
      $("art-label").textContent = metadata.name + " · onchain";
    }
  }
  buttons();
}
function decode(uri) {
  if (!uri.startsWith("data:application/json;base64,"))
    throw Error("Unsupported metadata");
  return JSON.parse(atob(uri.split(",")[1]));
}
async function inventory() {
  if (!ready || !account) {
    $("cats").replaceChildren();
    return;
  }
  const owner = account;
  const count = Number(await read("nft", "balanceOf", [owner]));
  const limit = Math.min(count, pageSize);
  const reward = await read("nft", "burnReward");
  const cards = await Promise.all(
    Array.from({ length: limit }, async (_, i) => {
      const id = await read("nft", "tokenOfOwnerByIndex", [owner, BigInt(i)]);
      const [uri, rent] = await Promise.all([
        read("nft", "tokenURI", [id]),
        read("nft", "claimableRent", [id]),
      ]);
      return { id, metadata: decode(uri), rent };
    }),
  );
  if (owner !== account) return;
  $("cats").replaceChildren();
  $("inventory-message").textContent = count
    ? `${count} ${count === 1 ? "cat" : "cats"} in this wallet · ${amount(reward)} BCAT per burn in the current epoch.`
    : "This wallet does not own a cat yet.";
  $("more").hidden = count <= limit;
  for (const { id, metadata, rent } of cards) {
    const card = document.createElement("article");
    card.className = "cat";
    const image = document.createElement("img");
    image.src = metadata.image;
    image.alt = metadata.name;
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = metadata.name;
    const label = document.createElement("p");
    label.textContent =
      metadata.attributes.find((a) => a.trait_type === "Rarity Tier").value +
      " · " +
      amount(rent) +
      " ETH accumulated · redeem on burn";
    const actions = document.createElement("div");
    actions.className = "actions";
    const burn = document.createElement("button");
    burn.className = "danger";
    burn.textContent = "Burn for ETH + BCAT";
    burn.disabled = !launched || busy;
    burn.onclick = async () => {
      try {
        const current = await read("nft", "burnReward");
        if (
          confirm(
            `Permanently destroy CyberToshi #${id}? Current reward: ${amount(current)} BCAT plus unclaimed ETH. The reward can change at the next epoch. This cannot be undone.`,
          )
        )
          await send("nft", "burn", [id]);
      } catch (e) {
        fail(e);
      }
    };
    actions.append(burn);
    body.append(title, label, actions);
    card.append(image, body);
    $("cats").append(card);
  }
}
async function send(kind, fn, args = [], value) {
  if (busy) throw Error("A transaction is already pending.");
  if (!ready || !account) throw Error("Connect a wallet first.");
  if ((await wallet.getChainId()) !== chain.id)
    throw Error(`Switch your wallet to ${chain.name}.`);
  busy = true;
  stop();
  buttons();
  $("bootstrap").disabled =
    $("checkpoint").disabled =
    $("collect-fees").disabled =
    $("buyback").disabled =
      true;
  try {
    if (kind === 'nft' && fn === 'mine') {
      const [last, minted, block] = await Promise.all([read('nft','lastMintAt'), read('nft','totalMinted'), client.getBlock()]);
      if (minted > 0n && block.timestamp < last + 60n)
        throw Error(`Global mint cooldown: wait approximately ${last + 60n - block.timestamp} seconds. No transaction sent. Mine a fresh proof if the challenge changes.`);
    }
    say("Checking transaction…");
    const { request } = await client.simulateContract({
      address: cfg[kind === "nft" ? "collection" : kind],
      abi: abis[kind],
      functionName: fn,
      args,
      value,
      account,
    });
    say(chain.id === 31337 ? "Submitting a transaction with the local test wallet." : "Approve the transaction in your wallet.");
    const hash = await wallet.writeContract(request);
    say("Transaction submitted. Waiting for confirmation: " + hash);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw Error("Transaction reverted.");
    say("Confirmed: " + hash);
    return receipt;
  } finally {
    busy = false;
    await refresh();
    await inventory();
    buttons();
  }
}
async function connect() {
  if (chain.id === 31337 && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    // Only the loopback sandbox exposes unlocked test accounts. Never used on public chains.
    provider = { request: ({method, params=[]}) => client.request({method: method === "eth_requestAccounts" ? "eth_accounts" : method, params}) };
  } else if (!window.ethereum)
    throw Error(
      "No browser wallet found. Open this page in a wallet browser or install a wallet extension.",
    );
  else provider = window.ethereum;
  wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.requestAddresses();
  account = accounts[0];
  if ((await wallet.getChainId()) !== chain.id) {
    try {
      await wallet.switchChain({ id: chain.id });
    } catch (e) {
      if (e.code === 4902 || e.cause?.code === 4902) {
        await wallet.addChain({ chain });
        await wallet.switchChain({ id: chain.id });
      } else throw e;
    }
  }
  $("connect").textContent = account.slice(0, 6) + "…" + account.slice(-4);
  say(
    ready
      ? "Wallet connected. Ready to mine."
      : "Wallet connected. A contract deployment is still required.",
  );
  buttons();
  await refresh();
  await inventory();
  if (!provider._cybertoshiBound) {
    provider.on?.("accountsChanged", () => location.reload());
    provider.on?.("chainChanged", () => {
      stop();
      location.reload();
    });
    provider._cybertoshiBound = true;
  }
}
async function checkJob() {
  if (!job || checking) return;
  const captured = job;
  checking = true;
  try {
    const [previous, height, target] = await Promise.all([
      read("nft", "prevWork"),
      client.getBlockNumber({ cacheTime: 0 }),
      read("nft", "effectiveTarget"),
    ]);
    if (job !== captured) return;
    if (previous !== job.previous || height - BigInt(job.anchorBlock) > 110n || (workers.length > 0 && target !== BigInt(job.target))) {
      const active = workers.length > 0;
      stop();
      say(
        "Work changed. " +
          (active
            ? "Restarting with the latest challenge."
            : "Start mining again for a fresh proof."),
      );
      if (active) await start();
    }
  } catch (e) {
    stop();
    fail(e);
  } finally {
    checking = false;
  }
}
async function start() {
  if (starting || workers.length) return;
  if (!ready || !account || busy)
    throw Error("Connect a wallet on the configured network first.");
  stop();
  starting = true;
  const attempt = generation;
  buttons();
  try {
  if ((await wallet.getChainId()) !== chain.id)
    throw Error("Wrong wallet network.");
  const block = await client.getBlock();
  const anchor = await client.getBlock({ blockNumber: block.number - 1n });
  const [previous, target, minted, price] = await Promise.all([
    read("nft", "prevWork", [], { blockNumber: block.number }),
    read("nft", "effectiveTarget", [], { blockNumber: block.number }),
    read("nft", "totalMinted", [], { blockNumber: block.number }),
    read("nft", "mintPrice", [], { blockNumber: block.number }),
  ]);
  if (attempt !== generation) return;
  if (minted >= 16384n) throw Error("The collection is fully mined.");
  job = {
    chainId: chain.id,
    collection: cfg.collection,
    account,
    previous,
    target: target.toString(),
    anchorHash: anchor.hash,
    anchorBlock: anchor.number.toString(),
    price: price.toString(),
  };
  const captured = job;
  const reports = {};
  const gpu = $("engine").value === 'gpu';
  const fallback = () => {
    if (job !== captured) return;
    stop();
    $("engine").value = 'cpu';
    $("engine-note").textContent = 'GPU unavailable or failed verification. Switched to CPU.';
    start().catch(fail);
  };
  const watchGpu = () => {
    clearTimeout(gpuWatchdog);
    gpuWatchdog = setTimeout(fallback, 20000);
  };
  if (gpu) watchGpu();
  const n = gpu ? 1 : Math.min(
    Number($("threads").value),
    navigator.hardwareConcurrency || 2,
  );
  const t = performance.now();
  $("hashes").textContent = "0";
  say(gpu ? "Checking GPU correctness before mining…" : "Mining with your CPU. Keep this page visible.");
  for (let i = 0; i < n; i++) {
    const worker = gpu
      ? new Worker(new URL("./gpu.worker.js", import.meta.url), { type: "module" })
      : new Worker(new URL("./miner.worker.js", import.meta.url), { type: "module" });
    workers.push(worker);
    worker.onerror = (e) => {
      if (gpu) { e.preventDefault(); fallback(); return; }
      stop();
      fail(Error(e.message));
    };
    worker.onmessage = ({ data }) => {
      if (job !== captured) return;
      if (gpu) watchGpu();
      if (data.fallback) {
        fallback();
        return;
      }
      if (data.ready) { say('GPU verified. Mining with WebGPU.'); return; }
      reports[i] = data.count;
      const total = Object.values(reports).reduce((a, b) => a + b, 0);
      $("hashes").textContent = total.toLocaleString("en-US");
      $("rate").textContent =
        Math.round((total * 1000) / (performance.now() - t)).toLocaleString("en-US") +
        " H/s";
      if (data.found) {
        const verified = hashNonce(makeInput(captured), BigInt(data.nonce));
        if (verified !== data.hash || BigInt(verified) >= BigInt(captured.target)) {
          stop(); fail(Error('Invalid proof rejected. Please restart mining.')); return;
        }
        solution = {
          nonce: BigInt(data.nonce),
          anchor: BigInt(captured.anchorBlock),
          previous: captured.previous,
          price: BigInt(captured.price),
        };
        stop(false);
        $("submit").hidden = false;
        $("submit").textContent = `Mint this cat · ${amount(solution.price)} ETH + gas`;
        buttons();
        say("Valid proof found. Mint it before the challenge changes.");
      }
    };
    worker.postMessage({ ...job, offset: i, stride: n });
  }
  monitor = setInterval(checkJob, 4000);
  } finally {
  if (attempt === generation) starting = false;
  buttons();
  }
}
$("engine").onchange = () => {
  $("engine-note").textContent = $("engine").value === 'gpu'
    ? 'Experimental WebGPU. Verified against CPU; falls back automatically. Speed depends on your device.'
    : 'CPU works in modern browsers. More workers use more power.';
  buttons();
};
$("connect").onclick = () => connect().catch(fail);
$("mine").onclick = () => start().catch(fail);
$("stop").onclick = () => {
  stop();
  say("Mining stopped.");
};
$("submit").onclick = () => {
  const found = solution;
  if (found)
    send(
      "nft",
      "mine",
      [found.nonce, found.anchor, found.previous],
      found.price,
    ).catch(fail);
};
$("bootstrap").onclick = () =>
  send("vault", "bootstrapCommunityLiquidity").catch(fail);
$("checkpoint").onclick = () => send("vault", "checkpoint").catch(fail);
$("collect-fees").onclick = () => send("vault", "collectPoolFees").catch(fail);
$("buyback").onclick = () => send("vault", "executeBuyback").catch(fail);
$("refresh").onclick = () => Promise.all([refresh(), inventory()]).catch(fail);
$("more").onclick = () => {
  pageSize += 12;
  inventory().catch(fail);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden && (workers.length || starting)) {
    stop();
    say("Mining paused while this tab is hidden.");
  }
});
window.addEventListener("beforeunload", () => stop());
async function init() {
  cfg = await fetch(new URL("./deployment.json", document.baseURI), { cache: "no-store" }).then((r) =>
    r.json(),
  );
  chain =
    cfg.chainId === 8453
      ? base
      : cfg.chainId === 84532
        ? baseSepolia
        : cfg.chainId === 31337
          ? defineChain({
              id: 31337,
              name: "Local test chain",
              nativeCurrency: {
                name: "Test Ether",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
            })
          : null;
  if (!chain) throw Error("Unsupported deployment network.");
  if (chain.id === 31337 && (!['localhost','127.0.0.1'].includes(location.hostname) || !['localhost','127.0.0.1'].includes(new URL(cfg.rpcUrl || 'http://127.0.0.1:8545').hostname))) throw Error('Local test mode only works on this computer.');
  client = createPublicClient({
    chain,
    transport: http(cfg.rpcUrl || chain.rpcUrls.default.http[0]),
  });
  $("network").textContent = chain.name + (cfg.testDex ? " · TEST DEX" : "");
  if (chain.id === 31337) $("connect").textContent = 'Use local test wallet';
  if (!cfg.collection) {
    $("network").textContent = 'Base · PRE-LAUNCH';
    $("connect").disabled = true;
    $("connect").textContent = 'Coming soon';
    $("mint-price").textContent = '0.001';
    $("inventory-message").textContent = 'Public preview. No mint is open yet.';
    say(
      "Preview only: contracts have not been deployed. Mining and transactions unlock after deployment.",
    );
    return;
  }
  for (const key of ["collection", "vault", "token", "renderer"]) {
    if (!isAddress(cfg[key]) || !(await client.getCode({ address: cfg[key] })))
      throw Error("Missing or invalid deployed " + key);
  }
  const [t, v, r] = await Promise.all([
    read("nft", "bcatToken"),
    read("nft", "buybackRouter"),
    read("nft", "renderer"),
  ]);
  if (
    t.toLowerCase() !== cfg.token.toLowerCase() ||
    v.toLowerCase() !== cfg.vault.toLowerCase() ||
    r.toLowerCase() !== cfg.renderer.toLowerCase()
  )
    throw Error("Deployment addresses do not match the collection.");
  ready = true;
  $("contracts").replaceChildren();
  for (const key of ["collection", "vault", "token", "renderer"]) {
    const row = document.createElement("div");
    row.textContent = key + ": ";
    const link = document.createElement("a");
    link.textContent = cfg[key];
    if (chain.blockExplorers) {
      link.href = chain.blockExplorers.default.url + "/address/" + cfg[key];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    row.append(link);
    $("contracts").append(row);
  }
  say(
    cfg.testDex
      ? "Test environment: this DEX is a simulator. Test tokens have no monetary value."
      : "Live contracts loaded. Connect a wallet to mine.",
  );
  await refresh();
}
init().catch(fail);

