
import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="w-full mt-auto relative z-10">
      {/* Gradient divider line */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

      <div className="glass-card bg-black/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col justify-center items-center gap-3">

          {/* Brand */}
          <div className="flex flex-col gap-4 text-center items-center">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="size-8 flex items-center justify-center rounded-lg transition-transform group-hover:scale-110 group-hover:rotate-3">
                <img src="/site-icon-rack-white.svg" alt="Server Manfredonia Logo" className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
              </div>
              <h5 className="text-white font-bold text-lg tracking-tight uppercase group-hover:text-shadow-glow transition-all">Server Manfredonia</h5>
            </Link>
            <p className="text-gray-500 text-xs font-mono tracking-wide">
              © 2026 Server Manfredonia.<br />Not affiliated with Mojang Studios.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
