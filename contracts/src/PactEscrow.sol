// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import "openzeppelin-contracts/contracts/utils/cryptography/MessageHashUtils.sol";

contract PactEscrow {
    using ECDSA for bytes32;

    IERC20 public immutable mnee;
    address public immutable verifier; // backend signer address

    constructor(address _mnee, address _verifier) {
        require(_mnee != address(0), "bad mnee");
        require(_verifier != address(0), "bad verifier");
        mnee = IERC20(_mnee);
        verifier = _verifier;
    }

    enum Status {
        Created,
        Funded,
        Closed
    }

    struct Pact {
        address sponsor;
        address creator;
        uint256 maxPayout;
        uint256 deadline;
        Status status;
        uint256 paidOut; // total paid to creator so far
        bool refunded; // sponsor remainder refunded
    }

    mapping(uint256 => Pact) public pacts;

    event PactCreated(
        uint256 indexed pactId,
        address indexed sponsor,
        address indexed creator,
        uint256 maxPayout,
        uint256 deadline
    );
    event PactFunded(uint256 indexed pactId, uint256 amount);
    event CreatorPaid(
        uint256 indexed pactId,
        uint256 totalEarned,
        uint256 deltaPaid
    );
    event SponsorRefunded(uint256 indexed pactId, uint256 amount);

    // ------------------------------------------------------------
    // ✅ CREATE: gated by backend signature (matches your DB flow)
    // ------------------------------------------------------------
    // Backend signs over: (chainid, this, sponsor, pactId, creator, maxPayout, durationSeconds, expiry)
    function createPactWithSig(
        address sponsor,
        uint256 pactId,
        address creator,
        uint256 maxPayout,
        uint256 durationSeconds,
        uint256 expiry,
        bytes calldata sig
    ) external {
        require(block.timestamp <= expiry, "sig expired");
        require(sponsor != address(0), "bad sponsor");
        require(pactId > 0, "invalid pact id");
        require(creator != address(0), "invalid creator");
        require(maxPayout > 0, "invalid max payout");
        require(durationSeconds > 0, "invalid duration");

        // Make sure caller is sponsor (prevents someone else creating a pact for you)
        require(msg.sender == sponsor, "caller not sponsor");

        // prevent overwrite
        require(pacts[pactId].sponsor == address(0), "pact exists");

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    address(this),
                    sponsor,
                    pactId,
                    creator,
                    maxPayout,
                    durationSeconds,
                    expiry
                )
            )
        );

        require(digest.recover(sig) == verifier, "bad sig");

        uint256 deadline = block.timestamp + durationSeconds;

        pacts[pactId] = Pact({
            sponsor: sponsor,
            creator: creator,
            maxPayout: maxPayout,
            deadline: deadline,
            status: Status.Created,
            paidOut: 0,
            refunded: false
        });

        emit PactCreated(pactId, sponsor, creator, maxPayout, deadline);
    }

    // ------------------------------------------------------------
    // ✅ FUND: pulls pact.maxPayout (no amount param)
    // ------------------------------------------------------------
    function fund(uint256 pactId) external {
        Pact storage pact = pacts[pactId];

        require(pact.sponsor != address(0), "pact missing");
        require(msg.sender == pact.sponsor, "not sponsor");
        require(pact.status == Status.Created, "wrong status");
        require(block.timestamp <= pact.deadline, "expired");

        // transfer first, then change status (prevents weird "Funded" state if transfer fails)
        require(
            mnee.transferFrom(msg.sender, address(this), pact.maxPayout),
            "fund failed"
        );

        pact.status = Status.Funded;

        emit PactFunded(pactId, pact.maxPayout);
    }

    // ------------------------------------------------------------
    // ✅ PAYOUT: backend-authorized incremental payouts
    // ------------------------------------------------------------
    function payoutWithSig(
        uint256 pactId,
        uint256 totalEarned,
        uint256 expiry,
        bytes calldata sig
    ) external {
        Pact storage pact = pacts[pactId];
        require(pact.status == Status.Funded, "not funded");
        require(block.timestamp <= expiry, "sig expired");
        require(totalEarned <= pact.maxPayout, "earned > max");
        require(totalEarned >= pact.paidOut, "non-monotonic");

        // verify backend signature over (chainid, this, pactId, totalEarned, expiry)
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    block.chainid,
                    address(this),
                    pactId,
                    totalEarned,
                    expiry
                )
            )
        );

        require(digest.recover(sig) == verifier, "bad sig");

        uint256 delta = totalEarned - pact.paidOut;
        pact.paidOut = totalEarned;

        if (delta > 0) {
            require(mnee.transfer(pact.creator, delta), "pay failed");
        }

        emit CreatorPaid(pactId, totalEarned, delta);
    }

    // ------------------------------------------------------------
    // ✅ REFUND: after deadline, refund remaining to sponsor
    // ------------------------------------------------------------
    function refundAfterDeadline(uint256 pactId) external {
        Pact storage pact = pacts[pactId];
        require(pact.status == Status.Funded, "not funded");
        require(block.timestamp > pact.deadline, "not expired");
        require(!pact.refunded, "already refunded");

        uint256 remaining = pact.maxPayout - pact.paidOut;
        pact.refunded = true;
        pact.status = Status.Closed;

        if (remaining > 0) {
            require(mnee.transfer(pact.sponsor, remaining), "refund failed");
        }

        emit SponsorRefunded(pactId, remaining);
    }
}
