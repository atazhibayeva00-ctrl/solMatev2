const hre = require("hardhat");

async function main() {
  const M = await hre.ethers.getContractFactory("SolMateMarket");
  const m = await M.deploy();
  await m.waitForDeployment();
  console.log("SolMateMarket deployed:", await m.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
