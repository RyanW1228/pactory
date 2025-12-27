// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/mockMNEE.sol";

contract MintMockMNEE is Script {
    function run() external {
        // 🔑 address that deployed MockMNEE (same one you used earlier)
        address mockMneeAddress = 0x249E2dCF1C601B3fE319A2E7A5465A41c03C3eaF;

        // 👛 your wallet (the one in MetaMask)
        //address recipient = msg.sender;
        address recipient = 0x0964E6d624D92133Fe95238cd3a91f46f5461064;

        vm.startBroadcast();
        MockMNEE(mockMneeAddress).mint(recipient, 1_000e18);
        vm.stopBroadcast();
    }
}
