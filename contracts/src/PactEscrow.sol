// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

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
    }

    function complete(uint256 pactId, uint256 payout) external {
        Pact storage pact = pacts[pactId];

        require(msg.sender == pact.sponsor, "not sponsor");
        require(pact.status == Status.Funded, "wrong status");
        require(payout <= pact.maxPayout, "exceeds max");

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
