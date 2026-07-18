
import React, { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { getReleases } from '../utils/githubCache';

interface ReleaseUpdate {
  version: string;
  date: string;
  title: string;
  body: string;
}

const Updates: React.FC = () => {
  const { config } = useConfig();
  const [releases, setReleases] = useState<ReleaseUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  // Full-featured Markdown + HTML parser for GitHub release bodies
  const markdownToHtml = (text: string): string => {
    if (!text) return '';

    // If the input already looks like HTML (e.g. from GitHub rich releases), render it directly
    // but sanitize only truly dangerous tags while keeping all structural HTML
    const isHtml = /<(h[1-6]|ul|ol|li|p|table|tr|th|td|blockquote|hr|strong|em|a|br|div|span)\b/i.test(text);
    if (isHtml) {
      return renderHtml(text);
    }

    // Otherwise parse as Markdown (GFM)
    return renderMarkdown(text);
  };

  // Render already-HTML content with styled classes injected
  const renderHtml = (html: string): string => {
    return html
      // Headers
      .replace(/<h1([^>]*)>/gi, '<h1$1 class="text-white mt-8 mb-5 text-3xl font-black tracking-tight border-l-4 border-emerald-400/60 pl-4">')
      .replace(/<h2([^>]*)>/gi, '<h2$1 class="text-white mt-8 mb-4 text-2xl font-bold border-l-4 border-white/40 pl-4">')
      .replace(/<h3([^>]*)>/gi, '<h3$1 class="text-white/90 mt-6 mb-3 text-lg font-bold border-l-4 border-white/20 pl-3">')
      // Paragraphs
      .replace(/<p([^>]*)>/gi, '<p$1 class="mb-3 text-white/80 leading-relaxed">')
      // Strong
      .replace(/<strong([^>]*)>/gi, '<strong$1 class="text-white font-bold">')
      // Em
      .replace(/<em([^>]*)>/gi, '<em$1 class="text-white/80 italic">')
      // Links
      .replace(/<a([^>]*href="[^"]*")([^>]*)>/gi, '<a$1$2 target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors">')
      // UL / OL
      .replace(/<ul([^>]*)>/gi, '<ul$1 class="my-3 pl-5 flex flex-col gap-1">')
      .replace(/<ol([^>]*)>/gi, '<ol$1 class="my-3 pl-5 flex flex-col gap-1 list-decimal">')
      .replace(/<li([^>]*)>/gi, '<li$1 class="text-white/80 list-disc pl-1">')
      // Blockquote
      .replace(/<blockquote([^>]*)>/gi, '<blockquote$1 class="border-l-4 border-white/20 pl-4 my-4 italic text-white/50">')
      // HR
      .replace(/<hr\s*\/?>/gi, '<hr class="my-6 border-white/10">')
      // Tables
      .replace(/<table([^>]*)>/gi, '<div class="overflow-x-auto my-4"><table$1 class="w-full text-sm border-collapse">')
      .replace(/<\/table>/gi, '</table></div>')
      .replace(/<thead([^>]*)>/gi, '<thead$1 class="bg-white/5">')
      .replace(/<th([^>]*)>/gi, '<th$1 class="px-4 py-2 text-left text-white/60 font-bold uppercase text-xs tracking-widest border-b border-white/10">')
      .replace(/<tr([^>]*)>/gi, '<tr$1 class="border-b border-white/5 hover:bg-white/[0.03] transition-colors">')
      .replace(/<td([^>]*)>/gi, '<td$1 class="px-4 py-2 text-white/80">')
      // Code inline
      .replace(/<code([^>]*)>/gi, '<code$1 class="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-xs border border-white/10">');
  };

  // Parse GitHub-Flavored Markdown into HTML
  const renderMarkdown = (text: string): string => {
    const lines = text.split('\n');
    const out: string[] = [];
    let i = 0;

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inlineFormat = (s: string): string => {
      let r = escapeHtml(s);
      r = r.replace(/`([^`]+?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-xs border border-white/10">$1</code>');
      r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors">$1</a>');
      r = r.replace(/\*\*([^*]+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
      r = r.replace(/\*([^*\n]+?)\*/g, '<em class="text-white/80 italic">$1</em>');
      return r;
    };

    // Check if a line looks like a GFM table separator row (e.g. "-- | --")
    const isTableSep = (line: string) => /^\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
    const isTableRow = (line: string) => /\|/.test(line);

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Blank line
      if (!trimmed) { out.push(''); i++; continue; }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push('<hr class="my-6 border-white/10">');
        i++; continue;
      }

      // Headers
      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        const content = inlineFormat(hMatch[2]);
        const hClasses = [
          'text-white mt-8 mb-5 text-3xl font-black tracking-tight border-l-4 border-emerald-400/60 pl-4',
          'text-white mt-8 mb-4 text-2xl font-bold border-l-4 border-white/40 pl-4',
          'text-white/90 mt-6 mb-3 text-lg font-bold border-l-4 border-white/20 pl-3',
        ];
        out.push(`<h${level} class="${hClasses[level - 1]}">${content}</h${level}>`);
        i++; continue;
      }

      // Blockquote
      if (trimmed.startsWith('>')) {
        const bqLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          bqLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        out.push(`<blockquote class="border-l-4 border-white/20 pl-4 my-4 italic text-white/50">${bqLines.map(inlineFormat).join('<br>')}</blockquote>`);
        continue;
      }

      // Unordered list
      if (/^[-*]\s/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
          items.push(`<li class="text-white/80 list-disc pl-1">${inlineFormat(lines[i].trim().replace(/^[-*]\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ul class="my-3 pl-5 flex flex-col gap-1">${items.join('')}</ul>`);
        continue;
      }

      // Ordered list
      if (/^\d+\.\s/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          items.push(`<li class="text-white/80 pl-1">${inlineFormat(lines[i].trim().replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ol class="my-3 pl-5 flex flex-col gap-1 list-decimal">${items.join('')}</ol>`);
        continue;
      }

      // GFM Table: look-ahead for a separator row on the next line
      if (isTableRow(trimmed) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const headerCells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
        i += 2; // skip header + separator
        const bodyRows: string[][] = [];
        while (i < lines.length && isTableRow(lines[i].trim())) {
          bodyRows.push(lines[i].split('|').map(c => c.trim()).filter(c => c !== ''));
          i++;
        }
        const thead = `<thead class="bg-white/5"><tr class="border-b border-white/10">${headerCells.map(h => `<th class="px-4 py-2 text-left text-white/60 font-bold uppercase text-xs tracking-widest border-b border-white/10">${inlineFormat(h)}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${bodyRows.map(row => `<tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors">${row.map(cell => `<td class="px-4 py-2 text-white/80">${inlineFormat(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;
        out.push(`<div class="overflow-x-auto my-4"><table class="w-full text-sm border-collapse">${thead}${tbody}</table></div>`);
        continue;
      }

      // Plain paragraph
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' &&
        !/^(#{1,3}\s|[-*]\s|\d+\.\s|>|---|\*\*\*|___)/.test(lines[i].trim()) &&
        !(isTableRow(lines[i].trim()) && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
        paraLines.push(inlineFormat(lines[i]));
        i++;
      }
      if (paraLines.length) {
        out.push(`<p class="mb-3 text-white/80 leading-relaxed">${paraLines.join('<br>')}</p>`);
      }
    }

    return out.join('\n');
  };

  useEffect(() => {
    if (!config?.github?.repository) return;

    const fetchReleases = async () => {
      setLoading(true);
      try {
        const repo = config.github.repository;
        const data = await getReleases(repo, 10);

        // Sorting is now handled globally in getReleases (githubCache.ts)
        const sortedData = data.slice(0, 4);

        const releasesData = sortedData.map((release: any) => ({
          version: release.tag_name,
          date: new Date(release.published_at).toLocaleDateString('it-IT', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          }),
          title: release.name || release.tag_name,
          body: release.body
        }));
        setReleases(releasesData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, [config]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase text-white">Changelogs & <br /><span className="text-white/30">Wiki Hub</span></h1>
        <p className="text-gray-400 max-w-2xl text-lg font-light">Stay updated with the latest mechanical tweaks and community guides.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {/* Left: Wiki Cards / Iframe Trigger */}
        <div className="lg:col-span-1 flex flex-col h-full gap-6">
          <div className="flex items-center justify-between px-2 h-8">
            <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Essential Wiki</h3>
          </div>

          {/* Wiki Embed Wrapper */}
          <div className="glass-card rounded-2xl overflow-hidden flex-[2] flex flex-col relative group border border-white/10 min-h-[450px]">
            <div className="relative flex-grow w-full">
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 pointer-events-none group-hover:opacity-0 transition-opacity">
                <span className="bg-black/80 px-4 py-2 rounded-xl text-white font-bold uppercase tracking-widest text-xs border border-white/20">Interactive Wiki</span>
              </div>
              <iframe
                src="https://manfredonia-pack-wiki.netlify.app/"
                className="w-full h-full border-none bg-[#191919]"
                title="Manfredonia Wiki"
              ></iframe>
            </div>

            <a
              href="https://manfredonia-pack-wiki.netlify.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-white/5 border-t border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 transition-all group shrink-0 z-30"
            >
              <span className="text-xs font-black text-white uppercase tracking-widest">Open Full Wiki</span>
              <span className="material-symbols-outlined text-white/60 text-sm group-hover:translate-x-1 transition-transform">open_in_new</span>
            </a>
          </div>

          <div className="glass-card rounded-2xl p-6 flex flex-col gap-3 flex-1 min-h-0">
            <div className="flex flex-col gap-1 text-center">
              <span className="material-symbols-outlined text-3xl text-white/30">support_agent</span>
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Need Support?</h3>
              <p className="text-[10px] text-gray-500 leading-relaxed">Request support in the discord server</p>
            </div>

            <form action="https://formspree.io/f/mqabzreg" method="POST" className="flex flex-col gap-2">
              <input
                type="text"
                id="support-name"
                name="name"
                placeholder="Nome (Max)"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:border-white transition-all outline-none"
                required
              />

              <input
                type="email"
                id="support-email"
                name="email"
                placeholder="Email (maxverstappen@live.it)"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:border-white transition-all outline-none"
                required
              />

              <input
                type="text"
                id="support-discord"
                name="discord"
                placeholder="Discord Username (max#3)"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs focus:border-white transition-all outline-none"
                required
              />

              <input type="hidden" name="_subject" value="Nuova richiesta di accesso al supporto" />
              <input type="hidden" name="_next" value="#success" />
              <input type="hidden" name="_autoresponse" value="Grazie per la tua richiesta di accesso al supporto. Abbiamo ricevuto i tuoi dati e ti contatteremo presto." />

              <button type="submit" className="w-full py-2 bg-white text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-gray-200 transition-all mt-1">
                Send Request
              </button>
            </form>
          </div>
        </div>

        {/* Right: Changelogs */}
        <div className="lg:col-span-2 flex flex-col h-full gap-6">
          <div className="flex items-center justify-between px-2 h-8">
            <h3 className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Latest Releases</h3>
            {releases.length > 0 && <span className="text-xs font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/20">{releases.length} Updates</span>}
          </div>

          {loading ? (
            <div className="glass-card rounded-2xl flex-grow flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
          ) : releases.length > 0 ? (
            <div className="flex flex-col gap-6">
              {releases.map((release, index) => {
                const isLatest = index === 0;
                const isExpanded = expandedIndex === index;

                return (
                  <div
                    key={release.version}
                    className="glass-card rounded-2xl p-8 relative overflow-hidden group transition-all cursor-pointer hover:border-white/20"
                    onClick={() => {
                      if (expandedIndex !== index) {
                        setExpandedIndex(index);
                      }
                    }}
                  >
                    <div className="absolute top-0 right-0 py-2 px-6 bg-white/5 text-white/20 font-black text-4xl group-hover:text-white/10 transition-colors uppercase tracking-widest select-none">{release.version}</div>

                    <div className="flex flex-col gap-6 relative z-10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {isLatest && (
                            <span className="text-xs font-black text-white px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 uppercase tracking-widest">Latest</span>
                          )}
                          <span className="text-xs font-black text-white px-3 py-1 rounded-full bg-white/10 border border-white/10 uppercase tracking-widest">Stable Build</span>
                          <span className="text-xs font-medium text-gray-500">{release.date}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-black text-white uppercase tracking-tight">{release.title}</h2>
                        {!isExpanded && (
                          <div className="flex items-center justify-center size-10 rounded-lg bg-white/5 border border-white/10 group-hover:bg-white/10 transition-all flex-shrink-0">
                            <span className="material-symbols-outlined text-white/60 text-xl transition-transform" style={{ transform: 'rotate(0deg)' }}>
                              keyboard_arrow_down
                            </span>
                          </div>
                        )}
                      </div>

                      {isExpanded && (
                        <div
                          className="text-gray-300 leading-relaxed space-y-4 h-[229px] overflow-y-auto pr-2 animate-in fade-in slide-in-from-top-4 duration-300"
                          style={{
                            scrollbarWidth: 'thin',
                            scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent'
                          }}
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(release.body) }}
                        ></div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8 text-center text-gray-500">
              <p>No release notes found or unable to fetch from GitHub.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Updates;
