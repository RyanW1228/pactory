// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract Pact {
    IERC20 public mnee;
    address public sponsor;
    uint256 public maxPayout;
    uint256 public earned;
    bool public refunded;

    constructor(address _mnee, address _sponsor, uint256 _maxPayout) {
        mnee = IERC20(_mnee);
        sponsor = _sponsor;
        maxPayout = _maxPayout;
    }

    function setEarned(uint256 _earned) external {
        earned = _earned;
    }

    function refund() external {
        require(!refunded, "already refunded");
        uint256 refundAmount = maxPayout - earned;
        refunded = true;
        mnee.transfer(sponsor, refundAmount);
    }
}
