import "./NavBar.css";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { PAGE_ROUTES } from "@/lib/constants";
import { 
  LayoutDashboard, 
  LineChart, 
  BookOpen, 
  Dumbbell, 
  Wallet, 
  Users 
} from "lucide-react";

interface NavBarProps {
  title?: string;
  showApiConfig?: boolean;
  onShowApiPanel?: () => void;
}

export default function NavBar({
  title = "Open Mandi",
  showApiConfig = false,
  onShowApiPanel,
}: NavBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { isLoggedIn, logout } = useAuth();
  const { isDark } = useTheme();

  const handleLogout = async () => {
    try {
      await logout();
      setIsMenuOpen(false);
    } catch (error) {
      // Swallow logout errors to avoid UI noise
    }
  };

  const navItems = [
    { href: PAGE_ROUTES.DASHBOARD, label: "Command Center", icon: LayoutDashboard },
    { href: PAGE_ROUTES.TRADING_PANEL, label: "Terminal", icon: LineChart },
    { href: PAGE_ROUTES.ANALYST_DESK, label: "Journal", icon: BookOpen },
    { href: PAGE_ROUTES.TRADING_GYM, label: "Gym", icon: Dumbbell },
    { href: PAGE_ROUTES.ASSETS, label: "Portfolio", icon: Wallet },
    { href: PAGE_ROUTES.ACCOUNTS, label: "Brokers", icon: Users },
  ];

  const isActiveRoute = (href: string) => pathname === href;

  return (
    <>
      <header className={`fs-navbar ${isDark ? "dark" : ""}`}>
        <div className="fs-navbar-inner">
          <div className="left-group">
            <button
              className="menu-btn"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              <span className="hamburger" />
            </button>
            <Link to="/dashboard" className="brand" aria-label="Home">
              <img src="/logo.png" alt="" className="brand-logo" style={{ height: '24px', width: '24px', marginRight: '8px', borderRadius: '4px' }} />
              {title}
            </Link>
          </div>
          <nav className="nav-links">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`nav-item ${
                  isActiveRoute(item.href) ? "active" : ""
                }`}
              >
                <item.icon className="h-4 w-4 mr-2" />
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
              <button
                className="icon-btn"
                onClick={handleLogout}
                aria-label="Logout"
              >
                ⏻
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile side navigation */}
      <ul
        className={`fs-drawer ${isMenuOpen ? "open" : ""} ${
          isDark ? "dark" : ""
        }`}
      >
        <li>
          <div className="drawer-head">
            <span className="name">{title}</span>
            <button
              className="close-btn"
              onClick={() => setIsMenuOpen(false)}
              aria-label="Close"
            />
          </div>
        </li>

        {navItems.map((item) => (
          <li
            key={item.href}
            className={isActiveRoute(item.href) ? "active" : ""}
          >
            <Link to={item.href} onClick={() => setIsMenuOpen(false)} className="flex items-center">
              <item.icon className="h-4 w-4 mr-2" />
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
      {isMenuOpen && (
        <div
          className="fs-drawer-overlay"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </>
  );
}
