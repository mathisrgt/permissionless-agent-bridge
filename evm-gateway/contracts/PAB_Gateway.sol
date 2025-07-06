// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
} // To be imported from openzep

struct Agent { // Delegator
    bytes32 xrplAddress;
    uint256 depositAmount;
    uint256 lastDepositBlock;
}

struct AtomicBridge {
    uint256 amount;
    uint256 destinationChain; // 0 for XRPL, 56 for BSC, 8453 for Base
    uint256 claimedBlock; // After 20 blocks, the user can forceReceive
    address agentAddress;
    bytes32 xrplTxHash; // Hash of the XRPL transaction - used for confirmation
    bool requestedForceReceive; // Indicates if the user has requested a force receive
    bool forceReceived; // Indicates if the user has requested a force receive
}

contract PAB_Gateway { // is OApp - use layerzero for evm bridge with a lock and release process
    address payable public owner;
    address public xrpContract;
    mapping(address => Agent) public agents;
    mapping(address => AtomicBridge) public atomicBridge; // user address => atomic bridge details
    uint256 TIMEOUT_BLOCKS = 20; // Number of blocks after which a user can force receive

    event DepositAgent(address indexed agentAddress, uint256 depositAmount);
    event Withdrawal(address indexed from, uint256 amount);
    event BridgeRequested(
        address indexed user,
        uint256 amount,
        uint256 destinationChain
    );
    event BridgeClaimed(
        address indexed agent,
        address indexed user,
        uint256 amount,
        uint256 destinationChain
    );
    event BridgeConfirmed(
        address indexed agent,
        bytes32 indexed xrplTxHash,
        address indexed user,
        uint256 amount,
        uint256 destinationChain
    );
    event ForcedReceiveInitiated(
        address indexed user,
        uint256 amount,
        uint256 destinationChain,
        address indexed agent
    );
    event ForcedReceiveApproved(
        address indexed user,
        uint256 amount,
        uint256 destinationChain,
        address indexed agent
    );
    event FallbackReceived(address indexed sender, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyActiveAgent() {
        require(
            agents[msg.sender].depositAmount > 100,
            "Invalid agent or insufficient deposit"
        );

        _;
    }

    constructor(address _xrpContract) payable {
        owner = payable(msg.sender);
        xrpContract = _xrpContract;
    }

    function withdraw() public {
        if (msg.sender == owner) {
            uint256 amount = address(this).balance;
            owner.transfer(amount);
            emit Withdrawal(msg.sender, amount);
        } else if (agents[msg.sender].depositAmount > 0) {
            uint256 refund = agents[msg.sender].depositAmount;
            agents[msg.sender].depositAmount = 0;
            payable(msg.sender).transfer(refund);
            emit Withdrawal(msg.sender, refund);
        }
    }

    /**
     * @param agentXrplAddress The XRPL address of the agent.
     * @notice Allows agents to register with the contract by providing their XRPL address and a deposit.
     */
    function register(bytes32 agentXrplAddress) public payable {
        require(msg.value > 0, "Deposit required");
        agents[msg.sender] = Agent({
            xrplAddress: agentXrplAddress,
            depositAmount: msg.value,
            lastDepositBlock: block.number
        });
        emit DepositAgent(msg.sender, msg.value);
    }

    /**
     * @notice Allows agents to deposit funds to the contract.
     */
    function deposit() public payable {
        require(msg.value > 0, "Deposit required");
        require(agents[msg.sender].depositAmount != 0, "Agent not registered");

        agents[msg.sender].depositAmount += msg.value;
        agents[msg.sender].lastDepositBlock = block.number;
        emit DepositAgent(msg.sender, msg.value);
    }

    function bridgeTokens(uint256 amount, uint256 destinationChain) public {
        require(
            atomicBridge[msg.sender].amount == 0 ||
                atomicBridge[msg.sender].xrplTxHash != 0,
            "Previous atomic bridge not completed"
        );

        require(
            IERC20(xrpContract).transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );

        atomicBridge[msg.sender] = AtomicBridge({
            amount: amount,
            destinationChain: destinationChain,
            claimedBlock: 0,
            agentAddress: address(0),
            xrplTxHash: 0,
            requestedForceReceive: false,
            forceReceived: false
        });

        emit BridgeRequested(msg.sender, amount, destinationChain);
    }

    function claimBridge(address user) public onlyActiveAgent {
        atomicBridge[user].agentAddress = msg.sender;
        atomicBridge[user].claimedBlock = block.number;

        require(
            IERC20(xrpContract).transfer(msg.sender, atomicBridge[user].amount),
            "Token payout failed"
        );

        emit BridgeClaimed(
            msg.sender,
            user,
            atomicBridge[user].amount,
            atomicBridge[user].destinationChain
        );
    }

    function confirmBridge(
        address user,
        bytes32 xrplTxHash
    ) public onlyActiveAgent {
        require(
            atomicBridge[user].agentAddress == msg.sender,
            "Not authorized agent"
        );
        require(atomicBridge[user].xrplTxHash == 0, "Already confirmed");
        atomicBridge[user].xrplTxHash = xrplTxHash;
        emit BridgeConfirmed(
            msg.sender,
            xrplTxHash,
            user,
            atomicBridge[user].amount,
            atomicBridge[user].destinationChain
        );
    }

    function forceReceive() public {
        require(
            atomicBridge[msg.sender].amount != 0,
            "No atomic bridge request"
        );
        require(
            atomicBridge[msg.sender].agentAddress != address(0),
            "Agent not set"
        );
        require(
            block.number >= atomicBridge[msg.sender].claimedBlock + 20,
            "Cannot force receive yet"
        );
        require(
            atomicBridge[msg.sender].requestedForceReceive,
            "Already requested force receive"
        );

        atomicBridge[msg.sender].requestedForceReceive = true;

        if (
            block.number >=
            atomicBridge[msg.sender].claimedBlock + TIMEOUT_BLOCKS
        ) {
            atomicBridge[msg.sender].forceReceived = true;

            require(
                IERC20(xrpContract).transfer(msg.sender, atomicBridge[msg.sender].amount),
                "Token refund failed"
            );

            emit ForcedReceiveApproved(
                msg.sender,
                atomicBridge[msg.sender].amount,
                atomicBridge[msg.sender].destinationChain,
                atomicBridge[msg.sender].agentAddress
            );
        } else {
            emit ForcedReceiveInitiated(
                msg.sender,
                atomicBridge[msg.sender].amount,
                atomicBridge[msg.sender].destinationChain,
                atomicBridge[msg.sender].agentAddress
            );
        }
    }

    function approveForcedReceive(address user) public onlyOwner {
        require(atomicBridge[user].amount != 0, "No atomic bridge request");
        require(atomicBridge[user].agentAddress != address(0), "Agent not set");
        require(
            atomicBridge[user].requestedForceReceive,
            "No force receive request"
        );
        require(!atomicBridge[user].forceReceived, "Already force received");

        atomicBridge[user].forceReceived = true;

        require(
            IERC20(xrpContract).transfer(user, atomicBridge[user].amount),
            "Token refund failed"
        );

        emit ForcedReceiveApproved(
            user,
            atomicBridge[user].amount,
            atomicBridge[user].destinationChain,
            atomicBridge[user].agentAddress
        );
    }
}
