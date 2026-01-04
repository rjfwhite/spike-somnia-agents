'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from 'next/link';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-invert prose-slate max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ node, ...props }) => (
            <h1
              className="text-4xl font-bold text-white mt-8 mb-4 pb-3 border-b border-white/10"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-3xl font-bold text-white mt-8 mb-4 pb-2 border-b border-white/10"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-2xl font-semibold text-white mt-6 mb-3" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-xl font-semibold text-white mt-4 mb-2" {...props} />
          ),

          // Paragraphs and text
          p: ({ node, ...props }) => (
            <p className="text-gray-300 leading-relaxed mb-4" {...props} />
          ),

          // Links
          a: ({ node, href, children, ...props }) => {
            const isExternal = href?.startsWith('http');
            const isAnchor = href?.startsWith('#');

            if (isExternal) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            if (isAnchor) {
              return (
                <a
                  href={href}
                  className="text-blue-400 hover:text-blue-300 underline transition-colors"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            return (
              <Link
                href={href || '#'}
                className="text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                {children}
              </Link>
            );
          },

          // Code blocks
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            return !inline ? (
              <div className="my-4 rounded-lg overflow-hidden border border-white/10">
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language}
                  PreTag="div"
                  className="!bg-slate-900/50 !m-0"
                  customStyle={{
                    padding: '1rem',
                    fontSize: '0.875rem',
                    lineHeight: '1.5'
                  }}
                  {...props}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code
                className="bg-slate-800/50 text-blue-300 px-1.5 py-0.5 rounded text-sm font-mono border border-white/10"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Lists
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-inside text-gray-300 space-y-2 mb-4 ml-4" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-inside text-gray-300 space-y-2 mb-4 ml-4" {...props} />
          ),
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,

          // Blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-blue-500 pl-4 py-2 my-4 italic text-gray-400 bg-slate-900/30 rounded-r"
              {...props}
            />
          ),

          // Tables
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-6">
              <table className="min-w-full border border-white/10 rounded-lg" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-slate-900/50" {...props} />
          ),
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => (
            <tr className="border-b border-white/10" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="px-4 py-3 text-left text-sm font-semibold text-white border-r border-white/10 last:border-r-0"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className="px-4 py-3 text-sm text-gray-300 border-r border-white/10 last:border-r-0"
              {...props}
            />
          ),

          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-white/10" {...props} />
          ),

          // Strong/bold
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-white" {...props} />
          ),

          // Emphasis/italic
          em: ({ node, ...props }) => (
            <em className="italic text-gray-200" {...props} />
          ),

          // Images
          img: ({ node, src, alt, ...props }) => (
            <img
              src={src}
              alt={alt}
              className="rounded-lg border border-white/10 max-w-full h-auto my-4"
              {...props}
            />
          ),

          // Pre (for multi-line code) - pass through to SyntaxHighlighter
          pre: ({ node, ...props }) => <pre {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
