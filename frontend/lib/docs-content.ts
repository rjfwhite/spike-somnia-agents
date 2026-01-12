import overview from '../docs/00-overview.md';
import agentSpecification from '../docs/01-agent-specification.md';
import buildingAgents from '../docs/02-building-agents.md';
import containerRequirements from '../docs/03-container-requirements.md';
import runningAgents from '../docs/04-running-agents.md';
import abiEncoding from '../docs/05-abi-encoding.md';
import examples from '../docs/06-examples.md';
import apiReference from '../docs/07-api-reference.md';

export const docsContent: Record<string, string> = {
  '00-overview.md': overview,
  '01-agent-specification.md': agentSpecification,
  '02-building-agents.md': buildingAgents,
  '03-container-requirements.md': containerRequirements,
  '04-running-agents.md': runningAgents,
  '05-abi-encoding.md': abiEncoding,
  '06-examples.md': examples,
  '07-api-reference.md': apiReference,
};

export function getDocContent(filename: string): string {
  return docsContent[filename] || '';
}
