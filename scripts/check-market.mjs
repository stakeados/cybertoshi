import assert from 'node:assert/strict';
import {poolMetrics,tradeUrl} from '../frontend/market.js';
const token='0xbc384D49529AEb3B20B270586457F9Ba57e514e3';
const weth='0x4200000000000000000000000000000000000006';
const expected=poolMetrics(token,weth,token,weth,[1000000n*10n**18n,2n*10n**16n]);
assert.equal(expected.price,0.00000002);
assert.equal(expected.eth,2n*10n**16n);
assert.deepEqual(poolMetrics(token,weth,weth,token,[2n*10n**16n,1000000n*10n**18n]),expected);
assert.equal(poolMetrics(token,weth,token,weth,[0n,1n]).price,null);
assert.equal(poolMetrics(token,weth,token,weth,[1n,0n]).price,null);
assert.throws(()=>poolMetrics(token,weth,weth,weth,[1n,1n]),/Unexpected pool assets/);
for(const sell of [false,true]){
  const u=new URL(tradeUrl(token,weth,sell));
  assert.equal(u.origin,'https://aerodrome.finance');
  assert.equal(u.searchParams.get('from'),sell?token:weth);
  assert.equal(u.searchParams.get('to'),sell?weth:token);
  assert.equal(u.searchParams.get('chain0'),'8453');
  assert.equal(u.searchParams.get('chain1'),'8453');
}
console.log('PASS: reserve ordering, small ETH price precision, empty/mismatched pools, buy/sell token and network URLs.');
