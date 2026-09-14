import { parseAbi, formatEther } from 'viem';

export const poolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint256,uint256,uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
]);

export function poolMetrics(token, weth, token0, token1, reserves) {
  const same = (a,b) => a.toLowerCase() === b.toLowerCase();
  if (!(same(token0,token) && same(token1,weth)) && !(same(token1,token) && same(token0,weth)))
    throw Error('Unexpected pool assets');
  const [bcat, eth] = same(token0,token) ? reserves : [reserves[1],reserves[0]];
  // Both BCAT and WETH have 18 decimals. This is a marginal reserve price, not a swap quote.
  return { bcat, eth, price: bcat > 0n && eth > 0n ? Number(formatEther(eth))/Number(formatEther(bcat)) : null };
}

export async function loadMarket(client, cfg, abis) {
  const blockNumber = await client.getBlockNumber();
  const read = (kind,functionName,args=[]) => client.readContract({
    address:cfg[kind === 'nft' ? 'collection' : kind], abi:abis[kind],functionName,args,blockNumber,
  });
  const [launched,pool,weth,supply,feeBurned,totalBurned,feeEth,burnedCats] = await Promise.all([
    read('vault','bootstrapped'),read('vault','pool'),read('vault','weth'),read('token','totalSupply'),
    read('vault','totalFeeBcatBurned'),read('vault','totalBcatBurned'),read('vault','totalFeeEthCollected'),read('nft','burnedCount'),
  ]);
  const data = {blockNumber,launched,pool,weth,supply,feeBurned,totalBurned,feeEth,burnedCats};
  if (!launched) return data;
  const p = (functionName,args=[]) => client.readContract({address:pool,abi:poolAbi,functionName,args,blockNumber});
  const [token0,token1,reserves,lockedLp,totalLp] = await Promise.all([
    p('token0'),p('token1'),p('getReserves'),p('balanceOf',[cfg.vault]),p('totalSupply'),
  ]);
  return {...data,...poolMetrics(cfg.token,weth,token0,token1,reserves),lockedLp,totalLp};
}

export function tradeUrl(token,weth,sell=false) {
  const url = new URL('https://aerodrome.finance/swap');
  url.search = new URLSearchParams({from:sell?token:weth,to:sell?weth:token,chain0:'8453',chain1:'8453'}).toString();
  return url.href;
}
