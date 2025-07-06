// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const WXRP_BSC = "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe";
const CBXRP_BASE = "0xcb585250f852C6c6bf90434AB21A00f02833a4af";
const WXRP_MOCK = "";

const PABModule = buildModule("PABModule", (m) => {
  const xrpContractAddress = m.getParameter("xrpContract", WXRP_MOCK);

  const lock = m.contract("PAB_Gateway", [xrpContractAddress]);

  return { lock };
});

export default PABModule;
