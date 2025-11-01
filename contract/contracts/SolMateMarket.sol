// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * SolMate Market (MVP)
 * - Seller creates an offer: total kWh, basePriceWeiPerKWh
 * - Buyer buys some kWh; client passes weatherFactorBps (basis points, e.g. 8000 = 0.80x)
 * - Payable equals: basePriceWeiPerKWh * kWh * weatherFactorBps / 10000
 * - Remaining kWh decreases; funds transfer to seller; weather snapshot is logged in event
 *
 * NOTE: Weather factor is provided by the client for hackathon demo (no oracle needed).
 *       We emit the weather info so it’s auditable from UI/logs.
 */
contract SolMateMarket {
    struct Offer {
        address seller;
        uint256 basePriceWeiPerKWh;
        uint256 availableKWh; // integer kWh for simplicity
        bool active;
    }

    uint256 public nextOfferId;
    mapping(uint256 => Offer) public offers;

    event OfferCreated(uint256 indexed offerId, address indexed seller, uint256 basePriceWeiPerKWh, uint256 availableKWh);
    event OfferUpdated(uint256 indexed offerId, uint256 newBasePriceWeiPerKWh, uint256 newAvailableKWh, bool active);
    event EnergyPurchased(
        uint256 indexed offerId,
        address indexed buyer,
        uint256 kWh,
        uint256 pricePaidWei,
        uint256 weatherFactorBps,
        string weatherDesc,
        int256 latE6,
        int256 lonE6,
        uint256 cloudPercent
    );

    modifier onlySeller(uint256 offerId) {
        require(msg.sender == offers[offerId].seller, "not seller");
        _;
    }

    function createOffer(uint256 basePriceWeiPerKWh, uint256 totalKWh) external returns (uint256 offerId) {
        require(basePriceWeiPerKWh > 0, "price>0");
        require(totalKWh > 0, "kWh>0");
        offerId = nextOfferId++;
        offers[offerId] = Offer({
            seller: msg.sender,
            basePriceWeiPerKWh: basePriceWeiPerKWh,
            availableKWh: totalKWh,
            active: true
        });
        emit OfferCreated(offerId, msg.sender, basePriceWeiPerKWh, totalKWh);
    }

    function setOfferStatus(uint256 offerId, bool active) external onlySeller(offerId) {
        offers[offerId].active = active;
        emit OfferUpdated(offerId, offers[offerId].basePriceWeiPerKWh, offers[offerId].availableKWh, active);
    }

    function updateOffer(uint256 offerId, uint256 newBasePriceWeiPerKWh, uint256 newAvailableKWh) external onlySeller(offerId) {
        require(newBasePriceWeiPerKWh > 0, "price>0");
        require(newAvailableKWh > 0, "kWh>0");
        offers[offerId].basePriceWeiPerKWh = newBasePriceWeiPerKWh;
        offers[offerId].availableKWh = newAvailableKWh;
        emit OfferUpdated(offerId, newBasePriceWeiPerKWh, newAvailableKWh, offers[offerId].active);
    }

    /**
     * @param offerId the offer to buy from
     * @param kWh integer kWh to buy
     * @param weatherFactorBps e.g. 10000=1.00, 8500=0.85 based on clouds etc (computed client-side)
     * @param weatherDesc short text, e.g. "few clouds"
     * @param latE6 latitude * 1e6 (for log)
     * @param lonE6 longitude * 1e6 (for log)
     * @param cloudPercent 0..100 (for log)
     */
    function buyEnergy(
        uint256 offerId,
        uint256 kWh,
        uint256 weatherFactorBps,
        string calldata weatherDesc,
        int256 latE6,
        int256 lonE6,
        uint256 cloudPercent
    ) external payable {
        Offer storage ofr = offers[offerId];
        require(ofr.active, "inactive");
        require(kWh > 0 && kWh <= ofr.availableKWh, "invalid kWh");
        require(weatherFactorBps > 0, "bad factor");

        uint256 baseCost = ofr.basePriceWeiPerKWh * kWh;
        uint256 finalCost = (baseCost * weatherFactorBps) / 10000;
        require(msg.value == finalCost, "wrong value");

        ofr.availableKWh -= kWh;

        (bool ok, ) = ofr.seller.call{value: msg.value}("");
        require(ok, "pay failed");

        emit EnergyPurchased(
            offerId,
            msg.sender,
            kWh,
            msg.value,
            weatherFactorBps,
            weatherDesc,
            latE6,
            lonE6,
            cloudPercent
        );
    }
}
