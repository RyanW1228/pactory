// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PactEscrow.sol";

contract DeployPactEscrow is Script {
    function run() external {
        // address of MNEE token ON TESTNET
        address mnee = 0x249E2dCF1C601B3fE319A2E7A5465A41c03C3eaF;

        vm.startBroadcast();
        PactEscrow escrow = new PactEscrow(mnee);
        vm.stopBroadcast();

        console2.log("PactEscrow deployed at:", address(escrow));
    }
}
