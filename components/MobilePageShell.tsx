import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';

const markdownToHtml = (text: string) => {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  html = html.replace(/`([^`]+?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-xs border border-white/10">$1</code>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors">$1</a>');
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
  html = html.replace(/\*([^*\n]+?)\*/g, '<em class="text-white/80 italic">$1</em>');
  html = html.replace(/\n/g, '<br>');
  return html;
};

interface MobilePageShellProps {
  children: React.ReactNode;
  subtitle?: string;
  activeNav?: 'blog' | 'account';
}

const MobilePageShell: React.FC<MobilePageShellProps> = ({
  children,
  subtitle = 'Community Hub',
  activeNav,
}) => {
  const { config, notifications } = useConfig();
  const { user, setAuthModalOpen, markBannerAsRead, markAllBannersAsRead } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pendingAccountNav, setPendingAccountNav] = useState(false);

  const readIds = user?.read_banner_ids || [];
  const enabledBanners = notifications?.filter(b => b.enabled) || [];
  const unreadCount = enabledBanners.filter(b => !readIds.includes(b.id)).length;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const savedPush = localStorage.getItem('manfredonia_push_enabled');
    if (savedPush === 'true') setPushEnabled(true);
  }, []);

  useEffect(() => {
    if (user && pendingAccountNav) {
      navigate('/mobile-account');
      setPendingAccountNav(false);
    }
  }, [user, pendingAccountNav, navigate]);

  const togglePush = async () => {
    if (!pushEnabled) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setPushEnabled(true);
          localStorage.setItem('manfredonia_push_enabled', 'true');
        }
      }
    } else {
      setPushEnabled(false);
      localStorage.setItem('manfredonia_push_enabled', 'false');
    }
  };

  const markAllAsRead = async () => {
    const enabledIds = notifications?.filter(b => b.enabled).map(b => b.id) || [];
    await markAllBannersAsRead(enabledIds);
  };

  const closeMenu = () => setMenuOpen(false);

  const navToMobileSection = (sectionId: string) => {
    localStorage.setItem('mobileScrollTarget', sectionId);
    navigate('/mobile');
    closeMenu();
  };

  const navItems = [
    { icon: 'schedule', label: 'Status', action: () => navToMobileSection('top') },
    { icon: 'terminal', label: 'Dashboard', action: () => navToMobileSection('dashboard') },
    { icon: 'newspaper', label: 'Updates', action: () => navToMobileSection('updates') },
    { icon: 'school', label: 'Guides', action: () => navToMobileSection('guides') },
    { icon: 'build', label: 'Tools', action: () => navToMobileSection('richiedi-accesso') },
    ...(config?.isBlogEnabled ? [{
      icon: 'article',
      label: 'Blog',
      active: activeNav === 'blog',
      action: () => { navigate('/blog'); closeMenu(); },
    }] : []),
    {
      icon: 'badge',
      label: 'Account',
      active: activeNav === 'account',
      action: () => {
        if (user) {
          navigate('/mobile-account');
        } else {
          setPendingAccountNav(true);
          setAuthModalOpen(true);
        }
        closeMenu();
      },
    },
  ];

  return (
    <div className="bg-[#050505] min-h-screen text-white font-sans overflow-x-hidden pb-12">
      <header
        className={`fixed left-0 w-full z-50 px-4 transition-all duration-300 ${scrolled ? 'py-3 bg-[#080808]/90 backdrop-blur-xl border-b border-white/5 shadow-2xl' : 'py-5 bg-transparent backdrop-blur-sm border-b border-transparent'}`}
        style={{ top: 'var(--banner-height, 0px)' }}
      >
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => navigate('/mobile')}
            className="flex items-center gap-3 group"
          >
            <div className={`relative flex items-center justify-center rounded-xl transition-all duration-300 ${scrolled ? 'size-9' : 'size-10'}`}>
              <img src="/site-icon-rack-white.svg" alt="Server Manfredonia Logo" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
            </div>
            <div className={`flex flex-col transition-all duration-300 ${scrolled ? 'opacity-100' : 'opacity-90'}`}>
              <h1 className="font-black text-white uppercase tracking-tighter leading-none text-base md:text-lg">Server Manfredonia</h1>
              <span className="text-[8px] md:text-[9px] font-bold text-white/40 uppercase tracking-[0.3em]">{subtitle}</span>
            </div>
          </button>

          <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1 backdrop-blur-md shadow-lg">
            <button
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-95 ${notificationsOpen ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {unreadCount > 0 ? 'notifications_active' : 'notifications'}
              </span>
              {unreadCount > 0 && !notificationsOpen && (
                <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border border-black animate-pulse" />
              )}
            </button>

            <div className="w-px h-4 bg-white/10 mx-1" />

            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className={`flex flex-col justify-center items-center w-10 h-10 rounded-full transition-all active:scale-95 ${menuOpen ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
            >
              <div className="flex flex-col gap-[3px] items-center">
                <span className={`block w-4 h-0.5 rounded-full transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-[5px] bg-black' : 'bg-white'}`} />
                <span className={`block w-4 h-0.5 rounded-full transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-[0px] bg-black' : 'bg-white'}`} />
              </div>
            </button>
          </div>
        </div>
      </header>

      {notificationsOpen && (
        <div className="fixed inset-x-4 top-20 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[60] animate-in fade-in slide-in-from-top-4">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
            <div className="flex flex-col">
              <h3 className="font-bold text-white uppercase tracking-wider text-[10px]">System Alerts</h3>
              <span className="text-[9px] text-gray-500 font-mono">{unreadCount} Unread</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={togglePush} className={`size-8 rounded-lg flex items-center justify-center border transition-all ${pushEnabled ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-gray-500'}`}>
                <span className="material-symbols-outlined text-[18px]">{pushEnabled ? 'notifications_paused' : 'add_alert'}</span>
              </button>
              <button type="button" onClick={markAllAsRead} className="size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                <span className="material-symbols-outlined text-[18px]">done_all</span>
              </button>
              <button type="button" onClick={() => setNotificationsOpen(false)} className="size-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {enabledBanners.length === 0 ? (
              <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-4xl opacity-20">notifications_off</span>
                <span className="text-xs font-medium">No new notifications</span>
              </div>
            ) : (
              enabledBanners.map(banner => (
                <div
                  key={banner.id}
                  onClick={() => markBannerAsRead(banner.id)}
                  className={`p-4 border-b border-white/5 relative group ${!readIds.includes(banner.id) ? 'bg-blue-500/[0.04]' : 'opacity-60'}`}
                >
                  <div className="flex gap-3">
                    <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${banner.style?.includes('red') ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                      banner.style?.includes('purple') ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' :
                        !readIds.includes(banner.id) ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                          'bg-white/5 border-white/10 text-white/20'
                      }`}>
                      <span className="material-symbols-outlined text-sm">{banner.icon === 'notification' ? 'priority_high' : (banner.icon || 'info')}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 w-full min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <h4 className="text-sm font-black text-white tracking-tight leading-none">{banner.title}</h4>
                        {!readIds.includes(banner.id) && <span className="size-1.5 rounded-full bg-blue-500 animate-pulse ml-auto" />}
                      </div>
                      <div className="text-xs text-gray-300 font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: markdownToHtml(banner.message) }} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {notificationsOpen && <div className="fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm" onClick={() => setNotificationsOpen(false)} />}

      <nav
        className={`fixed inset-x-2 z-40 bg-[#080808]/98 backdrop-blur-2xl border border-white/10 p-1.5 rounded-2xl transition-all duration-300 cubic-bezier(0.32, 0.72, 0, 1) shadow-2xl origin-top ${menuOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}
        style={{ top: scrolled ? 'calc(5rem + var(--banner-height, 0px))' : 'calc(6rem + var(--banner-height, 0px))' }}
      >
        <div className="grid grid-cols-4 sm:flex sm:items-center sm:justify-between gap-1.5 w-full">
          {navItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={item.action}
              className={`group flex flex-col items-center justify-center p-2 rounded-xl border transition-all active:scale-95 flex-1 min-w-0 ${item.active ? 'bg-white text-black border-white' : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`}
            >
              <div className={`flex items-center justify-center size-6 rounded-md border transition-colors mb-1 ${item.active ? 'bg-black/10 border-black/10 text-black' : 'bg-black/40 border-white/5 text-white/70 group-hover:text-white'}`}>
                <span className="material-symbols-outlined text-[16px]">{item.icon}</span>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider truncate w-full text-center ${item.active ? 'text-black' : 'text-white'}`}>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={closeMenu} />
      )}

      <main style={{ paddingTop: 'calc(5rem + var(--banner-height, 0px))' }}>
        {children}
      </main>

      <footer className="px-6 py-8 text-center text-[10px] text-gray-500 uppercase tracking-widest">
        <p>&copy; 2025 Server Manfredonia. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default MobilePageShell;
