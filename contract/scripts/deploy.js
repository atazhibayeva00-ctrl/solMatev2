const hre = require("hardhat");

async function main() {
  const initPrice = hre.ethers.parseEther("1");
  const Token = await hre.ethers.getContractFactory("SolarToken");
  const token = await Token.deploy(initPrice);
  await token.waitForDeployment();
  console.log("✅ SolarToken deployed to:", await token.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
