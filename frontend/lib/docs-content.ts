import overview from '../docs/00-overview.md';
import coreAgents from '../docs/01-core-agents.md';
import agentSpecification from '../docs/02-agent-specification.md';
import buildingAgents from '../docs/03-building-agents.md';
import containerRequirements from '../docs/04-container-requirements.md';
import runningAgents from '../docs/05-running-agents.md';
import abiEncoding from '../docs/06-abi-encoding.md';
import examples from '../docs/07-examples.md';
import apiReference from '../docs/08-api-reference.md';

export const docsContent: Record<string, string> = {
  '00-overview.md': overview,
  '01-core-agents.md': coreAgents,
  '02-agent-specification.md': agentSpecification,
  '03-building-agents.md': buildingAgents,
  '04-container-requirements.md': containerRequirements,
  '05-running-agents.md': runningAgents,
  '06-abi-encoding.md': abiEncoding,
  '07-examples.md': examples,
  '08-api-reference.md': apiReference,
};

export function getDocContent(filename: string): string {
  return docsContent[filename] || '';
}
