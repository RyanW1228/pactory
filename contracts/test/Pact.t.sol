// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.20;

// import "forge-std/Test.sol";
// import "../src/PactEscrow.sol";
// import "../src/mockMNEE.sol";

// contract PactEscrowTest is Test {
//     MockMNEE mnee;
//     PactEscrow escrow;

//     address sponsor = address(0xA11CE);
//     address creator = address(0xB0B);

//     function setUp() public {
//         mnee = new MockMNEE();
//         escrow = new PactEscrow(address(mnee));

//         // Give sponsor some MNEE!!!!! yayayyayay
//         mnee.mint(sponsor, 1_000e18);
//     }

//     function testFundAndCompletePartial() public {
//         // sponsor creates da pact
//         vm.startPrank(sponsor);
//         uint256 pactId = escrow.createPact(creator, 100e18, 7 days);

//         // approve escrow to pull the funds
//         mnee.approve(address(escrow), 100e18);

//         // fund it!
//         escrow.fund(pactId, 100e18);

//         // complete with partial payout...
//         escrow.complete(pactId, 40e18);
//         vm.stopPrank();

//         // check balances
//         assertEq(mnee.balanceOf(creator), 40e18, "creator payout wrong");
//         assertEq(mnee.balanceOf(sponsor), 1_000e18 - 100e18 + 60e18, "sponsor remainder wrong");

//         // status check
//         (, , , , PactEscrow.Status status, ) = escrow.pacts(pactId);
//         assertEq(uint256(status), uint256(PactEscrow.Status.Completed), "status not completed");
//     }

//     function testRefundAfterDeadline() public {
//         vm.startPrank(sponsor);
//         uint256 pactId = escrow.createPact(creator, 50e18, 1 days);

//         mnee.approve(address(escrow), 50e18);
//         escrow.fund(pactId, 50e18);
//         vm.stopPrank();

//         // warp beyond deadline
//         vm.warp(block.timestamp + 2 days);

//         // refund
//         escrow.refund(pactId);

//         assertEq(mnee.balanceOf(sponsor), 1_000e18, "sponsor should be fully refunded");
//         (, , , , PactEscrow.Status status, ) = escrow.pacts(pactId);
//         assertEq(uint256(status), uint256(PactEscrow.Status.Refunded), "status not refunded");
//     }

//     function testCannotRefundEarly() public {
//         vm.startPrank(sponsor);
//         uint256 pactId = escrow.createPact(creator, 10e18, 3 days);
//         mnee.approve(address(escrow), 10e18);
//         escrow.fund(pactId, 10e18);
//         vm.stopPrank();

//         vm.expectRevert("not expired");
//         escrow.refund(pactId);
//     }

//     function testCannotFundTwice() public {
//         vm.startPrank(sponsor);
//         uint256 pactId = escrow.createPact(creator, 10e18, 3 days);
//         mnee.approve(address(escrow), 10e18);
//         escrow.fund(pactId, 10e18);

//         vm.expectRevert("wrong status");
//         escrow.fund(pactId, 1e18);
//         vm.stopPrank();
//     }

//     function testCreatorCannotFund() public {
//         vm.startPrank(creator);
//     }
// }
