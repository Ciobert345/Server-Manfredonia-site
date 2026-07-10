import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const NativeLoginGate: React.FC = () => {
    const [isSignUp, setIsSignUp] = useState(false);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const emailRef = useRef<HTMLInputElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const confirmPasswordRef = useRef<HTMLInputElement>(null);

    const { login, signup, resetPassword } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const email = emailRef.current?.value || '';
        const password = passwordRef.current?.value || '';
        const username = usernameRef.current?.value || '';
        const confirm = confirmPasswordRef.current?.value || '';

        try {
            if (isForgotPassword) {
                await resetPassword(email);
                await Haptics.notification({ type: NotificationType.Success });
                setError("Recovery email sent."); // Use error field for simple feedback
            } else if (isSignUp) {
                if (password !== confirm) throw new Error("Passwords mismatch");
                await signup(email, password, username);
                await Haptics.notification({ type: NotificationType.Success });
                setIsSignUp(false);
                setError("Account requested. Awaiting approval.");
            } else {
                await login(email, password);
                await Haptics.impact({ style: ImpactStyle.Heavy });
            }
        } catch (err: any) {
            setError(err.message || "Access Denied");
            await Haptics.notification({ type: NotificationType.Error });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] bg-[#050505] flex flex-col items-center justify-center p-6 sm:p-10">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0%,transparent_70%)]" />
                <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm relative z-10 flex flex-col gap-10"
            >
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="size-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl mb-2">
                        <img src="/site-icon-rack-white.svg" alt="L" className="size-10 object-contain" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white leading-none">
                            {isForgotPassword ? 'Reset' : isSignUp ? 'Registry' : 'Login'} <br />
                            <span className="text-white/30 text-3xl">{isForgotPassword ? 'Codes' : isSignUp ? 'Request' : 'Terminal'}</span>
                        </h1>
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.5em] mt-4">
                            System_Identity_Verification
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {isSignUp && (
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Username</label>
                            <input
                                ref={usernameRef}
                                type="text"
                                className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-5 text-sm font-bold text-white outline-none focus:border-white transition-all"
                                placeholder="OPERATIVE_NAME"
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Email_Uplink</label>
                        <input
                            ref={emailRef}
                            type="email"
                            className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-5 text-sm font-bold text-white outline-none focus:border-white transition-all"
                            placeholder="EMAIL_ADDRESS"
                            required
                        />
                    </div>

                    {!isForgotPassword && (
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Pin_Code</label>
                            <div className="relative">
                                <input
                                    ref={passwordRef}
                                    type={showPassword ? "text" : "password"}
                                    className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-5 text-sm font-bold text-white outline-none focus:border-white transition-all pr-12"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20"
                                >
                                    <span className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {isSignUp && (
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Confirm_Codes</label>
                            <input
                                ref={confirmPasswordRef}
                                type={showPassword ? "text" : "password"}
                                className="w-full h-14 bg-white/5 border border-white/10 rounded-xl px-5 text-sm font-bold text-white outline-none focus:border-white transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    )}

                    {error && (
                        <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest text-center py-2 italic animate-pulse">
                            // {error}
                        </div>
                    )}

                    <button
                        disabled={loading}
                        className="w-full h-14 bg-white text-black rounded-xl font-black uppercase text-[11px] tracking-[.3em] shadow-2xl active:scale-95 transition-all mt-4 disabled:opacity-20 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Processing...' : isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Request Access' : 'Establish Link'}
                        {!loading && <span className="material-symbols-outlined text-lg">login</span>}
                    </button>
                </form>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => { setIsSignUp(!isSignUp); setIsForgotPassword(false); setError(null); }}
                        className="w-full py-2 text-[8px] font-black text-white/40 uppercase tracking-[.4em] hover:text-white transition-colors"
                    >
                        {isSignUp ? 'Already_Registered?_Login' : 'Need_Clearance?_Request_Registry'}
                    </button>
                    {!isSignUp && (
                        <button
                            onClick={() => { setIsForgotPassword(!isForgotPassword); setError(null); }}
                            className="w-full py-2 text-[8px] font-black text-white/20 uppercase tracking-[.4em] hover:text-white transition-colors"
                        >
                            {isForgotPassword ? 'Back_To_Terminal' : 'Incident_Report?_Forgot_Codes'}
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default NativeLoginGate;
