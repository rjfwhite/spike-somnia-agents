import overview from '../docs/00-overview.md';
import coreAgents from '../docs/01-core-agents.md';
import agentSpecification from '../docs/02-agent-specification.md';
import containerRequirements from '../docs/03-container-requirements.md';
import abiEncoding from '../docs/04-abi-encoding.md';
import examples from '../docs/05-examples.md';

export const docsContent: Record<string, string> = {
  '00-overview.md': overview,
  '01-core-agents.md': coreAgents,
  '02-agent-specification.md': agentSpecification,
  '03-container-requirements.md': containerRequirements,
  '04-abi-encoding.md': abiEncoding,
  '05-examples.md': examples,
};

export function getDocContent(filename: string): string {
  return docsContent[filename] || '';
}
