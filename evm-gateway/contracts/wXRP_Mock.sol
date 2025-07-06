// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title WXRP - Wrapped XRP Token
 * @dev Simple ERC20 token representing wrapped XRP
 */
contract WXRP is ERC20 {
    uint8 private _decimals;

    /**
     * @dev Constructor that creates the token with specified parameters
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Number of decimals (XRP uses 6 decimals)
     * @param initialSupply_ Initial supply of tokens
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply_ * 10 ** decimals_);
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
