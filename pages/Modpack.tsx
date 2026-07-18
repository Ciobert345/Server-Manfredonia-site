
import React, { useState, useEffect } from 'react';
import { useConfig } from '../contexts/ConfigContext';
import { getLatestRelease } from '../utils/githubCache';

interface ReleaseData {
  version: string;
  zipUrl: string | null;
  mrpackUrl: string | null;
  name: string;
}

const Modpack: React.FC = () => {
  const { config } = useConfig();
  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [managerRelease, setManagerRelease] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs State
  const [activeTab, setActiveTab] = useState<'install' | 'optimize'>('install');
  const [installTab, setInstallTab] = useState<'curseforge' | 'modrinth' | 'sklauncher'>('curseforge');

  useEffect(() => {
    if (!config?.github?.repository) return;

    const fetchRelease = async () => {
      setLoading(true);
      setError(null);
      try {
        const repo = config.github.repository;
        const data = await getLatestRelease(repo);
        let zipUrl = null;
        let mrpackUrl = null;
        if (data.assets && Array.isArray(data.assets)) {
          data.assets.forEach((asset: any) => {
            const name = asset.name.toLowerCase();
            if (name.endsWith('.zip') && !zipUrl) zipUrl = asset.browser_download_url;
            if (name.endsWith('.mrpack') && !mrpackUrl) mrpackUrl = asset.browser_download_url;
          });
          if (!zipUrl && data.assets.length > 0) zipUrl = data.assets[0].browser_download_url;
        }
        setRelease({
          version: data.tag_name,
          zipUrl,
          mrpackUrl,
          name: data.name
        });
      } catch (err) {
        console.error('GitHub Fetch Error:', err);
        setError('Unable to retrieve latest version info');
      } finally {
        setLoading(false);
      }
    };

    fetchRelease();

  }, [config]);

  useEffect(() => {
    if (!config) return;

    const fetchManager = async () => {
      try {
        const data = await getLatestRelease('Ciobert345/Manfredonia-Manager');
        setManagerRelease({
          version: data.tag_name,
          zipUrl: data.assets?.find((a: any) => a.name.toLowerCase().endsWith('.msix'))?.browser_download_url ||
            data.assets?.find((a: any) => a.name.toLowerCase().endsWith('.exe'))?.browser_download_url ||
            data.html_url,
          mrpackUrl: null,
          name: data.name
        });
      } catch (e) {
        console.error('Failed to fetch manager release', e);
      }
    };
    fetchManager();
  }, [config]);

  if (!config) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 flex flex-col items-center gap-16">
      <section className="w-full flex flex-col items-center text-center gap-6 py-6 relative">

        <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-white drop-shadow-lg leading-tight uppercase italic">
          Manfredonia <br /><span className="text-white/40">Excellence</span>
        </h1>
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80 text-xs font-bold tracking-wide uppercase transition-all duration-1000 ${loading ? 'opacity-50' : 'opacity-100'}`}>
          <span className={`relative flex h-2 w-2 ${loading ? 'animate-spin border-t-2 border-white rounded-full' : ''}`}>
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50 ${loading ? 'hidden' : ''}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 bg-white ${loading ? 'hidden' : ''}`}></span>
          </span>
          {loading ? 'Querying GitHub API...' : error ? error : `Latest Release Detected: ${release?.version}`}
        </div>
        <p className="max-w-2xl text-lg text-gray-400 font-light leading-relaxed">
          Powered by NeoForge for unparalleled performance. Curated with 200+ selected mods.
        </p>

      </section>

      {/* Hero Download Section - Manfredonia Manager */}
      <div className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1a1a1a] to-black border border-white/10 group">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-blue-600/10 opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div className="relative z-10 p-6 md:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="flex-shrink-0 relative">
            <div className="absolute inset-0 bg-purple-500/20 blur-3xl rounded-full animate-pulse"></div>
            <div className="size-24 md:size-32 rounded-3xl bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center shadow-2xl relative z-10 group-hover:scale-105 transition-transform duration-500">
              <span className="material-symbols-outlined text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-purple-400 to-blue-400">rocket_launch</span>
            </div>
            <div className="absolute -bottom-3 -right-3 bg-white text-black text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg z-20">Recommended</div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 flex-grow w-full">
            <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2 max-w-2xl">
              <div>
                <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tighter italic">Manfredonia Manager</h2>
                <p className="text-purple-200/60 font-medium tracking-widest uppercase text-xs mt-1">The Official Auto-Installer & Updater</p>
              </div>
              <p className="text-gray-400 text-sm md:text-base font-light leading-relaxed">
                Forget manual updates. The manager handles installation, updates, and optimization automatically with a single click.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end gap-2 flex-shrink-0">
              <a
                href={managerRelease?.zipUrl || '#'}
                target="_parent"
                rel="noreferrer"
                download
                className={`px-8 py-3 bg-white hover:bg-purple-50 text-black rounded-xl font-black text-sm md:text-base uppercase tracking-widest transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)] flex items-center gap-3 group/btn ${(!managerRelease?.zipUrl) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
              >
                <span className="material-symbols-outlined text-2xl group-hover/btn:-translate-y-1 transition-transform">download</span>
                <span>Download Manager</span>
              </a>
              <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
                <span>{managerRelease?.version ? `Latest: ${managerRelease.version}` : 'Checking version...'}</span>
                <span>•</span>
                <span>Windows (x64)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alternative Downloads */}
      <div className="w-full flex flex-col gap-6">
        <h3 className="text-xl font-bold text-white uppercase tracking-widest opacity-50 ml-2">Alternative Downloads</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {[
            { name: 'Curseforge', icon: 'local_fire_department', color: 'border-orange-500/20', rec: false, url: release?.zipUrl, note: '.zip Format' },
            { name: 'Modrinth', icon: 'eco', color: 'border-green-500/20', rec: false, url: release?.mrpackUrl || release?.zipUrl, note: '.mrpack Format' },
            { name: 'SkLauncher / Universal', icon: 'folder_zip', color: 'border-blue-500/20', rec: false, url: release?.zipUrl, note: 'Import from Zip' }
          ].map(item => (
            <div key={item.name} className={`glass-card glass-card-hover rounded-3xl p-8 flex flex-col gap-6 relative overflow-hidden group border-b-4 ${item.color}`}>
              {item.rec && <div className="absolute top-0 right-0 bg-white text-black font-black text-[9px] px-4 py-1.5 rounded-bl-xl uppercase tracking-widest z-10">Recommended</div>}
              <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-all duration-500"><span className="material-symbols-outlined text-4xl font-variation-fill">{item.icon}</span></div>
              <div><h3 className="text-2xl font-black text-white uppercase tracking-tight">{item.name}</h3><p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{item.note}</p></div>
              <a href={item.url || '#'} target="_blank" rel="noreferrer" className={`mt-auto w-full py-4 bg-white text-black font-black uppercase text-xs tracking-[0.2em] rounded-xl hover:bg-gray-200 transition-all flex items-center justify-center gap-2 ${(!item.url || loading) ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}>
                <span className="material-symbols-outlined text-sm">download</span> {loading ? 'Loading...' : 'Download'}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Guides & Resources Section */}
      <div className="w-full bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
        {/* Main Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('install')}
            className={`flex-1 py-6 text-center text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'install' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
          >
            Installation Guide
          </button>
          <div className="w-px bg-white/10"></div>
          <button
            onClick={() => setActiveTab('optimize')}
            className={`flex-1 py-6 text-center text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'optimize' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
          >
            Optimization Guide
          </button>
        </div>

        {/* Content Area */}
        <div className="p-8 md:p-12">

          {/* INSTALLATION CONTENT */}
          {activeTab === 'install' && (
            <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Launcher Selector */}
              <div className="flex flex-wrap justify-center gap-4">
                {[
                  { id: 'curseforge', label: 'CurseForge', icon: 'rvlug1G94cK9' }, // Custom icon handling needed usually, using simple storage mapping or generic
                  { id: 'modrinth', label: 'Modrinth', icon: 'eco' },
                  { id: 'sklauncher', label: 'SKLauncher', icon: 'folder_zip' }
                ].map((launcher) => (
                  <button
                    key={launcher.id}
                    onClick={() => setInstallTab(launcher.id as any)}
                    className={`px-6 py-3 rounded-xl border transition-all flex items-center gap-3 ${installTab === launcher.id ? 'bg-white text-black border-white' : 'bg-transparent text-gray-400 border-white/10 hover:border-white/30'}`}
                  >
                    <span className="font-bold uppercase tracking-wide text-xs">{launcher.label}</span>
                  </button>
                ))}
              </div>

              {/* Launcher Specific Steps */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4">
                {installTab === 'curseforge' && [
                  { step: '01', title: 'Get the App', desc: 'Download and install the CurseForge App from their official website.', link: 'https://www.curseforge.com/download/app' },
                  { step: '02', title: 'Download Pack', desc: 'Download the Modpack .zip file from the button above.' },
                  { step: '03', title: 'Import', desc: 'Open CurseForge, click "Create Custom Profile", then "Import" and select the downloaded .zip.' }
                ].map(item => (
                  <div key={item.step} className="flex flex-col gap-3">
                    <span className="text-5xl font-black text-white/5 tracking-tighter">{item.step}</span>
                    <h4 className="text-lg font-bold text-white uppercase">{item.title}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                    {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-4 mt-1">Download App &rarr;</a>}
                  </div>
                ))}

                {installTab === 'modrinth' && [
                  { step: '01', title: 'Get the App', desc: 'Download and install the Modrinth App.', link: 'https://modrinth.com/app' },
                  { step: '02', title: 'Create Instance', desc: 'Click the "+" button to create a new instance.' },
                  { step: '03', title: 'Import', desc: 'Select "Import from File" and choose the .mrpack file downloaded above.' }
                ].map(item => (
                  <div key={item.step} className="flex flex-col gap-3">
                    <span className="text-5xl font-black text-white/5 tracking-tighter">{item.step}</span>
                    <h4 className="text-lg font-bold text-white uppercase">{item.title}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                    {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:text-green-300 underline underline-offset-4 mt-1">Download App &rarr;</a>}
                  </div>
                ))}

                {installTab === 'sklauncher' && [
                  { step: '01', title: 'Prepare', desc: 'Download SKLauncher and run it.', link: 'https://skmedix.pl/' },
                  { step: '02', title: 'Extract', desc: 'Extract the contents of the Modpack .zip directly into your .minecraft folder (replace existing files).' },
                  { step: '03', title: 'Configure', desc: 'Launch with "neoforge-1.21.1 with NeoForge 21.1.235" and allocate 6-8GB RAM.' }
                ].map(item => (
                  <div key={item.step} className="flex flex-col gap-3">
                    <span className="text-5xl font-black text-white/5 tracking-tighter">{item.step}</span>
                    <h4 className="text-lg font-bold text-white uppercase">{item.title}</h4>
                    <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                    {item.link && <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-4 mt-1">Visit Site &rarr;</a>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OPTIMIZATION CONTENT */}
          {activeTab === 'optimize' && (
            <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* RAM Allocation */}
              <div className="flex flex-col md:flex-row gap-8 items-stretch border-b border-white/5 pb-12">
                <div className="flex-1">
                  <h3 className="text-2xl font-black text-white uppercase italic mb-4">Memory Allocation</h3>
                  <p className="text-sm text-gray-400 leading-relaxed mb-6">
                    Correct RAM allocation is critical for stability. Too little causes lag, too much causes garbage collection stutters.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <span className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Device RAM &le; 8GB</span>
                      <span className="text-xl font-bold text-white">Allocate 5.0 - 5.5 GB</span>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <span className="text-xs text-gray-500 uppercase tracking-widest mb-1 block">Device RAM &gt; 8GB</span>
                      <span className="text-xl font-bold text-white">Allocate 8.0 GB</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 p-8 bg-gradient-to-br from-yellow-500/20 to-orange-500/5 border border-yellow-500/30 rounded-3xl flex flex-col justify-center relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                  <h4 className="text-yellow-400 font-black uppercase text-base mb-3 flex items-center gap-3 relative z-10">
                    <span className="material-symbols-outlined text-2xl">warning</span>
                    <span>Important</span>
                  </h4>
                  <p className="text-sm md:text-base text-yellow-100/80 leading-relaxed font-medium relative z-10">
                    Never allocate more than half your system RAM if you have 8GB or less.
                    Always check <span className="text-yellow-400 font-bold underline underline-offset-4 cursor-default">Task Manager</span> to verify your total available RAM before configuring.
                  </p>
                </div>
              </div>

              {/* Video Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div>
                  <h3 className="text-xl font-bold text-white uppercase mb-6">Video Settings</h3>
                  <ul className="space-y-4">
                    {[
                      { label: 'Render Distance', value: '6-8 Chunks' },
                      { label: 'Simulation Distance', value: 'Minimum (5)' },
                      { label: 'VSync', value: 'OFF' },
                      { label: 'Entity Shadows', value: 'OFF' },
                      { label: 'Particles', value: 'Decreased / Minimal' }
                    ].map(setting => (
                      <li key={setting.label} className="flex items-center justify-between border-b border-white/5 pb-2">
                        <span className="text-gray-400 text-sm">{setting.label}</span>
                        <span className="text-white font-mono text-sm">{setting.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white uppercase mb-6">Drivers & Java</h3>
                  <div className="flex flex-col gap-4">
                    <a href="https://www.nvidia.com/Download/index.aspx" target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                      <span className="text-sm font-bold text-white">NVIDIA Drivers</span>
                      <span className="material-symbols-outlined text-white/50 group-hover:text-white transition-colors">open_in_new</span>
                    </a>
                    <a href="https://www.amd.com/en/support" target="_blank" rel="noreferrer" className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                      <span className="text-sm font-bold text-white">AMD Drivers</span>
                      <span className="material-symbols-outlined text-white/50 group-hover:text-white transition-colors">open_in_new</span>
                    </a>
                    <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                      <p className="text-xs text-purple-200/80 leading-relaxed">
                        <strong>Java Tip:</strong> Use GraalVM or Java 21+ for best performance on 1.18+ packs.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default Modpack;
