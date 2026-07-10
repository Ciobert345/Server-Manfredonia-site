
import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Modpack from './pages/Modpack';
import Utilities from './pages/Utilities';
import Dashboard from './pages/Dashboard';
import DashboardTutorial from './pages/DashboardTutorial';
import Updates from './pages/Updates';
import Information from './pages/Information';
import Mobile from './pages/Mobile';
import MobileAccount from './pages/MobileAccount';
import Account from './pages/Account';
import AppHome from './pages/app/AppHome';
import AppAccount from './pages/app/AppAccount';
import Admin from './pages/Admin';
import ResetPassword from './pages/ResetPassword';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Terminal from './components/Terminal';
import LoginModal from './components/LoginModal';
import { useAuth } from './contexts/AuthContext';
import { useConfig } from './contexts/ConfigContext';
import { useModal } from './contexts/ModalContext';
import { motion, AnimatePresence } from 'framer-motion';
import { shouldRedirectToMobile, isMobilePhone, isNativeApp, resetViewMode } from './utils/deviceDetection';
import PendingApprovalBanner from './components/PendingApprovalBanner';
import BottomTabBar from './components/app/BottomTabBar';
import NativeLoginGate from './components/app/NativeLoginGate';
import AppDashboard from './pages/app/AppDashboard';
import AppUpdates from './pages/app/AppUpdates';

const AppContent: React.FC = () => {
  const { isAuthModalOpen, setAuthModalOpen, user, loading } = useAuth();
  const { config } = useConfig();
  const { isModalOpen } = useModal();
  const location = useLocation();
  const isMobilePage = location.pathname === '/mobile' || location.pathname === '/mobile-account' || location.pathname === '/app' || location.pathname === '/app-account';
  const isAppView = isNativeApp() || location.pathname === '/app' || location.pathname === '/app-account';
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [activeEgg, setActiveEgg] = useState<string | null>(null);
  const [isFabioOpen, setIsFabioOpen] = useState(false);

  // Emergency Lockdown Check
  const isEmergencyActive = config?.isEmergencyEnabled && !user?.isAdmin;

  // Scroll to MobileDashboardCard when navigating to dashboard
  useEffect(() => {
    if (location.pathname === '/dashboard') {
      // Add a small delay to ensure the component is rendered
      setTimeout(() => {
        const mobileCard = document.querySelector('[data-mobile-dashboard-card]');
        if (mobileCard) {
          mobileCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          // Fallback: scroll to a reasonable position where the card should be
          window.scrollTo({ top: 400, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [location.pathname]);

  const hasLogged = React.useRef(false);
  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    const branding = `
%c  █▀▄▀█  █▀█  █▄ █  █▀▀  █▀▄  █▀▀  █▀▄  █▀█  █▄ █  █  █▀█
  █ ▀ █  █▀█  █ ▀█  █▀▀  █▀▄  █▀▀  █▄▀  █▄█  █ ▀█  █  █▀█
%c  ░▀ ▀░  ░▀▀  ░▀ ▀  ░▀▀  ░▀▀  ░▀▀  ░▀▀  ░▀▀  ░▀ ▀  ░  ░▀▀

%c  [ v4.0.0 ] • STATUS: LINK_ESTABLISHED • ACCESS: GRANTED
`;
    console.log(
      branding,
      "color: #fbbf24; font-family: monospace; font-size: 10px; font-weight: bold; text-shadow: 0 0 8px rgba(251, 191, 36, 0.6), 0 0 12px rgba(251, 191, 36, 0.2);",
      "color: rgba(251, 191, 36, 0.4); font-family: monospace; font-size: 10px; font-weight: bold; text-shadow: 0 0 4px rgba(251, 191, 36, 0.1);",
      "color: #71717a; font-family: monospace; font-size: 8px; letter-spacing: 2px; margin-top: 6px;"
    );
  }, [isMobilePage, user, config]);

  useEffect(() => {
    const validAppPaths = ['/app', '/app-account', '/dashboard', '/updates'];
    if (isNativeApp() && !validAppPaths.includes(location.pathname)) {
      window.location.hash = '#/app';
      return;
    }
    if (shouldRedirectToMobile() && !isMobilePage && location.pathname !== '/mobile-account' && !isNativeApp()) {
      window.location.hash = '#/mobile';
    }
  }, [isMobilePage]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isAltT = e.altKey && (e.key?.toLowerCase() === 't' || (e as any).code === 'KeyT');
      const isCtrlShiftK = e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k';

      if (
        (isAltT || isCtrlShiftK) &&
        !isMobilePage &&
        !isMobilePhone() &&
        user &&
        (user.isApproved || user.isAdmin) &&
        (config?.isTerminalEnabled || user?.isAdmin || user?.permissions?.terminal)
      ) {
        e.preventDefault();
        setIsTerminalOpen(prev => !prev);
      }
    };


    const handleEasterEgg = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setActiveEgg(detail);

      if (detail === 'clear' || detail === 'exit' || detail === 'kill') {
        setActiveEgg(null);
        document.body.style.filter = '';
        document.body.style.animation = '';
        document.body.style.transform = '';
        const disco = document.getElementById('disco-style');
        if (disco) disco.remove();
        const glitch = document.getElementById('glitch-style');
        if (glitch) glitch.remove();
        return;
      }

      if (detail === 'gravity') {
        document.body.style.transition = 'transform 2s ease-in';
        document.body.style.transform = 'translateY(100vh) rotate(10deg)';
        setTimeout(() => {
          document.body.style.transform = '';
          setActiveEgg(null);
        }, 5000);
      }

      if (detail === 'crash') {
        const style = document.createElement('style');
        style.id = 'glitch-style';
        style.textContent = `
          @keyframes glitch {
            0% { transform: translate(0) }
            20% { transform: translate(-5px, 5px) skew(5deg) }
            40% { transform: translate(5px, -5px) skew(-5deg) }
            60% { transform: translate(-5px, -2px) }
            80% { transform: translate(2px, 2px) }
            100% { transform: translate(0) }
          }
          .glitch-active {
            animation: glitch 0.2s infinite;
            filter: hue-rotate(90deg) contrast(150%) brightness(120%);
          }
        `;
        document.head.appendChild(style);
        document.body.classList.add('glitch-active');
        setTimeout(() => {
          document.body.classList.remove('glitch-active');
          if (style) style.remove();
          setActiveEgg(null);
        }, 3000);
      }

      if (detail === 'disco') {
        document.body.style.animation = 'disco-bg 1s infinite alternate';
        const style = document.createElement('style');
        style.id = 'disco-style';
        style.textContent = `
          @keyframes disco-bg {
            from { background-color: #ff000022; }
            to { background-color: #0000ff22; }
          }
        `;
        document.head.appendChild(style);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('easter-egg', handleEasterEgg);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('easter-egg', handleEasterEgg);
    };
  }, [isMobilePage, user, config]);

  return (
    <div className={isMobilePage ? '' : 'min-h-screen flex flex-col relative text-white'}>
      <PendingApprovalBanner />
      {/* GLOBAL EMERGENCY LOCKDOWN SCREEN */}
      <AnimatePresence>
        {isEmergencyActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 text-center"
          >
            {/* Animated Background */}
            <div className="absolute inset-0 overflow-hidden">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
                className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(239,68,68,0.03)_90deg,transparent_180deg)] pointer-events-none"
              />
            </div>

            {/* Warning Icon */}
            <div className="size-32 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mb-8 relative">
              <span className="material-symbols-outlined text-red-500 text-6xl">lock</span>
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-red-500 mb-4">
              Sistema in Lockdown
            </h1>

            {/* Subtitle */}
            <p className="text-white/40 text-lg max-w-md mb-8 leading-relaxed">
              L'accesso al sito è stato temporaneamente sospeso per motivi di sicurezza. Solo gli amministratori possono accedere.
            </p>

            {/* Error Code */}
            <div className="flex flex-col items-center gap-4">
              <div className="h-px w-32 bg-red-500/20" />
              <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em]">
                Order 66 Active • ERR_GLOBAL_LOCKDOWN
              </p>
            </div>

            {/* Hint */}
            <p className="mt-12 text-[10px] text-white/10 uppercase tracking-widest">
              Contatta un amministratore per maggiori informazioni
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Perspective Void logic moved inside terminal mode container below */}

      <AnimatePresence mode="wait">
        {loading && !isNativeApp() ? (
          <div key="loading" className="fixed inset-0 bg-black flex items-center justify-center">
            <div className="size-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          </div>
        ) : !user && isNativeApp() ? (
          <NativeLoginGate key="native-gate" />
        ) : !isTerminalOpen ? (
          <motion.div
            key="site-normal"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: 0.9,
              filter: 'blur(10px)',
              transition: { duration: 0.6, ease: "circOut" }
            }}
            className="flex flex-col min-h-screen w-full relative z-10"
          >
            {!(isMobilePage || isAppView || isModalOpen) && <Navbar />}
            <main className={(isMobilePage || isAppView) ? 'flex-grow relative' : 'flex-grow'}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/modpack" element={<Modpack />} />
                <Route path="/utilities" element={<Utilities />} />
                <Route path="/dashboard" element={isNativeApp() ? <AppDashboard /> : <Dashboard />} />
                <Route path="/dashboard-tutorial" element={<DashboardTutorial />} />
                <Route path="/updates" element={isNativeApp() ? <AppUpdates /> : <Updates />} />
                <Route path="/info" element={<Information />} />
                <Route path="/mobile" element={<Mobile />} />
                <Route path="/account" element={<Account />} />
                <Route path="/mobile-account" element={<MobileAccount />} />
                <Route path="/app" element={<AppHome />} />
                <Route path="/app-account" element={<AppAccount />} />
                <Route path="/blog" element={<Blog />} />
                <Route path="/blog/:slug" element={<BlogPost />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </main>
            {isNativeApp() && <BottomTabBar />}
            {!(isMobilePage || isAppView || isModalOpen) && <Footer />}
          </motion.div>
        ) : (
          <motion.div
            key="terminal-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-10 overflow-hidden bg-black"
          >
            {/* Cinematic Perspective Void - Reintegrated */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0 opacity-[0.35] bg-[linear-gradient(rgba(34,211,238,.3)_1.5px,transparent_1.5px),linear-gradient(90deg,rgba(34,211,238,.3)_1.5px,transparent_1.5px)] bg-[size:100px_100px] [transform:perspective(1000px)_rotateX(60deg)_translateY(-100px)] origin-center"></div>
              <motion.div
                animate={{ y: [0, 50] }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 opacity-[0.25] bg-[linear-gradient(rgba(16,185,129,.15)_2px,transparent_2px),linear-gradient(90deg,rgba(16,185,129,.15)_2px,transparent_2px)] bg-[size:40px_40px] [transform:perspective(800px)_rotateX(65deg)_translateY(-50px)] origin-center"
              ></motion.div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.7)_100%)]"></div>

              {/* Dynamic Glitch Character Streams - Reintegrated */}
              <div className="absolute inset-0 opacity-[0.15] pointer-events-none select-none flex justify-around overflow-hidden">
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ y: ['-100%', '100%'] }}
                    transition={{
                      duration: Math.random() * 6 + 3,
                      repeat: Infinity,
                      ease: "linear",
                      delay: Math.random() * 5
                    }}
                    className="text-[14px] font-mono text-emerald-400 flex flex-col items-center"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    {"0101XYZ#§$%&/()=?*+~<>|[]{}".split('').sort(() => Math.random() - 0.5).join('')}
                  </motion.div>
                ))}
              </div>
              <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%]"></div>
            </div>
            {/* TERMINAL CONTAINER */}
            <div className={`w-full h-[82vh] flex items-center justify-center relative z-10 ${isFabioOpen ? 'pr-[280px] lg:pr-[340px] xl:pr-[410px]' : (user?.isApproved || user?.isAdmin) && (config?.isTerminalEnabled || user?.isAdmin || user?.permissions?.terminal) ? 'pr-[200px]' : ''} transition-all duration-300`}>
              <div className={`w-full h-full flex items-center justify-center ${isFabioOpen ? 'max-w-full' : 'max-w-7xl'} transition-all duration-300`}>
                <Terminal
                  isOpen={isTerminalOpen}
                  onClose={() => setIsTerminalOpen(false)}
                />
              </div>
            </div>

            {/* FABIO EXPANDABLE ICON - OUTSIDE TERMINAL */}
            <AnimatePresence>
              {!isFabioOpen && !isMobilePage && !isMobilePhone() && (user?.isApproved || user?.isAdmin) && (config?.isTerminalEnabled || user?.isAdmin || user?.permissions?.terminal) && (
                <motion.button
                  key="fabio-icon"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  whileHover={{ scale: 1.02, boxShadow: "0 0 50px rgba(16,185,129,0.5)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsFabioOpen(true)}
                  className="flex fixed right-4 top-1/2 -translate-y-1/2 z-[150] w-[180px] rounded-[1.5rem] bg-gradient-to-b from-emerald-900/50 to-black/90 border-2 border-emerald-500/40 flex-col items-center justify-center shadow-[0_0_50px_rgba(16,185,129,0.25)] cursor-pointer backdrop-blur-xl p-5 gap-4"
                >
                  {/* Notification Badge - No Animation */}
                  <div className="absolute top-3 right-3 size-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.8)] border border-emerald-300">
                    <span className="text-[10px] text-black font-black">!</span>
                  </div>

                  {/* ASCII Art Container - Full 16-line Art */}
                  <div className="w-full bg-black/80 rounded-xl border border-emerald-500/30 py-3 px-1 flex items-center justify-center">
                    <pre className="font-mono text-[5px] leading-[1.4] text-emerald-400 whitespace-pre select-none">{`⠀⠀⠀⠀⠀⠀⠀⠀⡴⡺⢻⣴⢶⣦⡤⢄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢰⢁⣀⡀⠀⣒⡒⠲⢯⠄⣙⠥⢒⠄⡀⠀⠀⠀⠀
⠀⠀⠀⣀⣀⣠⣤⣾⢥⣧⣀⣩⡋⠉⠛⠛⠶⣤⣈⠐⠢⠈⡆⠀⠀⠀
⠀⠰⣿⡽⠟⡙⣬⣼⣲⣤⣯⣭⡟⣿⣤⣲⠄⣈⠈⠉⠢⣰⠀⠀⠀⠀
⠀⠀⠈⠑⠦⣂⢠⠁⠀⠀⠀⠀⠈⠉⠘⠫⠝⣦⣭⣐⢤⣘⠀⠀⠀⠀
⠀⠀⠀⢠⣶⣾⣷⣤⡀⣠⣄⣀⡀⠀⠀⠀⠀⠀⣉⡐⢭⠛⠧⢦⣀⠀
⠀⠀⠀⠀⢳⣩⠏⢻⠟⣇⠀⢻⠟⢷⢴⠖⠒⠲⠋⠉⠉⣧⠨⠺⠈⢦
⠀⠀⠀⠀⠀⠹⡓⠙⠀⠘⣦⠀⣀⠜⠀⠀⠀⠀⠀⢁⢸⠋⠉⠉⠉⠉
⠀⠀⠀⠀⠀⠀⢇⠣⠔⠒⠚⠄⠀⡀⠀⠀⠀⡠⠊⣱⡃⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠾⠲⢷⠷⠤⠘⡀⠀⢀⠀⣰⠛⠒⠸⢯⠢⡀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠐⢀⡬⠒⠁⠈⠠⠊⢈⡀⠁⠲⠤⢀
⠀⠀⠀⠀⡀⠤⠚⠢⢤⢀⡠⢤⠔⠈⠀⠀⢀⡔⠁⠀⡘⠀⠀⠀⡆⠀
⢀⠤⠂⠁⠀⠀⠀⡰⢁⠒⠥⢢⣁⢂⡀⠔⠉⠀⠀⡔⠀⠀⠀⠀⡁⠀
⢸⠀⠀⠀⠀⠀⡔⠁⢸⠐⠠⣤⣯⣯⠭⠥⠀⡇⡰⠀⠀⠀⠀⠀⡇⠀
⠘⠀⠀⠀⢀⠌⠀⠀⠀⡄⢀⣠⠏⠙⢅⠢⠀⣧⠁⠀⠀⠀⠀⢸⠁⠀
⠀⢁⠀⠀⠈⠐⢄⠀⠀⡍⠉⠿⠀⠀⠆⠑⠤⠃⠀⠀⠀⠀⠀⠸⠀⠀`}</pre>
                  </div>

                  {/* Name Label */}
                  <span className="text-[11px] text-emerald-400 uppercase tracking-[0.3em] font-black">FABIO</span>

                  {/* Notification Text */}
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-[9px] text-center text-white/80 leading-snug font-medium bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5"
                  >
                    Ti devo parlare...
                  </motion.div>
                </motion.button>
              )}

              {/* FABIO CARD - Fixed position, never overlaps */}
              {isFabioOpen && !isMobilePage && !isMobilePhone() && (user?.isApproved || user?.isAdmin) && (config?.isTerminalEnabled || user?.isAdmin || user?.permissions?.terminal) && (
                <motion.div
                  key="fabio-card"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  className="flex fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-[160] w-[260px] lg:w-[320px] xl:w-[380px] max-h-[82vh] min-h-0 bg-black/90 border border-white/10 rounded-[2rem] p-5 xl:p-8 flex-col gap-4 xl:gap-6 overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none rounded-[2rem]" />

                  {/* Close Button */}
                  <button
                    onClick={() => setIsFabioOpen(false)}
                    className="absolute top-4 right-4 z-10 size-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>

                  {/* ASCII Art - FULL SIZE */}
                  <div className="relative font-mono text-[10px] xl:text-[12px] leading-tight text-emerald-400 whitespace-pre overflow-hidden flex flex-col items-center py-8 bg-black/50 rounded-2xl border border-white/5">
                    {`⠀⠀⠀⠀⠀⠀⠀⠀⡴⡺⢻⣴⢶⣦⡤⢄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⢰⢁⣀⡀⠀⣒⡒⠲⢯⠄⣙⠥⢒⠄⡀⠀⠀⠀⠀
⠀⠀⠀⣀⣀⣠⣤⣾⢥⣧⣀⣩⡋⠉⠛⠛⠶⣤⣈⠐⠢⠈⡆⠀⠀⠀
⠀⠰⣿⡽⠟⡙⣬⣼⣲⣤⣯⣭⡟⣿⣤⣲⠄⣈⠈⠉⠢⣰⠀⠀⠀⠀
⠀⠀⠈⠑⠦⣂⢠⠁⠀⠀⠀⠀⠈⠉⠘⠫⠝⣦⣭⣐⢤⣘⠀⠀⠀⠀
⠀⠀⠀⢠⣶⣾⣷⣤⡀⣠⣄⣀⡀⠀⠀⠀⠀⠀⣉⡐⢭⠛⠧⢦⣀⠀
⠀⠀⠀⠀⢳⣩⠏⢻⠟⣇⠀⢻⠟⢷⢴⠖⠒⠲⠋⠉⠉⣧⠨⠺⠈⢦
⠀⠀⠀⠀⠀⠹⡓⠙⠀⠘⣦⠀⣀⠜⠀⠀⠀⠀⠀⢁⢸⠋⠉⠉⠉⠉
⠀⠀⠀⠀⠀⠀⢇⠣⠔⠒⠚⠄⠀⡀⠀⠀⠀⡠⠊⣱⡃⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠾⠲⢷⠷⠤⠘⡀⠀⢀⠀⣰⠛⠒⠸⢯⠢⡀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⢸⠀⠀⠀⠀⠀⠐⢀⡬⠒⠁⠈⠠⠊⢈⡀⠁⠲⠤⢀
⠀⠀⠀⠀⡀⠤⠚⠢⢤⢀⡠⢤⠔⠈⠀⠀⢀⡔⠁⠀⡘⠀⠀⠀⡆⠀
⢀⠤⠂⠁⠀⠀⠀⡰⢁⠒⠥⢢⣁⢂⡀⠔⠉⠀⠀⡔⠀⠀⠀⠀⡁⠀
⢸⠀⠀⠀⠀⠀⡔⠁⢸⠐⠠⣤⣯⣯⠭⠥⠀⡇⡰⠀⠀⠀⠀⠀⡇⠀
⠘⠀⠀⠀⢀⠌⠀⠀⠀⡄⢀⣠⠏⠙⢅⠢⠀⣧⠁⠀⠀⠀⠀⢸⠁⠀
⠀⢁⠀⠀⠈⠐⢄⠀⠀⡍⠉⠿⠀⠀⠆⠑⠤⠃⠀⠀⠀⠀⠀⠸⠀⠀`}
                  </div>

                  {/* Header */}
                  <div className="flex flex-col gap-1 relative z-10">
                    <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-[0.5em] font-bold">Protocol Assistant</span>
                    <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white">FABIO <span className="text-white/10 italic">Core_v4</span></h3>
                  </div>

                  {/* Guide Text */}
                  <div className="flex-1 min-h-0 space-y-5 text-[12px] font-medium text-white/50 leading-relaxed relative z-10 overflow-y-auto pr-2 custom-scrollbar">
                    <p>
                      Salve, Operativo. Sono <span className="text-emerald-400 font-bold">FABIO</span>. Il mio compito è guidarti attraverso il Manfredonia Shell.
                    </p>
                    <p>
                      Esplora le cartelle usando <span className="font-mono text-white/80 px-1.5 py-0.5 rounded bg-white/10 italic">ls</span>, <span className="font-mono text-white/80 px-1.5 py-0.5 rounded bg-white/10 italic">cd</span> e <span className="font-mono text-white/80 px-1.5 py-0.5 rounded bg-white/10 italic">cat</span>. Trova gli <span className="text-white/80 font-bold">Access Codes</span> per attivare i protocolli speciali.
                    </p>
                    <p>
                      Il successo nelle simulazioni fornisce <span className="text-emerald-400 font-bold">XP</span>, essenziali per decriptare i nodi classificati della sezione <span className="text-white uppercase tracking-widest border-l-2 border-emerald-500 pl-2">Intel</span>.
                    </p>
                    <p className="text-[11px] italic border-t border-white/5 pt-5 leading-loose">
                      Nota: <span className="text-emerald-400">Comandi non documentati</span> scatenano anomalie <span className="text-emerald-400 font-bold italic">"ciobbose"</span> sulla realtà visiva del sito.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Auth Modal Overlay */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAuthModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            ></motion.div>

            {/* Modal Container */}
            <div className="relative z-10 w-full max-w-[440px]">
              <LoginModal />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Matrix Overlay (Easter Egg) */}
      {
        activeEgg === 'matrix' && (
          <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ y: -1000, opacity: 0 }}
                animate={{ y: '120vh', opacity: [0, 0.4, 0.1, 0] }}
                transition={{
                  duration: Math.random() * 5 + 5,
                  repeat: Infinity,
                  ease: "linear",
                  delay: Math.random() * 5
                }}
                className="absolute text-emerald-500/80 font-mono text-sm md:text-base font-bold select-none blur-[0.5px] whitespace-pre"
                style={{
                  left: `${Math.random() * 100}%`,
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright'
                }}
              >
                {Array.from({ length: 30 }).map(() =>
                  String.fromCharCode(0x30A0 + Math.random() * 96)
                ).join(' ')}
              </motion.div>
            ))}
            {/* Layer 2 - Faster/Smaller */}
            {Array.from({ length: 40 }).map((_, i) => (
              <motion.div
                key={`layer2-${i}`}
                initial={{ y: -1000, opacity: 0 }}
                animate={{ y: '120vh', opacity: [0, 0.3, 0] }}
                transition={{
                  duration: Math.random() * 4 + 3,
                  repeat: Infinity,
                  ease: "linear",
                  delay: Math.random() * 5
                }}
                className="absolute text-emerald-400/40 font-mono text-xs select-none whitespace-pre"
                style={{
                  left: `${Math.random() * 100}%`,
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright'
                }}
              >
                {Array.from({ length: 20 }).map(() =>
                  Math.random() > 0.5 ? '1' : '0'
                ).join(' ')}
              </motion.div>
            ))}
          </div>
        )
      }
    </div >
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
