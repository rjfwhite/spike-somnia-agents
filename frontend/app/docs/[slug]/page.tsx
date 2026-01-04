import { notFound } from 'next/navigation';
import { promises as fs } from 'fs';
import path from 'path';
import { getDocBySlug, docPages } from '@/lib/docs-config';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Book, Clock, Tag } from 'lucide-react';

interface DocsPageProps {
  params: {
    slug: string;
  };
}

export async function generateStaticParams() {
  return docPages.map((doc) => ({
    slug: doc.slug,
  }));
}

export async function generateMetadata({ params }: DocsPageProps) {
  const doc = getDocBySlug(params.slug);

  if (!doc) {
    return {
      title: 'Not Found',
    };
  }

  return {
    title: `${doc.title} - Somnia Agents Docs`,
    description: doc.description,
  };
}

async function getDocContent(filename: string): Promise<string> {
  try {
    const docsDirectory = path.join(process.cwd(), 'docs');
    const filePath = path.join(docsDirectory, filename);
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error('Error reading doc file:', error);
    return '';
  }
}

export default async function DocPage({ params }: DocsPageProps) {
  const doc = getDocBySlug(params.slug);

  if (!doc) {
    notFound();
  }

  const content = await getDocContent(doc.file);

  if (!content) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
          <h1 className="text-xl font-bold text-red-400 mb-2">Error Loading Documentation</h1>
          <p className="text-gray-300">The documentation file could not be loaded.</p>
        </div>
      </div>
    );
  }

  // Get previous and next docs
  const currentIndex = docPages.findIndex((d) => d.id === doc.id);
  const prevDoc = currentIndex > 0 ? docPages[currentIndex - 1] : null;
  const nextDoc = currentIndex < docPages.length - 1 ? docPages[currentIndex + 1] : null;

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Book className="w-4 h-4" />
          <span className="capitalize">{doc.category.replace('-', ' ')}</span>
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">{doc.title}</h1>
        <p className="text-lg text-gray-400">{doc.description}</p>
      </div>

      {/* Content */}
      <div className="mb-12">
        <MarkdownRenderer content={content} />
      </div>

      {/* Navigation */}
      <div className="border-t border-white/10 pt-8 mt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prevDoc && (
            <a
              href={`/docs/${prevDoc.slug}`}
              className="group p-4 bg-slate-900/30 hover:bg-slate-900/50 border border-white/10 hover:border-blue-500/30 rounded-lg transition-all"
            >
              <div className="text-xs text-gray-500 mb-1">Previous</div>
              <div className="text-white font-medium group-hover:text-blue-400 transition-colors">
                ← {prevDoc.title}
              </div>
            </a>
          )}
          {nextDoc && (
            <a
              href={`/docs/${nextDoc.slug}`}
              className="group p-4 bg-slate-900/30 hover:bg-slate-900/50 border border-white/10 hover:border-blue-500/30 rounded-lg transition-all md:ml-auto md:text-right"
            >
              <div className="text-xs text-gray-500 mb-1">Next</div>
              <div className="text-white font-medium group-hover:text-blue-400 transition-colors">
                {nextDoc.title} →
              </div>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
