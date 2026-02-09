import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Buffer size for circular request storage
const BUFFER_SIZE = 2000;
const STARTING_REQUEST_ID = 0;

// Deployed contract addresses on Somnia
const AGENT_REGISTRY_ADDRESS = "0x81A80E8A7923566F4c0120fE7e93aF12A0e180C3";
const COMMITTEE_ADDRESS = "0xA4D2E22EFA337423147C993E2F348Da68F921119";

export default buildModule("SomniaAgentsModule", (m) => {
  const somniaAgents = m.contract("contracts/SomniaAgents.sol:SomniaAgents", [
    BUFFER_SIZE,
    AGENT_REGISTRY_ADDRESS,
    COMMITTEE_ADDRESS,
    STARTING_REQUEST_ID,
  ]);

  return { somniaAgents };
});
