import { useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { UserButton, useUser } from '@clerk/clerk-react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleSidebar, toggleTheme, selectTheme } from '../store/slices/uiSlice';
import io from 'socket.io-client';
import { useMe } from '../api/hooks';
import { SearchResultsPopup } from './SearchResultsPopup';
import { SettingsPanel } from './SettingsPanel';
import { NotificationsPanel } from './NotificationsPanel';
import BrandIcon from '../assets/favicon.svg';
import styles from './Layout.module.css';

const navSections = [
  {
    title: 'COMMAND CENTER',
    items: [
      { to: '/', label: 'Home', icon: 'home' },
      { to: '/orchestrator', label: 'Orchestrator', icon: 'cell_tower' },
      { to: '/zones', label: 'Zone Control', icon: 'hub' },
      { to: '/escalations', label: 'Escalations', icon: 'priority_high' },
      { to: '/map', label: 'Deployment Map', icon: 'map' },
    ]
  },
  {
    title: 'OPERATIONS & RELIEF',
    items: [
      { to: '/needs', label: 'Needs / SOS', icon: 'sos' },
      { to: '/disasters', label: 'Disaster Zones', icon: 'flood' },
      { to: '/relief', label: 'Relief Coordination', icon: 'volunteer_activism' },
      { to: '/org', label: 'Org Portal', icon: 'apartment' },
      { to: '/resources', label: 'Resources', icon: 'inventory_2' },
      { to: '/missing', label: 'Missing Persons', icon: 'person_search' },
      { to: '/coordinators', label: 'Coordinators', icon: 'insights' },
      { to: '/reports', label: 'Reports', icon: 'summarize' },
    ]
  },
  {
    title: 'SYSTEM & ADMIN',
    items: [
      { to: '/users', label: 'User Management', icon: 'admin_panel_settings' },
      { to: '/audit-logs', label: 'Audit Logs', icon: 'history' },
      { to: '/server', label: 'Server Monitor', icon: 'monitor_heart' },
    ]
  }
];

const NEWS_ITEMS = [
  {
    id: 1,
    tag: 'RESCUE OPS',
    severity: 'critical',
    headline: 'NDRF teams deployed to Sector 4 affected by flash floods',
    location: 'Sector 4',
    time: '2m ago',
    details: '4 motorized search & rescue boats deployed. 38 individuals evacuated to Municipal Relief Shelter #2.',
    actionLabel: 'View on Map',
    actionLink: '/map?lat=18.5204&lng=73.8567'
  },
  {
    id: 2,
    tag: 'WEATHER ALERT',
    severity: 'warning',
    headline: 'Heavy rainfall advisory issued for coastal regions over next 48 hours',
    location: 'Coastal Belt',
    time: '14m ago',
    details: 'IMD Orange alert active. Expected precipitation 120-180mm. Emergency relief staging centers placed on high alert.',
    actionLabel: 'View Escalations',
    actionLink: '/escalations'
  },
  {
    id: 3,
    tag: 'SUPPLY DISPATCH',
    severity: 'info',
    headline: 'Medical supplies & trauma kits airdropped in remote cut-off hamlets',
    location: 'Ghat Zone 3',
    time: '28m ago',
    details: 'IAF helicopter dispatch #42 successfully delivered 400 ration kits, water filtration units, and trauma bandages.',
    actionLabel: 'View Resources',
    actionLink: '/resources'
  },
  {
    id: 4,
    tag: 'BLE MESH',
    severity: 'success',
    headline: 'P2P Bluetooth mesh networking relay active across offline zones',
    location: 'Rural Grid B',
    time: '45m ago',
    details: '14 multi-hop relays active. 28 distress beacons successfully synced through peer nodes without cellular towers.',
    actionLabel: 'View Orchestrator',
    actionLink: '/orchestrator'
  }
];

function NewsTickerItem({ item, onHover, onLeave }) {
  const chipClass =
    item.severity === 'critical'
      ? styles.tickerChipRed
      : item.severity === 'warning'
      ? styles.tickerChipAmber
      : item.severity === 'success'
      ? styles.tickerChipGreen
      : styles.tickerChipBlue;

  return (
    <div
      className={styles.tickerItem}
      onMouseEnter={(e) => onHover(item, e)}
      onMouseLeave={onLeave}
      onClick={(e) => onHover(item, e)}
    >
      <span className={`${styles.tickerChip} ${chipClass}`}>{item.tag}</span>
      <span>{item.headline}</span>
      <span className={styles.tickerLocationBadge}>{item.location}</span>
    </div>
  );
}

export function Layout() {
  const dispatch = useDispatch();
  const sidebarOpen = useSelector((s) => s.ui.sidebarOpen);
  const theme = useSelector(selectTheme);
  const { data: me } = useMe();
  const { user: clerkUser } = useUser();
  const role = me?.role ?? '—';
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  // Parse current lang from google translate cookie if it exists
  const getInitialLang = () => {
    const match = document.cookie.match(/googtrans=\/en\/([a-z]{2})/);
    return match ? match[1] : 'en';
  };
  const [currentLang, setCurrentLang] = useState(getInitialLang());
  
  useEffect(() => {
    // Initialize google translate widget when Layout mounts
    const initTranslate = () => {
      if (window.google && window.google.translate && window.google.translate.TranslateElement) {
        const el = document.getElementById('google_translate_element');
        if (el && el.innerHTML === '') {
          new window.google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'en,hi,mr',
            layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
            autoDisplay: false
          }, 'google_translate_element');
        }
      }
    };
    
    // It might take a second for the external script to load
    const timeoutId = setTimeout(initTranslate, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  const [hoveredNewsItem, setHoveredNewsItem] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ left: 240 });
  const searchContainerRef = useRef(null);
  const popoverTimeoutRef = useRef(null);

  const handleNewsHover = (item, e) => {
    if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
    if (e && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cardWidth = 420;
      // Center directly below the hovered element/cursor
      const centeredLeft = rect.left + rect.width / 2 - cardWidth / 2;
      const clampedLeft = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, centeredLeft));
      setPopoverPos({ left: clampedLeft });
    }
    setHoveredNewsItem(item);
  };

  const handleNewsLeave = () => {
    popoverTimeoutRef.current = setTimeout(() => {
      setHoveredNewsItem(null);
    }, 250);
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchContainerRef]);

  // Keep sidebar closed on incoming signals; user can click the notification bell if desired

  const displayName = clerkUser
    ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.primaryEmailAddress?.emailAddress || 'Admin User'
    : 'Admin User';

  const roleLabelMap = {
    'admin': 'System Admin',
    'coordinator': 'Coordinator',
    'volunteer': 'Volunteer',
    'organization': 'Organization',
  };

  return (
    <div className={styles.wrapper}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandIcon}>
            <img src={BrandIcon} style={{ width: '1.5rem', height: '1.5rem' }} />
          </div>
          {sidebarOpen && (
            <h2 className={styles.brandName}>ResQConnect</h2>
          )}
        </div>

        {/* Nav */}
        <nav className={styles.nav}>
          {navSections.map((section, sIdx) => (
            <div key={section.title} className={styles.navSection}>
              {sidebarOpen && (
                <span className={styles.navLabel}>{section.title}</span>
              )}
              {sIdx > 0 && !sidebarOpen && <div className={styles.navDividerCollapsed} />}
              {section.items.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                  }
                  end={to === '/'}
                  title={label}
                >
                  <span className={`material-symbols-outlined ${styles.navIcon}`}>{icon}</span>
                  {sidebarOpen && <span className={styles.navText}>{label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User at bottom */}
        <div className={styles.userSection}>
          {sidebarOpen ? (
            <div className={styles.userInfo}>
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{
                  elements: { avatarBox: { width: '36px', height: '36px' } },
                }}
              />
              <div className={styles.userMeta}>
                <span className={styles.userName}>{displayName}</span>
                <span className={styles.userRole}>{roleLabelMap[role] || role}</span>
              </div>
            </div>
          ) : (
            <div className={styles.userCollapsed}>
              <UserButton
                afterSignOutUrl="/sign-in"
                appearance={{
                  elements: { avatarBox: { width: '32px', height: '32px' } },
                }}
              />
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => dispatch(toggleSidebar())}
              aria-label="Toggle sidebar"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>menu</span>
            </button>
            <div className={styles.searchBox} ref={searchContainerRef} style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#94a3b8' }}>search</span>
              <input
                type="text"
                placeholder="Search incidents, units..."
                className={styles.searchInput}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
              />
              <SearchResultsPopup
                query={searchQuery}
                isVisible={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
              />
            </div>
          </div>
          <div className={styles.headerRight}>
            <div id="google_translate_element" style={{ display: 'none' }}></div>
            <select 
              value={currentLang} 
              onChange={(e) => {
                const lng = e.target.value;
                setCurrentLang(lng);
                
                // Set the Google Translate cookie manually for bulletproof translation
                const cookieStr = lng === 'en' ? '/en/en' : `/en/${lng}`;
                document.cookie = `googtrans=${cookieStr}; path=/; domain=${window.location.hostname}`;
                document.cookie = `googtrans=${cookieStr}; path=/;`;
                
                // Reload the page so the script picks up the new cookie instantly
                window.location.reload();
              }}
              style={{
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                marginRight: '8px',
                appearance: 'auto'
              }}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </select>
            <button
              type="button"
              className={styles.headerIcon}
              onClick={() => dispatch(toggleTheme())}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <button type="button" className={styles.headerIcon} aria-label="Notifications" onClick={() => setIsNotificationsOpen(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span>
              <span className={styles.notifDot} />
            </button>
            <button type="button" className={styles.headerIcon} aria-label="Settings" onClick={() => setIsSettingsOpen(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>settings</span>
            </button>
            <div className={styles.divider} />
            <div className={styles.headerUser}>
              <div className={styles.headerAvatar}>
                <UserButton
                  afterSignOutUrl="/sign-in"
                  appearance={{
                    elements: { avatarBox: { width: '32px', height: '32px' } },
                  }}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Live News Ticker */}
        <div
          className={styles.newsTickerWrapper}
          onMouseLeave={handleNewsLeave}
        >
          <div className={styles.newsTickerBadge}>
            <span className={styles.pulseDot}></span>
            LIVE NEWS
          </div>
          <div className={styles.newsTickerContent}>
            <div className={styles.newsTickerTrack}>
              {NEWS_ITEMS.map((item) => (
                <span key={`news-1-${item.id}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <NewsTickerItem item={item} onHover={handleNewsHover} onLeave={handleNewsLeave} />
                  <span className={styles.tickerSeparator}>•</span>
                </span>
              ))}
              {/* Duplicate for smooth infinite loop */}
              {NEWS_ITEMS.map((item) => (
                <span key={`news-2-${item.id}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <NewsTickerItem item={item} onHover={handleNewsHover} onLeave={handleNewsLeave} />
                  <span className={styles.tickerSeparator}>•</span>
                </span>
              ))}
            </div>
          </div>

          {/* Expandable Details Popover Card on Hover */}
          {hoveredNewsItem && (
            <div
              className={styles.newsPopoverCard}
              style={{ left: `${popoverPos.left}px` }}
              onMouseEnter={() => {
                if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
              }}
              onMouseLeave={handleNewsLeave}
            >
              <div className={styles.popoverHeader}>
                <span
                  className={`${styles.tickerChip} ${
                    hoveredNewsItem.severity === 'critical'
                      ? styles.tickerChipRed
                      : hoveredNewsItem.severity === 'warning'
                      ? styles.tickerChipAmber
                      : hoveredNewsItem.severity === 'success'
                      ? styles.tickerChipGreen
                      : styles.tickerChipBlue
                  }`}
                >
                  {hoveredNewsItem.tag}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>
                  {hoveredNewsItem.time}
                </span>
              </div>
              <div className={styles.popoverTitle}>{hoveredNewsItem.headline}</div>
              <div className={styles.popoverDesc}>{hoveredNewsItem.details}</div>
              <div className={styles.popoverFooter}>
                <span style={{ color: 'var(--color-text-muted, #64748b)' }}>
                  📍 {hoveredNewsItem.location}
                </span>
                <NavLink
                  to={hoveredNewsItem.actionLink}
                  className={styles.popoverActionBtn}
                  onClick={() => setHoveredNewsItem(null)}
                >
                  {hoveredNewsItem.actionLabel}
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                </NavLink>
              </div>
            </div>
          )}
        </div>

        <div className={styles.content}>
          <Outlet />
        </div>
      </main>

      <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <NotificationsPanel isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
    </div>
  );
}
