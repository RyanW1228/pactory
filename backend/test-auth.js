import { ethers } from "ethers";

const API = "http://localhost:3001";

async function main() {
  // Local random wallet (for testing only)
  const wallet = ethers.Wallet.createRandom();
  const address = wallet.address;

  // 1) Get nonce
  const nonceRes = await fetch(`${API}/auth/nonce?address=${address}`);
  const nonceData = await nonceRes.json();

  const message = `Pactory login\nNonce: ${nonceData.nonce}`;

  // 2) Sign message
  const signature = await wallet.signMessage(message);

  // 3) Verify
  const verifyRes = await fetch(`${API}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });

  const verifyText = await verifyRes.text();

  console.log("Status:", verifyRes.status);
  console.log("Set-Cookie:", verifyRes.headers.get("set-cookie"));
  console.log("Body:", verifyText);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
