'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#fff',
    primaryBorderColor: '#1e40af',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
    background: '#0f172a',
    mainBkg: '#1e293b',
    nodeBorder: '#3b82f6',
    clusterBkg: '#1e293b',
    titleColor: '#fff',
    edgeLabelBackground: '#1e293b',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
  },
  securityLevel: 'loose',
});

interface MermaidDiagramProps {
  chart: string;
}

function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderChart = async () => {
      if (!containerRef.current) return;

      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        setSvg(svg);
        setError(null);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError('Failed to render diagram');
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
        {error}
        <pre className="mt-2 text-xs overflow-x-auto">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-6 p-4 bg-slate-900/50 border border-white/10 rounded-lg overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

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

          // Code blocks - with mermaid support
          code: ({ node, inline, className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeContent = String(children).replace(/\n$/, '');

            // Handle mermaid diagrams
            if (language === 'mermaid') {
              return <MermaidDiagram chart={codeContent} />;
            }

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
                  {codeContent}
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
