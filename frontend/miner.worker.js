import { makeInput, hashNonce } from "./pow.js";
self.onmessage = ({ data: job }) => {
  const input = makeInput(job);
  let nonce = BigInt(job.offset),
    count = 0;
  const stride = BigInt(job.stride),
    target = BigInt(job.target),
    start = performance.now();
  function batch() {
    for (let i = 0; i < 512; i++) {
      const hash = hashNonce(input, nonce);
      count++;
      if (BigInt(hash) < target) {
        self.postMessage({
          found: true,
          nonce: nonce.toString(),
          hash,
          count,
          elapsed: performance.now() - start,
        });
        return;
      }
      nonce += stride;
    }
    self.postMessage({ count, elapsed: performance.now() - start });
    setTimeout(batch, 0);
  }
  batch();
};
