export interface DocPage {
  id: string;
  title: string;
  slug: string;
  file: string;
  description: string;
}

export const docPages: DocPage[] = [
  {
    id: '00-overview',
    title: 'Overview',
    slug: 'overview',
    file: '00-overview.md',
    description: 'Introduction to Somnia Agents'
  },
  {
    id: '01-core-agents',
    title: 'Core Agents',
    slug: 'core-agents',
    file: '01-core-agents.md',
    description: 'Catalog of available core agents'
  },
  {
    id: '02-agent-specification',
    title: 'Agent Definition',
    slug: 'agent-specification',
    file: '02-agent-specification.md',
    description: 'Metadata JSON and ABI format'
  },
  {
    id: '03-container-requirements',
    title: 'Container Requirements',
    slug: 'container-requirements',
    file: '03-container-requirements.md',
    description: 'Technical requirements for agent containers'
  },
  {
    id: '04-abi-encoding',
    title: 'ABI Encoding',
    slug: 'abi-encoding',
    file: '04-abi-encoding.md',
    description: 'Understanding ABI encoding and decoding'
  },
  {
    id: '05-examples',
    title: 'Examples',
    slug: 'examples',
    file: '05-examples.md',
    description: 'Complete implementation examples'
  }
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return docPages.find(doc => doc.slug === slug);
}
