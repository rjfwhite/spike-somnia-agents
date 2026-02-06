import hre from "hardhat";
import { encodeDeployData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, http } from "viem";

const BUFFER_SIZE = 20n;
const AGENT_REGISTRY_ADDRESS = "0x0B4A083E482eFBE8537eE2265A62AB2E84Ac8DFa";
const COMMITTEE_ADDRESS = "0xA338F4Fb70Cf2245fb31D8651799D6b3e23F81cB";

async function main() {
  console.log("Deploying SomniaAgents contract...");
  console.log(`  Buffer size: ${BUFFER_SIZE}`);
  console.log(`  Agent Registry: ${AGENT_REGISTRY_ADDRESS}`);
  console.log(`  Committee: ${COMMITTEE_ADDRESS}`);

  const artifact = await hre.artifacts.readArtifact("contracts/SomniaAgents.sol:SomniaAgents");

  const account = privateKeyToAccount(`0x${process.env.PRIVATE_KEY!}`);
  const chain = { id: 50312, name: "Somnia", nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: ["https://dream-rpc.somnia.network/"] } } };

  const walletClient = createWalletClient({ account, chain, transport: http("https://dream-rpc.somnia.network/") });
  const publicClient = createPublicClient({ chain, transport: http("https://dream-rpc.somnia.network/") });

  console.log(`Deploying from: ${account.address}`);

  const deployData = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [BUFFER_SIZE, AGENT_REGISTRY_ADDRESS, COMMITTEE_ADDRESS],
  });

  const hash = await walletClient.sendTransaction({ data: deployData, chain });

  console.log(`Transaction hash: ${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`\nSomniaAgents deployed to: ${receipt.contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
