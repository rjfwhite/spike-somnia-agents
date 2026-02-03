import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CommitteeModule", (m) => {
  const committee = m.contract("Committee");

  return { committee };
});
