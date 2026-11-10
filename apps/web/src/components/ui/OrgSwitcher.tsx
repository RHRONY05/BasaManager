import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, Check } from 'lucide-react';
import { useAuth } from '../../app/auth/AuthContext';
import { homeFor } from '../../app/auth/guards';
import type { UserMembership } from '@bm/shared';

export interface OrgSwitcherProps {
  className?: string;
}

export function OrgSwitcher({ className = '' }: OrgSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { memberships, activeOrg, switchOrg } = useAuth();
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

  // Single-membership users see the org name without a menu
  if (memberships.length <= 1) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm font-semibold text-fg min-w-0 ${className}`}
        data-testid="org-display"
      >
        <span className="truncate max-w-28 sm:max-w-48" title={activeOrg?.orgName ?? ''}>
          {activeOrg?.orgName ?? ''}
        </span>
      </div>
    );
  }

  const handleSelectOrg = (m: UserMembership) => {
    setIsOpen(false);
    switchOrg(m.orgId);
    navigate(homeFor(m.role));
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('account.switchOrg', { name: activeOrg?.orgName ?? '' })}
        className="org-switch flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-hover text-left transition-colors min-h-tap cursor-pointer max-w-xs min-w-0"
        data-testid="org-switcher-button"
      >
        <span className="flex-1 min-w-0 pr-1">
          <span className="font-semibold text-sm block truncate text-fg">{activeOrg?.orgName}</span>
          <span className="text-xs text-fg-muted block capitalize">{activeOrg?.role}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('account.switchOrg', { name: activeOrg?.orgName ?? '' })}
          className="absolute left-0 top-full mt-1 w-64 rounded-md border border-border bg-surface shadow-lg z-50 p-1 space-y-0.5"
          data-testid="org-switcher-menu"
        >
          {memberships.map((m) => {
            const isSelected = m.orgId === activeOrg?.orgId;
            return (
              <button
                key={m.orgId}
                role="option"
                aria-selected={isSelected}
                type="button"
                onClick={() => handleSelectOrg(m)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-left text-sm min-h-tap transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-accent-soft text-accent-text font-medium'
                    : 'hover:bg-surface-hover text-fg'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{m.orgName}</div>
                  <div className="text-xs text-fg-muted capitalize">{m.role}</div>
                </div>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-accent-primary ml-2" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
