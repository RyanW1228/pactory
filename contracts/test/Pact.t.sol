// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Pact.sol";
import "../src/MockMNEE.sol";

contract PactTest is Test {
    MockMNEE mnee;
    Pact pact;

    address sponsor = address(0xA);
    address escrow = address(this);

    function setUp() public {
        mnee = new MockMNEE();

        // Mint 100 MNEE to escrow
        mnee.mint(escrow, 100 ether);

        // Deploy pact
        pact = new Pact(address(mnee), sponsor, 100 ether);

        // Fund pact escrow
        mnee.transfer(address(pact), 100 ether);
    }

    function testRefundReturnsUnearnedFunds() public {
        // Creator earned 40
        pact.setEarned(40 ether);

        uint256 sponsorBefore = mnee.balanceOf(sponsor);

        pact.refund();

        uint256 sponsorAfter = mnee.balanceOf(sponsor);

        assertEq(sponsorAfter - sponsorBefore, 60 ether);
        assertTrue(pact.refunded());
    }

    function testCannotRefundTwice() public {
        pact.setEarned(20 ether);
        pact.refund();

        vm.expectRevert("already refunded");
        pact.refund();
    }
}
