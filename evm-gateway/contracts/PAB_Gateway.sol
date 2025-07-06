// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

struct Agent {
    // Delegator
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

contract PAB_Gateway {
    // The gateway will be an oapp to: share the agent and user data, lock and release token for evm bridges
    using SafeERC20 for IERC20;

    address payable public owner;
    address public xrpContract;
    mapping(address => Agent) public agents;
    mapping(address => AtomicBridge) public atomicBridge; // user address => atomic bridge details
    uint256 TIMEOUT_BLOCKS = 20; // Number of blocks after which a user can force receive

    // Supported chains management
    uint256[] public supportedChains;

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
    event ChainAdded(uint256 indexed chainId);
    event ChainRemoved(uint256 indexed chainId);

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

    constructor(address _xrpContract) {
        owner = payable(msg.sender);
        xrpContract = _xrpContract;

        // Initialize with default supported chains
        supportedChains.push(0); // XRPL
        supportedChains.push(56); // BSC
        supportedChains.push(8453); // Base
    }

    function withdraw() public {
        if (msg.sender == owner) {
            uint256 balance = IERC20(xrpContract).balanceOf(address(this));
            require(
                IERC20(xrpContract).transfer(owner, balance),
                "Owner withdrawal failed"
            );
            emit Withdrawal(msg.sender, balance);
        } else if (agents[msg.sender].depositAmount > 0) {
            uint256 refund = agents[msg.sender].depositAmount;
            agents[msg.sender].depositAmount = 0;
            require(
                IERC20(xrpContract).transfer(msg.sender, refund),
                "Agent withdrawal failed"
            );
            emit Withdrawal(msg.sender, refund);
        }
    }

    /**
     * @param agentXrplAddress The XRPL address of the agent.
     * @param amount The amount of XRP tokens to deposit as collateral.
     * @notice Allows agents to register with the contract by providing their XRPL address and a token deposit.
     */
    function register(bytes32 agentXrplAddress, uint256 amount) public {
        require(amount > 0, "Deposit required");
        require(
            IERC20(xrpContract).transferFrom(msg.sender, address(this), amount),
            "Token deposit failed"
        );

        agents[msg.sender] = Agent({
            xrplAddress: agentXrplAddress,
            depositAmount: amount,
            lastDepositBlock: block.number
        });
        emit DepositAgent(msg.sender, amount);
    }

    /**
     * @param amount The amount of XRP tokens to deposit.
     * @notice Allows agents to deposit additional funds to the contract.
     */
    function deposit(uint256 amount) public {
        require(amount > 0, "Deposit required");
        require(agents[msg.sender].depositAmount != 0, "Agent not registered");
        require(
            IERC20(xrpContract).transferFrom(msg.sender, address(this), amount),
            "Token deposit failed"
        );

        agents[msg.sender].depositAmount += amount;
        agents[msg.sender].lastDepositBlock = block.number;
        emit DepositAgent(msg.sender, amount);
    }

    function bridgeTokens(uint256 amount, uint256 destinationChain) public {
        require(
            atomicBridge[msg.sender].amount == 0 ||
                atomicBridge[msg.sender].xrplTxHash != 0,
            "Previous atomic bridge not completed"
        );

        require(
            isChainSupported(destinationChain),
            "Destination chain not supported"
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
                IERC20(xrpContract).transfer(
                    msg.sender,
                    atomicBridge[msg.sender].amount
                ),
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

    // ===== SUPPORTED CHAINS MANAGEMENT =====

    /**
     * @dev Add a new supported chain
     * @param chainId The chain ID to add
     */
    function addSupportedChain(uint256 chainId) public onlyOwner {
        require(!isChainSupported(chainId), "Chain already supported");
        supportedChains.push(chainId);
        emit ChainAdded(chainId);
    }

    /**
     * @dev Remove a supported chain
     * @param chainId The chain ID to remove
     */
    function removeSupportedChain(uint256 chainId) public onlyOwner {
        require(isChainSupported(chainId), "Chain not supported");
        require(chainId != 0, "Cannot remove XRPL chain");

        // Find and remove the chain ID
        for (uint256 i = 0; i < supportedChains.length; i++) {
            if (supportedChains[i] == chainId) {
                supportedChains[i] = supportedChains[
                    supportedChains.length - 1
                ];
                supportedChains.pop();
                break;
            }
        }

        emit ChainRemoved(chainId);
    }

    /**
     * @dev Check if a chain is supported
     * @param chainId The chain ID to check
     * @return bool indicating if the chain is supported
     */
    function isChainSupported(uint256 chainId) public view returns (bool) {
        for (uint256 i = 0; i < supportedChains.length; i++) {
            if (supportedChains[i] == chainId) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Get all supported chains
     * @return Array of supported chain IDs
     */
    function getSupportedChains() public view returns (uint256[] memory) {
        return supportedChains;
    }

    /**
     * @dev Get the number of supported chains
     * @return Number of supported chains
     */
    function getSupportedChainsCount() public view returns (uint256) {
        return supportedChains.length;
    }
}
