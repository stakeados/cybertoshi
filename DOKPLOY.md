# cybertoshi.lol — Dokploy

This repository publishes a PRE-LAUNCH website. No Base mainnet contracts are configured. Mining and transactions remain disabled. Do not put wallet keys or OpenSea API credentials in Dokploy variables or frontend files.

1. Create an Application in Dokploy and connect GitHub repository `stakeados/cybertoshi`, branch `main`.
2. Select Dockerfile build. Dockerfile path: `Dockerfile`; build context: repository root `.`.
3. Deploy. The container listens on port **80**. Health endpoint: `/healthz`. No volumes or environment variables are required for this preview.
4. In your DNS provider create an **A** record for `@` pointing to your Dokploy server public IPv4. Remove conflicting records for this hostname. Only add an AAAA record if the server has working IPv6.
5. In Dokploy Domains add `cybertoshi.lol`, path `/`, container port `80`, enable HTTPS / Let's Encrypt. Ensure the server accepts inbound 80 and 443. DNS must resolve before certificate issuance succeeds.
6. Optional: add `www` as CNAME to `cybertoshi.lol`, and add `www.cybertoshi.lol` separately in Dokploy if you want it served.
7. Open https://cybertoshi.lol/ and confirm the PRE-LAUNCH message, example art, and disabled wallet/mining controls. Check https://cybertoshi.lol/healthz returns `ok`.

The domain and website can go live now as a preview. Contract launch is a separate operation: confirm difficulty and burn rewards, complete wallet testing/review, deploy and verify contracts in Base, then update `frontend/public/deployment.json`, rebuild and redeploy. Run `npm run release:check` for the mainnet checklist; it intentionally fails before those tasks are complete.

The static output remains compatible with IPFS. Dokploy hosting alone is not IPFS hosting. GitHub auto-deploy, if enabled, publishes subsequent pushes to main; review changes before pushing. To roll back the web use the previous deployment/commit in Dokploy. This cannot roll back blockchain transactions.

Build locally: `npm ci` then `npm run build`. Docker check where Docker is installed: `docker build -t cybertoshi .` then `docker run --rm -p 8080:80 cybertoshi`.
