// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * SolarToken (SLR)
 * - Each household mints tokens = energy produced.
 * - Mint more when sunny (factor > 1x), less when cloudy.
 * - Burn when energy is consumed; price rises as supply drops.
 */
contract SolarToken is ERC20 {
    uint256 public tokenPrice; // internal “price” tracker (1e18 = 1.0)
    uint256 public baseMint = 100 ether;
    uint256 public lastCloudPct;

    event EnergyMinted(address indexed user, uint256 minted, uint256 factorBps, uint256 clouds, uint256 newPrice);
    event EnergyUsed(address indexed user, uint256 burned, uint256 newPrice);

    constructor(uint256 initialPrice) ERC20("SolarToken", "SLR") {
        tokenPrice = initialPrice;
    }

    function mintEnergy(uint256 weatherFactorBps, uint256 clouds) external {
        require(weatherFactorBps > 0, "factor>0");
        require(clouds <= 100, "clouds<=100");

        uint256 amt = (baseMint * weatherFactorBps) / 10000;
        _mint(msg.sender, amt);

        uint256 newPrice = (tokenPrice * 10000) / weatherFactorBps;
        tokenPrice = newPrice;
        lastCloudPct = clouds;

        emit EnergyMinted(msg.sender, amt, weatherFactorBps, clouds, newPrice);
    }

    function useEnergy(uint256 amount) external {
        require(balanceOf(msg.sender) >= amount, "insufficient");
        uint256 supplyBefore = totalSupply();
        _burn(msg.sender, amount);
        uint256 pct = (amount * 10000) / supplyBefore;
        uint256 newPrice = (tokenPrice * (10000 + pct / 2)) / 10000; // 0.5% bump per 1% burned
        tokenPrice = newPrice;
        emit EnergyUsed(msg.sender, amount, newPrice);
    }
}
