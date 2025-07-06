import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@nomicfoundation/hardhat-ethers";
import "hardhat-deploy";
import { formatUnits } from "ethers";

task("deploywxrp", "Deploy WXRP (Wrapped XRP) token contract")
    .addOptionalParam("name", "Token name", "Wrapped XRP")
    .addOptionalParam("symbol", "Token symbol", "WXRP")
    .addOptionalParam("decimals", "Token decimals", "6")
    .addOptionalParam("initialSupply", "Initial supply (without decimals)", "1000000000")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const { ethers } = hre;
        const [deployer] = await ethers.getSigners();

        console.log("Deploying WXRP contract...");
        console.log("Deployer address:", deployer.address);
        console.log("Token name:", taskArgs.name);
        console.log("Token symbol:", taskArgs.symbol);
        console.log("Token decimals:", taskArgs.decimals);
        console.log("Initial supply:", taskArgs.initialSupply);

        const WXRP = await ethers.getContractFactory("WXRP");
        const wxrp = await WXRP.deploy(
            taskArgs.name,
            taskArgs.symbol,
            parseInt(taskArgs.decimals),
            taskArgs.initialSupply
        );

        await wxrp.waitForDeployment();
        const address = await wxrp.getAddress();

        console.log(`✅ WXRP token deployed to: ${address}`);

        // Get token info
        const tokenInfo = await wxrp.getTokenInfo();
        console.log(`Token Name: ${tokenInfo.name}`);
        console.log(`Token Symbol: ${tokenInfo.symbol}`);
        console.log(`Token Decimals: ${tokenInfo.decimals_}`);
        console.log(`Total Supply: ${formatUnits(tokenInfo.totalSupply_, tokenInfo.decimals_)} ${tokenInfo.symbol}`);

        // Verify contract if not on localhost
        if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
            console.log("Waiting for block confirmations...");
            await wxrp.deploymentTransaction()?.wait(6);

            try {
                await hre.run("verify:verify", {
                    address: address,
                    constructorArguments: [
                        taskArgs.name,
                        taskArgs.symbol,
                        parseInt(taskArgs.decimals),
                        taskArgs.initialSupply
                    ],
                });
                console.log("✅ Contract verified on block explorer");
            } catch (error) {
                console.log("❌ Verification failed:", error);
            }
        }

        return address;
    });

task("deployGateway", "Deploy PAB_Gateway contract")
    .addParam("xrpContract", "Address of the XRP token contract")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const { ethers } = hre;

        console.log("Deploying PAB_Gateway contract...");

        const PAB_Gateway = await ethers.getContractFactory("PAB_Gateway");
        const gateway = await PAB_Gateway.deploy(taskArgs.xrpContract);

        await gateway.waitForDeployment();
        const address = await gateway.getAddress();

        console.log(`✅ PAB_Gateway deployed to: ${address}`);
        console.log(`XRP Contract used: ${taskArgs.xrpContract}`);

        // Verify contract if not on localhost
        if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
            console.log("Waiting for block confirmations...");
            await gateway.deploymentTransaction()?.wait(6);

            try {
                await hre.run("verify:verify", {
                    address: address,
                    constructorArguments: [taskArgs.xrpContract],
                });
            } catch (error) {
                console.log("Verification failed:", error);
            }
        }

        return address;
    });

// Agent registration
task("registerAgent", "Register as an agent")
    .addParam("gateway", "Gateway contract address")
    .addParam("xrplAddress", "XRPL address as hex string (32 bytes)")
    .addParam("amount", "Amount to deposit (in wei)")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Registering agent with XRPL address: ${taskArgs.xrplAddress}`);
        console.log(`Deposit amount: ${formatEther(taskArgs.amount)} tokens`);

        const tx = await gateway.register(taskArgs.xrplAddress, taskArgs.amount);
        await tx.wait();

        console.log(`Agent registered! Transaction hash: ${tx.hash}`);

        // Check agent details
        const agentInfo = await gateway.agents(signer.address);
        console.log(`Agent deposit: ${formatEther(agentInfo.depositAmount)} tokens`);
    });

// Agent deposit
task("deposit-agent", "Deposit additional funds as an agent")
    .addParam("gateway", "Gateway contract address")
    .addParam("amount", "Amount to deposit (in wei)")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Depositing ${formatEther(taskArgs.amount)} tokens...`);

        const tx = await gateway.deposit(taskArgs.amount);
        await tx.wait();

        console.log(`Deposit successful! Transaction hash: ${tx.hash}`);

        // Check updated agent details
        const agentInfo = await gateway.agents(signer.address);
        console.log(`Total agent deposit: ${formatEther(agentInfo.depositAmount)} tokens`);
    });

// Bridge tokens
task("bridge-tokens", "Bridge tokens to another chain")
    .addParam("gateway", "Gateway contract address")
    .addParam("amount", "Amount to bridge (in wei)")
    .addParam("destination", "Destination chain ID")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Bridging ${formatEther(taskArgs.amount)} tokens to chain ${taskArgs.destination}...`);

        const tx = await gateway.bridgeTokens(taskArgs.amount, taskArgs.destination);
        await tx.wait();

        console.log(`Bridge request submitted! Transaction hash: ${tx.hash}`);

        // Check bridge details
        const bridgeInfo = await gateway.atomicBridge(signer.address);
        console.log(`Bridge amount: ${formatEther(bridgeInfo.amount)} tokens`);
        console.log(`Destination chain: ${bridgeInfo.destinationChain}`);
    });

// Claim bridge (for agents)
task("claim-bridge", "Claim a bridge request as an agent")
    .addParam("gateway", "Gateway contract address")
    .addParam("user", "User address who requested the bridge")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Claiming bridge for user: ${taskArgs.user}`);

        const tx = await gateway.claimBridge(taskArgs.user);
        await tx.wait();

        console.log(`Bridge claimed! Transaction hash: ${tx.hash}`);

        // Check updated bridge details
        const bridgeInfo = await gateway.atomicBridge(taskArgs.user);
        console.log(`Claimed at block: ${bridgeInfo.claimedBlock}`);
    });

// Confirm bridge (for agents)
task("confirm-bridge", "Confirm a bridge with XRPL transaction hash")
    .addParam("gateway", "Gateway contract address")
    .addParam("user", "User address")
    .addParam("txHash", "XRPL transaction hash as hex string")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Confirming bridge for user: ${taskArgs.user}`);
        console.log(`XRPL tx hash: ${taskArgs.txHash}`);

        const tx = await gateway.confirmBridge(taskArgs.user, taskArgs.txHash);
        await tx.wait();

        console.log(`Bridge confirmed! Transaction hash: ${tx.hash}`);
    });

// Force receive
task("force-receive", "Request force receive of bridged tokens")
    .addParam("gateway", "Gateway contract address")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Requesting force receive...`);

        const tx = await gateway.forceReceive();
        await tx.wait();

        console.log(`Force receive requested! Transaction hash: ${tx.hash}`);

        // Check bridge status
        const bridgeInfo = await gateway.atomicBridge(signer.address);
        console.log(`Force receive requested: ${bridgeInfo.requestedForceReceive}`);
        console.log(`Force received: ${bridgeInfo.forceReceived}`);
    });

// Approve forced receive (owner only)
task("approve-force-receive", "Approve a force receive request")
    .addParam("gateway", "Gateway contract address")
    .addParam("user", "User address")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Approving force receive for user: ${taskArgs.user}`);

        const tx = await gateway.approveForcedReceive(taskArgs.user);
        await tx.wait();

        console.log(`Force receive approved! Transaction hash: ${tx.hash}`);
    });

// Withdraw funds
task("withdraw", "Withdraw funds (owner or agent)")
    .addParam("gateway", "Gateway contract address")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Withdrawing funds for: ${signer.address}`);

        const tx = await gateway.withdraw();
        await tx.wait();

        console.log(`Withdrawal successful! Transaction hash: ${tx.hash}`);
    });

// Add supported chain (owner only)
task("add-chain", "Add a supported chain")
    .addParam("gateway", "Gateway contract address")
    .addParam("chainId", "Chain ID to add")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Adding chain ID: ${taskArgs.chainId}`);

        const tx = await gateway.addSupportedChain(taskArgs.chainId);
        await tx.wait();

        console.log(`Chain added! Transaction hash: ${tx.hash}`);
    });

// Remove supported chain (owner only)
task("remove-chain", "Remove a supported chain")
    .addParam("gateway", "Gateway contract address")
    .addParam("chainId", "Chain ID to remove")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        console.log(`Removing chain ID: ${taskArgs.chainId}`);

        const tx = await gateway.removeSupportedChain(taskArgs.chainId);
        await tx.wait();

        console.log(`Chain removed! Transaction hash: ${tx.hash}`);
    });

// View functions
task("get-agent-info", "Get agent information")
    .addParam("gateway", "Gateway contract address")
    .addParam("agent", "Agent address")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        const agentInfo = await gateway.agents(taskArgs.agent);

        console.log(`Agent Information for ${taskArgs.agent}:`);
        console.log(`XRPL Address: ${agentInfo.xrplAddress}`);
        console.log(`Deposit Amount: ${formatEther(agentInfo.depositAmount)} tokens`);
        console.log(`Last Deposit Block: ${agentInfo.lastDepositBlock}`);
    });

task("get-bridge-info", "Get bridge information")
    .addParam("gateway", "Gateway contract address")
    .addParam("user", "User address")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        const bridgeInfo = await gateway.atomicBridge(taskArgs.user);

        console.log(`Bridge Information for ${taskArgs.user}:`);
        console.log(`Amount: ${formatEther(bridgeInfo.amount)} tokens`);
        console.log(`Destination Chain: ${bridgeInfo.destinationChain}`);
        console.log(`Claimed Block: ${bridgeInfo.claimedBlock}`);
        console.log(`Agent Address: ${bridgeInfo.agentAddress}`);
        console.log(`XRPL Tx Hash: ${bridgeInfo.xrplTxHash}`);
        console.log(`Requested Force Receive: ${bridgeInfo.requestedForceReceive}`);
        console.log(`Force Received: ${bridgeInfo.forceReceived}`);
    });

task("get-supported-chains", "Get all supported chains")
    .addParam("gateway", "Gateway contract address")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        const chains = await gateway.getSupportedChains();

        console.log(`Supported Chains:`);
        chains.forEach((chainId: number, index: number) => {
            const chainName = getChainName(Number(chainId));
            console.log(`${index + 1}. Chain ID: ${chainId} (${chainName})`);
        });
    });

task("check-chain-support", "Check if a chain is supported")
    .addParam("gateway", "Gateway contract address")
    .addParam("chainId", "Chain ID to check")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);


        const isSupported = await gateway.isChainSupported(taskArgs.chainId);
        const chainName = getChainName(Number(taskArgs.chainId));

        console.log(`Chain ID ${taskArgs.chainId} (${chainName}) is ${isSupported ? 'supported' : 'not supported'}`);
    });

// Utility function to get chain names
function getChainName(chainId: number): string {
    const chainNames: { [key: number]: string } = {
        0: "XRPL",
        1: "Ethereum",
        56: "BSC",
        137: "Polygon",
        8453: "Base",
        42161: "Arbitrum",
        10: "Optimism"
    };

    return chainNames[chainId] || "Unknown";
}

// Helper function to format ether
function formatEther(value: bigint | string): string {
    const bigIntValue = typeof value === 'string' ? BigInt(value) : value;
    return (Number(bigIntValue) / 1e18).toString();
}

// Helper task to convert string to bytes32
task("string-to-bytes32", "Convert string to bytes32")
    .addParam("input", "String to convert")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const bytes32 = encodeBytes32String(taskArgs.input);
        console.log(`String: "${taskArgs.input}"`);
        console.log(`Bytes32: ${bytes32}`);

        return bytes32;
    });

// Helper task to convert bytes32 to string
task("bytes32-to-string", "Convert bytes32 to string")
    .addParam("input", "Bytes32 to convert")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const string = decodeBytes32String(taskArgs.input);
        console.log(`Bytes32: ${taskArgs.input}`);
        console.log(`String: "${string}"`);

        return string;
    });

// Helper functions for bytes32 conversion
function encodeBytes32String(text: string): string {
    if (text.length > 31) {
        throw new Error("String too long for bytes32");
    }

    const bytes = Buffer.from(text, 'utf8');
    const hex = '0x' + bytes.toString('hex').padEnd(64, '0');
    return hex;
}

function decodeBytes32String(hex: string): string {
    const bytes = Buffer.from(hex.slice(2), 'hex');
    return bytes.toString('utf8').replace(/\0+$/, '');
}

// Task to approve XRP tokens for the gateway
task("approve-xrp", "Approve XRP tokens for gateway contract")
    .addParam("xrpContract", "XRP token contract address")
    .addParam("gateway", "Gateway contract address")
    .addParam("amount", "Amount to approve (in wei)")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const xrpToken = await hre.ethers.getContractAt("IERC20", taskArgs.xrpContract);

        console.log(`Approving ${formatEther(taskArgs.amount)} XRP tokens for gateway...`);

        const tx = await xrpToken.approve(taskArgs.gateway, taskArgs.amount);
        await tx.wait();

        console.log(`Approval successful! Transaction hash: ${tx.hash}`);

        // Check allowance
        const allowance = await xrpToken.allowance(signer.address, taskArgs.gateway);
        console.log(`Current allowance: ${formatEther(allowance)} XRP tokens`);
    });

// Task to check XRP token balance
task("check-xrp-balance", "Check XRP token balance")
    .addParam("xrpContract", "XRP token contract address")
    .addOptionalParam("account", "Account address (defaults to first signer)")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();
        const account = taskArgs.account || signer.address;

        const xrpToken = await hre.ethers.getContractAt("IERC20", taskArgs.xrpContract);

        const balance = await xrpToken.balanceOf(account);
        console.log(`XRP balance for ${account}: ${formatEther(balance)} tokens`);

        return balance;
    });

// Task to check XRP token allowance
task("check-xrp-allowance", "Check XRP token allowance")
    .addParam("xrpContract", "XRP token contract address")
    .addParam("spender", "Spender address (gateway contract)")
    .addOptionalParam("owner", "Owner address (defaults to first signer)")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();
        const owner = taskArgs.owner || signer.address;

        const xrpToken = await hre.ethers.getContractAt("IERC20", taskArgs.xrpContract);

        const allowance = await xrpToken.allowance(owner, taskArgs.spender);
        console.log(`XRP allowance from ${owner} to ${taskArgs.spender}: ${formatEther(allowance)} tokens`);

        return allowance;
    });

// Task to get current block number
task("current-block", "Get current block number")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const blockNumber = await hre.ethers.provider.getBlockNumber();
        console.log(`Current block number: ${blockNumber}`);

        return blockNumber;
    });

// Task to estimate gas for bridge operation
task("estimate-bridge-gas", "Estimate gas for bridge operation")
    .addParam("gateway", "Gateway contract address")
    .addParam("amount", "Amount to bridge (in wei)")
    .addParam("destination", "Destination chain ID")
    .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
        const [signer] = await hre.ethers.getSigners();

        const deployment = await hre.deployments.get('PAB_Gateway');
        const gateway = await hre.ethers.getContractAt('PAB_Gateway', deployment.address, signer);

        try {
            const gasEstimate = await gateway.bridgeTokens.estimateGas(
                taskArgs.amount,
                taskArgs.destination
            );

            console.log(`Estimated gas for bridge operation: ${gasEstimate.toString()}`);

            const gasPrice = await hre.ethers.provider.getFeeData();
            const estimatedCost = gasEstimate * (gasPrice.gasPrice || 0n);

            console.log(`Estimated transaction cost: ${formatEther(estimatedCost)} ETH`);

            return gasEstimate;
        } catch (error) {
            console.log(`Gas estimation failed: ${error}`);
            throw error;
        }
    });

export { };