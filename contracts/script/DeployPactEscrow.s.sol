// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PactEscrow.sol";

contract DeployPactEscrow is Script {
    function run() external {
        // MNEE token (Sepolia mock)
        address mnee = 0x249E2dCF1C601B3fE319A2E7A5465A41c03C3eaF;

        // backend/verifier signer address (the public address that will sign payouts)
        address verifier = vm.envAddress("VERIFIER_ADDRESS");

        vm.startBroadcast();
        PactEscrow escrow = new PactEscrow(mnee, verifier);
        vm.stopBroadcast();

        console2.log("PactEscrow deployed at:", address(escrow));
        console2.log("Verifier:", verifier);
        console2.log("MNEE:", mnee);
    }
}
