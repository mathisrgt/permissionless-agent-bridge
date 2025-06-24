// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract PAB_Gateway {
    uint public unlockTime;
    address payable public owner;

    event Withdrawal(uint amount, uint when);

    constructor(uint _unlockTime) payable {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );

        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }

    function withdraw() public {
        // if owner withdraw all the funds
        // if agents, withdraw its deposit and remove him from the agent list
    }

    function register(bytes32 agentXrplAddress) public payable {
        // deposit
        // save the amount deposited and the corresponding xrpl address
    }

    function deposit() public payable {
        // only if already registered
    }

    function bridgeTokens(uint256 amount, uint256 destinationChain) public payable {
        //emit an event
    }

    function claimBridge() public {
        // verify if he is an allowed agent (deposited here, confirmed on other chains/blacklisted)
    }

    function confirmBridge(bytes32 xrplTxHash) public {
        
    }

    function forceReceive() public {
        // describe the tx in param
        // return funds if not confirmed after several blocks
        // request a contest if confirmed
    }

    function approveForcedReceive() public {
        // return the funds to the requested address after verification of several blocks
    }

    receive() external payable {
        // auto return the funds
    }

    function pause() public {}
}
