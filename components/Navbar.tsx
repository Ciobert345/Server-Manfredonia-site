
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useConfig } from '../contexts/ConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { isMobilePhone } from '../utils/deviceDetection';

const Navbar: React.FC = () => {
  const { config, notifications } = useConfig();
  const { user, setAuthModalOpen, markBannerAsRead, markAllBannersAsRead } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // Read IDs from user state or fallback to local for guests
  const readIds = user?.read_banner_ids || [];

  // Persistence and Push Logic
  useEffect(() => {
    const savedPush = localStorage.getItem('manfredonia_push_enabled');
    if (savedPush === 'true') setPushEnabled(true);
  }, []);

  useEffect(() => {
    if (!notifications || notifications.length === 0 || !pushEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const enabledBanners = notifications.filter(b => b.enabled);
    const lastKnownIds = JSON.parse(localStorage.getItem('manfredonia_last_banner_ids') || '[]');

    const newBanners = enabledBanners.filter(b => !lastKnownIds.includes(b.id));

    if (newBanners.length > 0) {
      newBanners.forEach(banner => {
        new window.Notification(banner.title, {
          body: banner.message.replace(/<[^>]*>?/gm, ''),
          icon: '/favicon.ico'
        });
      });
    }

    localStorage.setItem('manfredonia_last_banner_ids', JSON.stringify(enabledBanners.map(b => b.id)));
  }, [notifications, pushEnabled]);

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

  const handleMarkAllAsRead = async () => {
    const enabledIds = notifications?.filter(b => b.enabled).map(b => b.id) || [];
    if (user) {
      await markAllBannersAsRead(enabledIds);
    }
  };

  const unreadCount = notifications?.filter(b => b.enabled && !readIds.includes(b.id)).length || 0;

  // Add scroll effect transparency
  useEffect(() => {
    const handleScroll = () => {
      const isAtTop = window.scrollY < 10;
      if (isAtTop) {
        setScrolled(false);
      } else {
        setScrolled(window.scrollY > 50);
      }
    };

    // Immediate check and delayed check to handle route transitions
    handleScroll();
    const timeout = setTimeout(handleScroll, 100);

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timeout);
    };
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Modpack', path: '/modpack' },
    { name: 'Utilities', path: '/utilities' },
    { name: 'Updates', path: '/updates' },
    ...(config?.isBlogEnabled && !isMobilePhone() ? [{ name: 'Blog', path: '/blog' }] : []),
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Info', path: '/info' },
  ];

  const copyIp = () => {
    if (config?.serverMetadata?.ip) {
      navigator.clipboard.writeText(config.serverMetadata.ip);
    }
  };

  const serverIp = config?.serverMetadata?.ip || 'server-manfredonia.ddns.net';

  const markdownToHtml = (text: string) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/`([^`]+?)`/g, '<code class="bg-white/10 px-1.5 py-0.5 rounded text-yellow-300 font-mono text-xs border border-white/10">$1</code>');
    // Links (Markdown)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors">$1</a>');

    // Auto-link Raw URLs (excluding existing tags)
    html = html.replace(/(<a\b[^>]*>.*?<\/a>|<code\b[^>]*>.*?<\/code>)|((?:https?:\/\/|www\.)[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*))/g, (match, tag, url) => {
      if (tag) return tag;
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `<a href="${href}" target="_blank" rel="noreferrer" class="text-blue-400 hover:text-blue-300 underline transition-colors break-all">${url}</a>`;
    });

    // Bold
    html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
    // Italic
    html = html.replace(/\*([^*\n]+?)\*/g, '<em class="text-white/80 italic">$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
  };

  return (
    <>
      <div
        className={`sticky transition-all duration-300 z-50 w-full border-b ${scrolled
          ? 'glass-card border-white/5 shadow-lg bg-black/40 backdrop-blur-xl'
          : 'border-transparent bg-transparent shadow-none backdrop-blur-0'
          }`}
        style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', top: 'var(--banner-height, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo Area */}
            {/* Logo Area */}
            <Link to="/" className="flex items-center gap-3 group relative">
              <div className="absolute inset-0 bg-white/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              <div className="relative size-10 flex items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
                <img src="/site-icon-rack-white.svg" alt="Server Manfredonia Logo" className="w-full h-full object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
              </div>
              <div className="flex flex-col">
                <h1 className="font-bold text-sm md:text-xl lg:text-sm xl:text-lg tracking-tight leading-none text-white uppercase group-hover:text-shadow-glow transition-all whitespace-nowrap">Server Manfredonia</h1>
                <span className="text-[10px] text-gray-400 font-medium tracking-[0.2em] uppercase group-hover:text-white transition-colors hidden xl:block">Community Hub</span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/5 backdrop-blur-md">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`relative px-2 xl:px-2.5 py-1.5 rounded-full text-[9px] xl:text-xs font-bold uppercase tracking-wide xl:tracking-wider transition-all duration-300 whitespace-nowrap ${isActive(link.path)
                    ? 'text-black bg-white shadow-[0_0_15px_rgba(255,255,255,0.4)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {link.name}
                </Link>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Account / Login Button */}
              <button
                onClick={() => user ? navigate('/account') : setAuthModalOpen(true)}
                className={`relative flex items-center justify-center size-10 rounded-xl transition-all duration-300 group overflow-hidden border ${user
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/30 text-white'
                  }`}
                title={user ? `Manage Account (${user.username})` : "Login or Sign Up"}
              >
                {user ? (
                  user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-black uppercase tracking-tighter">
                      {user.username.substring(0, 2)}
                    </span>
                  )
                ) : (
                  <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">
                    person
                  </span>
                )}

                {/* Tactical Indicator */}
                {user && (
                  <div className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] border border-black/20"></div>
                )}
              </button>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/30 text-white transition-all relative group"
                >
                  <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">
                    {unreadCount > 0 ? 'notifications_active' : 'notifications'}
                  </span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] font-bold text-white items-center justify-center">
                        {unreadCount}
                      </span>
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute top-14 right-0 w-80 sm:w-96 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                      <div className="flex flex-col">
                        <h3 className="font-bold text-white uppercase tracking-wider text-[10px]">Secure Notification Relay</h3>
                        <span className="text-[9px] text-gray-500 font-mono">
                          {unreadCount} Data Packets Remaining
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={togglePush}
                          className={`size-8 rounded-lg flex items-center justify-center border transition-all ${pushEnabled ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'}`}
                          title={pushEnabled ? "Disable Browser Push" : "Enable Browser Push"}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            {pushEnabled ? 'notifications_paused' : 'add_alert'}
                          </span>
                        </button>
                        <button
                          onClick={handleMarkAllAsRead}
                          className={`size-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center transition-all ${user ? 'text-gray-500 hover:text-white hover:border-white/30 cursor-pointer' : 'text-gray-700 cursor-not-allowed opacity-50'}`}
                          title={user ? "Mark all as read" : "Login to manage notifications"}
                          disabled={!user}
                        >
                          <span className="material-symbols-outlined text-[18px]">done_all</span>
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications?.filter(b => b.enabled).length === 0 ? (
                        <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
                          <span className="material-symbols-outlined text-4xl opacity-20">notifications_paused</span>
                          <span className="text-xs font-medium">No new notifications</span>
                        </div>
                      ) : (
                        notifications?.filter(b => b.enabled).map(banner => (
                          <div
                            key={banner.id}
                            className={`p-4 border-b border-white/5 hover:bg-white/5 transition-colors relative group ${user ? 'cursor-pointer' : 'cursor-default'} ${!readIds.includes(banner.id) ? 'bg-blue-500/[0.04]' : 'opacity-60'}`}
                            onClick={() => user && markBannerAsRead(banner.id)}
                          >
                            <div className="flex gap-3">
                              <div className="flex-shrink-0 mt-1">
                                <div className={`size-8 rounded-lg flex items-center justify-center border transition-all ${banner.style?.includes('red') ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                  banner.style?.includes('purple') ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' :
                                    !readIds.includes(banner.id) ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' :
                                      'bg-white/5 border-white/10 text-white/20'
                                  }`}>
                                  <span className="material-symbols-outlined text-sm">
                                    {banner.icon === 'notification' ? 'priority_high' : (banner.icon || 'info')}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-0.5 w-full min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                  <h4 className={`text-sm font-black tracking-tight leading-none ${!readIds.includes(banner.id) ? 'text-white' : 'text-white/40'}`}>
                                    {banner.title}
                                  </h4>
                                  {banner.subtitle && (
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded border ${banner.style?.includes('red') ? 'border-red-500/30 text-red-400' :
                                      banner.style?.includes('purple') ? 'border-purple-500/30 text-purple-400' :
                                        'border-blue-500/30 text-blue-400'
                                      }`}>
                                      {banner.subtitle}
                                    </span>
                                  )}
                                  {!readIds.includes(banner.id) && (
                                    <span className="size-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)] ml-auto"></span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-300 font-medium leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity" dangerouslySetInnerHTML={{ __html: markdownToHtml(banner.message) }} />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Backdrop for closing dropdown */}
              {notificationsOpen && (
                <div
                  className="fixed inset-0 z-40 bg-transparent"
                  onClick={() => setNotificationsOpen(false)}
                ></div>
              )}

              <button
                onClick={copyIp}
                className="hidden sm:flex lg:hidden xl:flex items-center gap-3 h-10 px-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/30 transition-all group cursor-pointer relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-white transition-colors">content_copy</span>
                <span className="text-xs font-bold text-gray-300 group-hover:text-white tracking-widest uppercase">{serverIp}</span>
              </button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex items-center justify-center h-10 w-10 lg:hidden rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-40 bg-black/90 backdrop-blur-3xl transition-opacity duration-300 lg:hidden ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex flex-col items-center justify-center h-full gap-8 p-6">
          {navLinks.map((link, idx) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`text-2xl font-black uppercase tracking-tight transition-all transform hover:scale-110 ${isActive(link.path) ? 'text-white scale-110 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]' : 'text-transparent bg-clip-text bg-gradient-to-b from-white/80 to-white/20'
                }`}
              style={{ transitionDelay: `${idx * 50}ms` }}
            >
              {link.name}
            </Link>
          ))}

          <div className="mt-8 p-6 w-full max-w-xs rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Server IP</span>
            <div
              onClick={copyIp}
              className="flex items-center gap-2 text-white font-mono text-lg cursor-pointer active:scale-95 transition-transform"
            >
              {serverIp}
              <span className="material-symbols-outlined text-sm opacity-50">content_copy</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
