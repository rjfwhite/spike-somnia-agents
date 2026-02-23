import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Buffer size for circular request storage
const BUFFER_SIZE = 2000;
const STARTING_REQUEST_ID = 0;

// Deployed contract addresses on Somnia Devnet
const AGENT_REGISTRY_ADDRESS = "0x9f00f0b42df3BB78524AAc644FD53c44e3a36f62";
const COMMITTEE_ADDRESS = "0xC3760dBC467FA7B1B3e9f2540CA289F22641d2C0";

export default buildModule("SomniaAgentsDevnetModule", (m) => {
  const somniaAgents = m.contract("contracts/SomniaAgents.sol:SomniaAgents", [
    BUFFER_SIZE,
    AGENT_REGISTRY_ADDRESS,
    COMMITTEE_ADDRESS,
    STARTING_REQUEST_ID,
  ]);

  return { somniaAgents };
});
