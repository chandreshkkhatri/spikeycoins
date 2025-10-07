'use client';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface NavBarProps {
  title?: string;
  showApiConfig?: boolean;
  onShowApiPanel?: () => void;
}

export default function NavBar({
  title = 'Flip Safe',
  showApiConfig = false,
  onShowApiPanel,
}: NavBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { isLoggedIn, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await logout();
      setIsMenuOpen(false);
    } catch (error) {
      // Swallow logout errors to avoid UI noise
    }
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/market-watch', label: 'Market Watch' },
    { href: '/orders', label: 'Orders' },
    { href: '/positions', label: 'Positions' },
    { href: '/holdings', label: 'Holdings' },
    { href: '/accounts', label: 'Accounts' },
  ];

  const isActiveRoute = (href: string) => pathname === href;

  return (
    <>
      <header className={`fs-navbar ${isDark ? 'dark' : ''}`}>
        <div className="fs-navbar-inner">
          <div className="left-group">
            <button
              className="menu-btn"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              <span className="hamburger" />
            </button>
            <Link href="/dashboard" className="brand" aria-label="Home">
              <span className="brand-accent">⚡</span> {title}
            </Link>
          </div>
          <nav className="nav-links">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActiveRoute(item.href) ? 'active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="right-group">
            {showApiConfig && (
              <button
                className="icon-btn"
                onClick={onShowApiPanel}
                aria-label="Configure API credentials"
                title="Configure API"
              >
                ⚙️
              </button>
            )}
            {isLoggedIn && (
              <button className="icon-btn" onClick={handleLogout} aria-label="Logout">
                ⏻
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile side navigation */}
      <ul className={`fs-drawer ${isMenuOpen ? 'open' : ''} ${isDark ? 'dark' : ''}`}>
        <li>
          <div className="drawer-head">
            <span className="name">{title}</span>
            <button className="close-btn" onClick={() => setIsMenuOpen(false)} aria-label="Close" />
          </div>
        </li>

        {navItems.map(item => (
          <li key={item.href} className={isActiveRoute(item.href) ? 'active' : ''}>
            <Link href={item.href} onClick={() => setIsMenuOpen(false)}>
              {item.label}
            </Link>
          </li>
        ))}

        <li>
          <div className="divider"></div>
        </li>

        {showApiConfig && (
          <li>
            <button
              onClick={() => {
                onShowApiPanel?.();
                setIsMenuOpen(false);
              }}
            >
              ⚙️ API Config
            </button>
          </li>
        )}

        {isLoggedIn && (
          <li>
            <button onClick={handleLogout}>Logout</button>
          </li>
        )}
      </ul>

      {/* Overlay for mobile menu */}
      {isMenuOpen && <div className="fs-drawer-overlay" onClick={() => setIsMenuOpen(false)} />}

      <style jsx>{`
        .fs-navbar {
          position: sticky;
          top: 0;
          width: 100%;
          backdrop-filter: blur(8px) saturate(160%);
          -webkit-backdrop-filter: blur(8px) saturate(160%);
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.6));
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          z-index: 100;
        }
        .fs-navbar.dark {
          background: linear-gradient(90deg, rgba(30, 41, 59, 0.9), rgba(30, 41, 59, 0.75));
          border-bottom-color: rgba(255, 255, 255, 0.08);
        }
        .fs-navbar-inner {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 1rem;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .left-group,
        .right-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .brand {
          font-weight: 600;
          font-size: 0.95rem;
          letter-spacing: 0.5px;
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .brand-accent {
          font-size: 1.05rem;
        }
        .nav-links {
          display: flex;
          gap: 0.25rem;
        }
        .nav-item {
          position: relative;
          padding: 0.45rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          text-decoration: none;
          color: var(--text-secondary);
          border-radius: 6px;
          line-height: 1;
          transition:
            background 0.25s var(--easing-spring),
            color 0.25s ease;
        }
        .dark .nav-item {
          color: var(--color-neutral);
        }
        .nav-item:hover {
          background: var(--surface-100);
          color: var(--text-primary);
        }
        .dark .nav-item:hover {
          background: var(--surface-200);
          color: var(--foreground);
        }
        .nav-item.active {
          background: var(--primary-color);
          color: #fff;
        }
        .dark .nav-item.active {
          background: var(--primary);
          color: var(--primary-foreground);
        }

        .menu-btn {
          display: none;
          background: none;
          border: 1px solid transparent;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          position: relative;
          cursor: pointer;
        }
        .menu-btn:hover {
          background: var(--surface-100);
        }
        .dark .menu-btn:hover {
          background: var(--surface-200);
        }
        .hamburger,
        .hamburger:before,
        .hamburger:after {
          position: absolute;
          left: 9px;
          right: 9px;
          height: 2px;
          background: currentColor;
          content: '';
          transition: 0.3s ease;
        }
        .hamburger {
          top: 50%;
          transform: translateY(-50%);
        }
        .hamburger:before {
          top: -6px;
        }
        .hamburger:after {
          top: 6px;
        }
        .icon-btn {
          background: none;
          border: 1px solid var(--border);
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          transition:
            background 0.25s ease,
            border-color 0.25s ease,
            transform 0.25s var(--easing-spring);
        }
        .icon-btn:hover {
          background: var(--surface-100);
          transform: translateY(-2px);
        }
        .dark .icon-btn:hover {
          background: var(--surface-200);
        }
        .icon-btn:active {
          transform: translateY(0);
        }

        /* Drawer */
        .fs-drawer {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          width: 280px;
          background: var(--card);
          box-shadow: 2px 0 18px -4px rgba(0, 0, 0, 0.25);
          transform: translateX(-100%);
          transition: transform 0.35s var(--easing-spring);
          z-index: 150;
          padding: 0;
          margin: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
        }
        .fs-drawer.dark {
          background: var(--surface-100);
        }
        .fs-drawer.open {
          transform: translateX(0);
        }
        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1rem 0.75rem;
          font-weight: 600;
          font-size: 0.9rem;
        }
        .close-btn {
          position: relative;
          width: 32px;
          height: 32px;
          border: none;
          background: none;
          cursor: pointer;
        }
        .close-btn:before,
        .close-btn:after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 16px;
          height: 2px;
          background: currentColor;
        }
        .close-btn:before {
          transform: translate(-50%, -50%) rotate(45deg);
        }
        .close-btn:after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }
        .fs-drawer li a,
        .fs-drawer li button {
          display: block;
          width: 100%;
          text-align: left;
          border: none;
          background: none;
          padding: 0.85rem 1rem;
          font-size: 0.8rem;
          font-weight: 500;
          text-decoration: none;
          color: var(--text-secondary);
          cursor: pointer;
          transition:
            background 0.25s ease,
            color 0.25s ease;
        }
        .dark .fs-drawer li a,
        .dark .fs-drawer li button {
          color: var(--color-neutral);
        }
        .fs-drawer li a:hover,
        .fs-drawer li button:hover {
          background: var(--surface-100);
          color: var(--text-primary);
        }
        .dark .fs-drawer li a:hover,
        .dark .fs-drawer li button:hover {
          background: var(--surface-200);
          color: var(--foreground);
        }
        .fs-drawer li.active a {
          background: var(--primary-color);
          color: #fff;
        }
        .dark .fs-drawer li.active a {
          background: var(--primary);
          color: var(--primary-foreground);
        }
        .divider {
          height: 1px;
          width: 100%;
          background: var(--border);
          margin: 0.5rem 0;
        }
        .fs-drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 140;
        }

        @media (max-width: 960px) {
          .nav-links {
            display: none;
          }
          .menu-btn {
            display: inline-flex;
          }
          .fs-navbar-inner {
            height: 50px;
          }
        }
        @media (max-width: 640px) {
          .fs-navbar-inner {
            padding: 0 0.75rem;
          }
          .icon-btn {
            width: 32px;
            height: 32px;
          }
          .brand {
            font-size: 0.85rem;
          }
        }
      `}</style>
    </>
  );
}
