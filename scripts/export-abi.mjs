import { readFileSync, writeFileSync } from "node:fs";
const names = {
  nft: "CyberToshiNFT",
  vault: "ToshiBuybackRouter",
  token: "BasedCatToken",
  renderer: "CyberToshiRenderer",
};
const abis = Object.fromEntries(
  Object.entries(names).map(([key, name]) => [
    key,
    JSON.parse(readFileSync(`out/${name}.sol/${name}.json`)).abi,
  ]),
);
writeFileSync("frontend/abis.json", JSON.stringify(abis));
console.log("Exported compiled contract interfaces.");
