import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AgentRegistryModule", (m) => {
  const agentRegistry = m.contract("AgentRegistry");

  return { agentRegistry };
});
