import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthContext';
import { PrefetchLink } from '../../lib/router/PrefetchLink';

export interface AccountMenuProps {
  className?: string;
}

function getInitials(name?: string | null): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && first && last && first[0] && last[0]) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  return (name[0] ?? 'U').toUpperCase();
}

export function AccountMenu({ className = '' }: AccountMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    navigate('/login');
  };

  const initials = getInitials(user?.fullName);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t('account.accountMenu', { name: user?.fullName || 'User' })}
        className="account-btn inline-flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-surface-hover text-fg transition-colors min-h-tap cursor-pointer"
        data-testid="account-menu-button"
      >
        <span
          className="inline-grid place-items-center w-7 h-7 rounded-full bg-accent-soft text-accent-text font-bold text-xs shrink-0"
          aria-hidden="true"
        >
          {initials}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={t('account.accountMenu', { name: user?.fullName || 'User' })}
          className="absolute right-0 top-full mt-1 w-56 rounded-md border border-border bg-surface shadow-lg z-50 py-1"
          data-testid="account-menu-dropdown"
        >
          {/* User Preview */}
          <div className="px-3 py-2 border-b border-border min-w-0">
            <p className="text-sm font-semibold text-fg truncate">{user?.fullName || 'User'}</p>
            <p className="text-xs text-fg-muted truncate">{user?.email}</p>
          </div>

          {/* Account Settings Link */}
          <div className="py-1">
            <PrefetchLink
              to="/account"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-fg hover:bg-surface-hover transition-colors whitespace-nowrap min-h-tap"
            >
              <User className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <span>{t('account.accountSettings')}</span>
            </PrefetchLink>
          </div>

          {/* Sign Out Item */}
          <div className="py-1 border-t border-border">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-text hover:bg-danger-soft transition-colors whitespace-nowrap min-h-tap cursor-pointer text-left"
              data-testid="account-menu-signout"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('account.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
