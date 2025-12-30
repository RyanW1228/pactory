// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PactEscrow.sol";

contract DeployPactEscrow is Script {
    function run() external {
        // ✅ Use your real deployed MockMNEE address
        address mnee = 0x5D74F51bD1b03E8F7742538647cf7ce369c91582;

        // ✅ Backend/verifier PUBLIC address (NOT private key)
        // Must match the "Verifier address:" printed by your server
        address verifier = vm.envAddress("VERIFIER_ADDRESS");

        vm.startBroadcast();
        PactEscrow escrow = new PactEscrow(mnee, verifier);
        vm.stopBroadcast();

        console2.log("PactEscrow deployed at:", address(escrow));
        console2.log("Verifier:", verifier);
        console2.log("MNEE:", mnee);
    }
}
