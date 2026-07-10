import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useConfig } from '../../contexts/ConfigContext';

const BottomTabBar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { config } = useConfig();

    const handleNav = async (path: string) => {
        await Haptics.impact({ style: ImpactStyle.Light });
        navigate(path);
    };

    const navItems = [
        { id: 'app', label: 'Monitor', icon: 'speed', path: '/app' },
        { id: 'dash', label: 'Dash', icon: 'terminal', path: '/dashboard' },
        ...(config?.isBlogEnabled ? [{ id: 'blog', label: 'Blog', icon: 'article', path: '/blog' }] : []),
        { id: 'updates', label: 'Intel', icon: 'newspaper', path: '/updates' },
        { id: 'acc', label: 'Account', icon: 'badge', path: '/app-account' },
    ];

    return (
        <div className="fixed bottom-0 left-0 w-full z-[100] px-6 pb-[calc(env(safe-area-inset-bottom,1.5rem)+1.5rem)] pt-2 pointer-events-none">
            <nav className="max-w-md mx-auto bg-[#0A0A0A]/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-2 flex justify-between items-center shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] pointer-events-auto relative">
                {/* Glossy overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent rounded-2xl pointer-events-none" />

                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;

                    return (
                        <button
                            key={item.id}
                            onClick={() => handleNav(item.path)}
                            className="relative flex flex-col items-center justify-center h-14 w-full group active:scale-95 transition-transform"
                        >
                            <div className="relative flex items-center justify-center">
                                <span className={`material-symbols-outlined transition-all duration-300 ${isActive
                                    ? 'text-white scale-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                                    : 'text-white/30 group-hover:text-white/50'
                                    }`} style={{ fontSize: '24px', fontWeight: '200' }}>
                                    {item.icon}
                                </span>

                                {isActive && (
                                    <motion.div
                                        layoutId="tabGlowRing"
                                        className="absolute -inset-3 bg-white/10 blur-xl rounded-full -z-10"
                                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    />
                                )}
                            </div>

                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] mt-1 transition-all duration-300 ${isActive ? 'text-white opacity-100 translate-y-0' : 'text-white/20 opacity-0 translate-y-1'
                                }`}>
                                {item.label}
                            </span>

                            {isActive && (
                                <motion.div
                                    layoutId="activeTabIndicator"
                                    className="absolute -bottom-1 size-1 bg-white rounded-full shadow-[0_0_8px_white]"
                                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                                />
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default BottomTabBar;
