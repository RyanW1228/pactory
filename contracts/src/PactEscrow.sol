// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract PactEscrow {
    IERC20 public immutable mnee;

    constructor(address _mnee) {
        mnee = IERC20(_mnee);
    }

    enum Status {
        Created,
        Funded,
        Completed,
        Refunded
    }

    struct Pact {
        address sponsor;
        address creator;
        uint256 maxPayout;
        uint256 deadline;
        Status status;
        uint256 fundedAmount;
    }

    uint256 public pactCount;
    mapping(uint256 => Pact) public pacts;

    // events 
    event PactCreated(uint256 indexed pactId, address indexed sponsor, address indexed creator);
    event PactFunded(uint256 indexed pactId, uint256 amount);
    event PactCompleted(uint256 indexed pactId, uint256 payout);
    event PactRefunded(uint256 indexed pactId);

    // side note i love how vs code is completing my code rn

    function createPact(
        address creator,
        uint256 maxPayout,
        uint256 durationSeconds
    ) external returns (uint256 pactId) {
        require(creator != address(0), "invalid creator");
        require(maxPayout > 0, "invalid payout");

        pactId = ++pactCount;

        pacts[pactId] = Pact({
            sponsor: msg.sender,
            creator: creator,
            maxPayout: maxPayout,
            deadline: block.timestamp + durationSeconds,
            status: Status.Created,
            fundedAmount: 0
        });
        
        emit PactCreated(pactId, msg.sender, creator);
    }


    function fund(uint256 pactId, uint256 amount) external {
        Pact storage pact = pacts[pactId];

        require(msg.sender == pact.sponsor, "not sponsor");
        require(pact.status == Status.Created, "wrong status");
        require(
            pact.fundedAmount + amount <= pact.maxPayout,
            "exceeds max"
        );

        pact.fundedAmount += amount;

        if (pact.fundedAmount == pact.maxPayout) {
            pact.status = Status.Funded;
        }

        require(
            mnee.transferFrom(msg.sender, address(this), amount),
            "funding failed"
        );
    }


    function complete(uint256 pactId, uint256 payout) external {
        Pact storage pact = pacts[pactId];

        require(msg.sender == pact.sponsor, "not sponsor");
        require(pact.status == Status.Funded, "wrong status");
        require(payout <= pact.fundedAmount, "exceeds max");

        pact.status = Status.Completed;

        require(
            mnee.transfer(pact.creator, payout),
            "payout failed"
        );

        if (pact.maxPayout > payout) {
            mnee.transfer(pact.sponsor, pact.maxPayout - payout);
        }
    }

    function refund(uint256 pactId) external {
    Pact storage pact = pacts[pactId];

    require(block.timestamp > pact.deadline, "not expired");
    require(pact.status == Status.Funded, "wrong status");

    pact.status = Status.Refunded;

    require(
        mnee.transfer(pact.sponsor, pact.fundedAmount),
        "refund failed"
    );
}

}
