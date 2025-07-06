import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";
import { baseRpcUrl } from "./environment/rpc";
import { baseScanApiKey, privateKey } from "./environment/key";
import "./tasks/PABTasks.ts";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    baseSepolia: {
      url: baseRpcUrl,
      accounts: [privateKey],
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: baseScanApiKey,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: `https://api.etherscan.io/v2/api?chainid=&apikey=${baseScanApiKey}`,
          browserURL: "https://sepolia.basescan.org/"
        },
      }
    ],
  },
};

export default config;
