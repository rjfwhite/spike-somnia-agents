import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Buffer size for circular request storage
const BUFFER_SIZE = 20;

// Deployed contract addresses on Somnia
const AGENT_REGISTRY_ADDRESS = "0x0B4A083E482eFBE8537eE2265A62AB2E84Ac8DFa";
const COMMITTEE_ADDRESS = "0xA338F4Fb70Cf2245fb31D8651799D6b3e23F81cB";

export default buildModule("SomniaAgentsModule", (m) => {
  const somniaAgents = m.contract("contracts/SomniaAgents.sol:SomniaAgents", [
    BUFFER_SIZE,
    AGENT_REGISTRY_ADDRESS,
    COMMITTEE_ADDRESS,
  ]);

  return { somniaAgents };
});
