require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    baseSepolia: {
      url: process.env.ALCHEMY_URL_BASE_SEPOLIA,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
  },
};
