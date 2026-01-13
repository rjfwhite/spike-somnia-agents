export interface DocPage {
  id: string;
  title: string;
  slug: string;
  file: string;
  description: string;
  category: 'getting-started' | 'guides' | 'reference';
}

export const docPages: DocPage[] = [
  {
    id: '00-overview',
    title: 'Overview',
    slug: 'overview',
    file: '00-overview.md',
    description: 'Introduction to Somnia Agents Platform',
    category: 'getting-started'
  },
  {
    id: '01-core-agents',
    title: 'Core Agents',
    slug: 'core-agents',
    file: '01-core-agents.md',
    description: 'Catalog of available core agents',
    category: 'getting-started'
  },
  {
    id: '02-agent-specification',
    title: 'Agent Specification',
    slug: 'agent-specification',
    file: '02-agent-specification.md',
    description: 'Defining agent interfaces with ABI types',
    category: 'getting-started'
  },
  {
    id: '03-building-agents',
    title: 'Building Agents',
    slug: 'building-agents',
    file: '03-building-agents.md',
    description: 'Complete guide to creating and deploying agents',
    category: 'guides'
  },
  {
    id: '04-container-requirements',
    title: 'Container Requirements',
    slug: 'container-requirements',
    file: '04-container-requirements.md',
    description: 'Technical requirements for agent containers',
    category: 'guides'
  },
  {
    id: '05-running-agents',
    title: 'Running Agents',
    slug: 'running-agents',
    file: '05-running-agents.md',
    description: 'Setting up and operating an agent host',
    category: 'guides'
  },
  {
    id: '06-abi-encoding',
    title: 'ABI Encoding',
    slug: 'abi-encoding',
    file: '06-abi-encoding.md',
    description: 'Understanding ABI encoding and decoding',
    category: 'reference'
  },
  {
    id: '07-examples',
    title: 'Examples',
    slug: 'examples',
    file: '07-examples.md',
    description: 'Complete agent implementation examples',
    category: 'guides'
  },
  {
    id: '08-api-reference',
    title: 'API Reference',
    slug: 'api-reference',
    file: '08-api-reference.md',
    description: 'Smart contract API documentation',
    category: 'reference'
  }
];

export const categories = {
  'getting-started': {
    title: 'Getting Started',
    description: 'Learn the basics of Somnia Agents'
  },
  'guides': {
    title: 'Guides',
    description: 'Step-by-step guides for building and deploying'
  },
  'reference': {
    title: 'Reference',
    description: 'Technical reference and API documentation'
  }
};

export function getDocBySlug(slug: string): DocPage | undefined {
  return docPages.find(doc => doc.slug === slug);
}

export function getDocsByCategory(category: string): DocPage[] {
  return docPages.filter(doc => doc.category === category);
}
