'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { docPages, categories } from '@/lib/docs-config';
import { FileText, ChevronRight } from 'lucide-react';

export function DocsSidebar() {
  const pathname = usePathname();

  const categoriesOrder: Array<'getting-started' | 'guides' | 'reference'> = [
    'getting-started',
    'guides',
    'reference'
  ];

  return (
    <aside className="w-64 bg-slate-950/50 border-r border-white/5 overflow-y-auto">
      <div className="p-6 border-b border-white/5">
        <h2 className="text-lg font-bold text-white">Documentation</h2>
        <p className="text-xs text-gray-500 mt-1">Agent Platform Guide</p>
      </div>

      <nav className="p-4 space-y-6">
        {categoriesOrder.map((categoryKey) => {
          const category = categories[categoryKey];
          const docs = docPages.filter((doc) => doc.category === categoryKey);

          return (
            <div key={categoryKey}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                {category.title}
              </h3>
              <div className="space-y-1">
                {docs.map((doc) => {
                  const isActive = pathname === `/docs/${doc.slug}`;

                  return (
                    <Link
                      key={doc.id}
                      href={`/docs/${doc.slug}`}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${
                        isActive
                          ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20'
                          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                      }`}
                    >
                      <FileText
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'
                        }`}
                      />
                      <span className="text-sm font-medium flex-1">{doc.title}</span>
                      {isActive && <ChevronRight className="w-4 h-4 text-blue-400" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
