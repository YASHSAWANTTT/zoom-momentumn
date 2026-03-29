import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';

const customStyles = {
  bgBlue: '#0044CC',
  fontSerifItalic: {
    fontFamily: "'Playfair Display', serif",
    fontStyle: 'italic',
    fontWeight: 400,
  },
};

const GlobalStyles = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,400&family=Space+Mono:wght@400;700&display=swap');
      
      :root {
        --bg-blue: #0044CC;
        --grid-color: rgba(255, 255, 255, 0.08);
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background-color: var(--bg-blue);
        color: #ffffff;
        font-family: 'Space Mono', monospace;
        overflow: hidden;
      }
      ::selection { background: #facc15; color: #1e3a5f; }
      .font-serif-italic {
        font-family: 'Playfair Display', serif;
        font-style: italic;
        font-weight: 400;
      }
      .bg-grid {
        background-size: 60px 60px;
        background-image:
          linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
          linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px);
        mask-image: radial-gradient(circle at center, black 60%, transparent 100%);
        -webkit-mask-image: radial-gradient(circle at center, black 60%, transparent 100%);
      }
      @keyframes float-slow {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-20px); }
      }
      @keyframes float-medium {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-15px); }
      }
      @keyframes float-fast {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
      .animate-float-medium { animation: float-medium 5s ease-in-out infinite; }
      .animate-float-fast { animation: float-fast 4s ease-in-out infinite; }
      .delay-100 { animation-delay: 100ms; }
      .delay-200 { animation-delay: 200ms; }
      .delay-300 { animation-delay: 300ms; }
      .delay-500 { animation-delay: 500ms; }
      .delay-700 { animation-delay: 700ms; }
      .delay-1000 { animation-delay: 1000ms; }
      .pixel-art {
        image-rendering: pixelated;
        shape-rendering: crispEdges;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 0.8; transform: translateY(0); }
      }
      .animate-fade-in-delay-1 {
        opacity: 0;
        animation: fadeIn 1s ease-out 1s forwards;
      }
      .animate-fade-in-delay-1-5 {
        opacity: 0;
        animation: fadeIn 1s ease-out 1.5s forwards;
      }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
      .animate-bounce-custom { animation: bounce 1s ease-in-out infinite; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  return null;
};

const PixelFlowerRed = () => (
  <svg viewBox="0 0 12 16" className="w-full h-full pixel-art" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.3))' }}>
    <rect x="4" y="0" width="4" height="4" fill="#FF3333" />
    <rect x="4" y="8" width="4" height="4" fill="#FF3333" />
    <rect x="0" y="4" width="4" height="4" fill="#FF3333" />
    <rect x="8" y="4" width="4" height="4" fill="#FF3333" />
    <rect x="4" y="4" width="4" height="4" fill="#FFD700" />
    <rect x="4" y="12" width="4" height="4" fill="#228B22" />
  </svg>
);

const PixelFlowerYellow = () => (
  <svg viewBox="0 0 12 16" className="w-full h-full pixel-art" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.3))' }}>
    <rect x="4" y="0" width="4" height="4" fill="#FFD700" />
    <rect x="4" y="8" width="4" height="4" fill="#FFD700" />
    <rect x="0" y="4" width="4" height="4" fill="#FFD700" />
    <rect x="8" y="4" width="4" height="4" fill="#FFD700" />
    <rect x="4" y="4" width="4" height="4" fill="#8B4513" />
    <rect x="4" y="12" width="4" height="4" fill="#228B22" />
  </svg>
);

const PixelFlowerTall = ({ withLeaf = false }) => (
  <svg viewBox="0 0 12 20" className="w-full h-full pixel-art" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,0.3))' }}>
    <rect x="4" y="0" width="4" height="4" fill="#FF3333" />
    <rect x="4" y="8" width="4" height="4" fill="#FF3333" />
    <rect x="0" y="4" width="4" height="4" fill="#FF3333" />
    <rect x="8" y="4" width="4" height="4" fill="#FF3333" />
    <rect x="4" y="4" width="4" height="4" fill="#FFD700" />
    <rect x="4" y="12" width="4" height="8" fill="#228B22" />
    {withLeaf && <rect x="8" y="14" width="2" height="2" fill="#228B22" />}
  </svg>
);

const FloatingFlowers = ({ containerRef }) => {
  const flowersRef = useRef([]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const x = (window.innerWidth / 2 - e.pageX) / 50;
      const y = (window.innerHeight / 2 - e.pageY) / 50;
      flowersRef.current.forEach((el, index) => {
        if (el) {
          const speed = (index + 1) * 0.5;
          el.style.transform = `translate(${x * speed}px, ${y * speed}px)`;
        }
      });
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const setRef = (index) => (el) => {
    flowersRef.current[index] = el;
  };

  return (
    <div className="absolute inset-0 z-0 overflow-hidden" style={{ pointerEvents: 'none' }}>
      <div ref={setRef(0)} className="absolute animate-float-medium delay-100" style={{ top: '15%', left: '10%', width: '2rem', height: '2rem', opacity: 0.9 }}>
        <PixelFlowerRed />
      </div>
      <div ref={setRef(1)} className="absolute animate-float-slow delay-500" style={{ top: '8%', left: '25%', width: '1.5rem', height: '1.5rem', opacity: 0.8 }}>
        <PixelFlowerYellow />
      </div>
      <div ref={setRef(2)} className="absolute animate-float-fast delay-300" style={{ top: '20%', right: '15%', width: '2.5rem', height: '2.5rem', opacity: 0.85 }}>
        <PixelFlowerTall />
      </div>
      <div ref={setRef(3)} className="absolute animate-float-slow delay-700" style={{ bottom: '20%', left: '8%', width: '1.75rem', height: '1.75rem', opacity: 0.8 }}>
        <PixelFlowerYellow />
      </div>
      <div ref={setRef(4)} className="absolute animate-float-medium delay-1000" style={{ bottom: '25%', right: '20%', width: '2.25rem', height: '2.25rem', opacity: 0.9 }}>
        <PixelFlowerTall withLeaf={true} />
      </div>
      <div ref={setRef(5)} className="absolute animate-float-slow" style={{ top: '40%', left: '10%', width: '1rem', height: '1rem', opacity: 0.6 }}>
        <PixelFlowerYellow />
      </div>
      <div ref={setRef(6)} className="absolute animate-float-slow delay-200" style={{ top: '60%', right: '8%', width: '1.25rem', height: '1.25rem', opacity: 0.7 }}>
        <PixelFlowerRed />
      </div>
    </div>
  );
};

const CenterFlower = () => (
  <svg viewBox="0 0 24 60" className="w-full h-full pixel-art overflow-visible" preserveAspectRatio="xMidYMax">
    <rect x="10" y="24" width="4" height="36" fill="#008000" />
    <rect x="6" y="44" width="4" height="4" fill="#006400" />
    <rect x="2" y="40" width="4" height="4" fill="#006400" />
    <rect x="14" y="36" width="4" height="4" fill="#006400" />
    <rect x="18" y="32" width="4" height="4" fill="#006400" />
    <rect x="8" y="8" width="8" height="8" fill="#5C3317" />
    <rect x="8" y="0" width="8" height="8" fill="#FFD700" />
    <rect x="8" y="16" width="8" height="8" fill="#FFD700" />
    <rect x="0" y="8" width="8" height="8" fill="#FFD700" />
    <rect x="16" y="8" width="8" height="8" fill="#FFD700" />
    <rect x="4" y="4" width="4" height="4" fill="#FFD700" opacity="0.8" />
    <rect x="16" y="4" width="4" height="4" fill="#FFD700" opacity="0.8" />
    <rect x="4" y="16" width="4" height="4" fill="#FFD700" opacity="0.8" />
    <rect x="16" y="16" width="4" height="4" fill="#FFD700" opacity="0.8" />
  </svg>
);

const WorksDropdown = () => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative py-1"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="flex items-center gap-1 cursor-pointer group">
        <span
          className="relative z-10 transition-colors duration-300"
          style={{ color: open ? '#fde047' : 'white' }}
        >
          WORKS
        </span>
        <span
          className="text-xs transition-colors duration-300"
          style={{ color: open ? '#fde047' : 'white' }}
        >
          ▼
        </span>
        <span
          className="absolute bottom-0 left-0 h-0.5 bg-yellow-300 transition-all duration-300"
          style={{ width: open ? '100%' : '0%' }}
        />
      </div>
      {open && (
        <div
          className="absolute top-full left-0 mt-2 border rounded-sm shadow-xl"
          style={{
            backgroundColor: '#003399',
            borderColor: 'rgba(255,255,255,0.1)',
            minWidth: '200px',
            zIndex: 100,
          }}
        >
          {['ALL', 'DIGITAL ILLUSTRATION', '3D/GAME ASSETS', 'MOTION'].map((item) => (
            <a
              key={item}
              href="#"
              className="block px-5 py-3 text-sm font-bold transition-colors duration-200"
              style={{ fontFamily: "'Space Mono', monospace" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fde047';
                e.currentTarget.style.color = '#1e3a5f';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'white';
              }}
            >
              {item}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const NavLink = ({ children, href = '#' }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href={href}
      className="relative py-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="relative z-10 transition-colors duration-300"
        style={{ color: hovered ? '#fde047' : 'white' }}
      >
        {children}
      </span>
      <span
        className="absolute bottom-0 left-0 h-0.5 bg-yellow-300 transition-all duration-300"
        style={{ width: hovered ? '100%' : '0%' }}
      />
    </a>
  );
};

const SocialLink = ({ children }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="#"
      className="transition-colors duration-200"
      style={{ color: hovered ? '#fde047' : 'white' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </a>
  );
};

const HomePage = () => {
  return (
    <div
      className="h-screen w-full relative flex flex-col"
      style={{ backgroundColor: '#0044CC', color: '#ffffff', fontFamily: "'Space Mono', monospace", overflow: 'hidden' }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 z-0 bg-grid pointer-events-none"
      />

      {/* Floating flowers */}
      <FloatingFlowers />

      {/* Nav */}
      <nav className="relative z-50 w-full px-6 py-8 md:px-12 flex justify-between items-center">
        <div className="hidden md:block">
          <span className="text-xs uppercase opacity-70" style={{ letterSpacing: '0.2em' }}>
            Portfolio 2024
          </span>
        </div>

        <div className="flex-1 flex justify-center items-center gap-6 md:gap-12 text-sm md:text-base font-bold" style={{ letterSpacing: '0.05em' }}>
          <WorksDropdown />
          <NavLink>ABOUT</NavLink>
          <NavLink>CONTACT</NavLink>
        </div>

        <div className="hidden md:flex gap-4 opacity-70">
          <SocialLink>IG</SocialLink>
          <SocialLink>LI</SocialLink>
          <SocialLink>TW</SocialLink>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-grow flex flex-col items-center justify-center relative z-20 pb-20">
        <div className="relative group cursor-default">
          <h1
            className="font-serif-italic leading-none text-white flex items-end select-none"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontStyle: 'italic',
              fontWeight: 400,
              fontSize: '16vw',
              letterSpacing: '-0.03em',
              filter: 'drop-shadow(0 25px 25px rgba(0,0,0,0.15))',
            }}
          >
            <span>stephan</span>

            {/* Center flower */}
            <div
              className="relative flex flex-col justify-end items-center"
              style={{ marginLeft: '0.5vw', marginRight: '0.5vw', width: '4vw', height: '15vw' }}
            >
              <CenterFlower />
            </div>

            <span>e</span>
          </h1>

          {/* Labels */}
          <div
            className="absolute text-xs md:text-sm font-bold animate-fade-in-delay-1"
            style={{ top: '-2rem', left: '1rem', letterSpacing: '0.1em' }}
          >
            CREATIVE DEVELOPER
          </div>
          <div
            className="absolute text-xs md:text-sm font-bold animate-fade-in-delay-1-5"
            style={{ bottom: '-1rem', right: '1rem', letterSpacing: '0.1em' }}
          >
            BASED IN PARIS
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 w-full p-6 flex justify-between items-end z-30 text-xs font-bold opacity-60" style={{ letterSpacing: '0.1em' }}>
        <div className="flex flex-col gap-2">
          <span>AVAILABLE FOR FREELANCE</span>
          <span>JUL 2024</span>
        </div>
        <div className="animate-bounce-custom mb-2">↓ SCROLL</div>
        <div className="text-right flex flex-col gap-2">
          <span>© 2024 STEPHANIE</span>
          <span>ALL RIGHTS RESERVED</span>
        </div>
      </footer>
    </div>
  );
};

const App = () => {
  return (
    <>
      <GlobalStyles />
      <Router basename="/">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Router>
    </>
  );
};

export default App;