/**
 * LanguageSwitcher Component
 * Dropdown menu for switching between supported languages
 * Added: i18n language selection with localStorage persistence
 */
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supportedLanguages, type SupportedLanguage } from '../../i18n';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation('navigation');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Current language info
  const currentLanguage = supportedLanguages[i18n.language as SupportedLanguage] || supportedLanguages.en;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle language change
  const handleLanguageChange = (langCode: SupportedLanguage) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background-light dark:hover:bg-white/10 transition-colors"
        aria-label={t('header.language')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-lg" role="img" aria-label={currentLanguage.name}>
          {currentLanguage.flag}
        </span>
        <span className="text-sm font-medium text-text-light dark:text-text-dark hidden sm:inline">
          {currentLanguage.nativeName}
        </span>
        <span className="material-symbols-outlined text-base text-subtle-text dark:text-subtle-text-dark">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-48 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-lg z-50"
          role="listbox"
          aria-label="Select language"
        >
          <div className="py-1">
            {(Object.entries(supportedLanguages) as [SupportedLanguage, typeof currentLanguage][]).map(
              ([code, lang]) => (
                <button
                  key={code}
                  onClick={() => handleLanguageChange(code)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors
                    ${i18n.language === code
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-light dark:text-text-dark hover:bg-background-light dark:hover:bg-white/10'
                    }
                  `}
                  role="option"
                  aria-selected={i18n.language === code}
                >
                  <span className="text-lg" role="img" aria-hidden="true">
                    {lang.flag}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{lang.nativeName}</span>
                    <span className="text-xs text-subtle-text dark:text-subtle-text-dark">
                      {lang.name}
                    </span>
                  </div>
                  {i18n.language === code && (
                    <span className="material-symbols-outlined text-primary ml-auto">
                      check
                    </span>
                  )}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact variant for mobile/small spaces
export function LanguageSwitcherCompact() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLanguage = supportedLanguages[i18n.language as SupportedLanguage] || supportedLanguages.en;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (langCode: SupportedLanguage) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center size-10 rounded-full hover:bg-background-light dark:hover:bg-white/10 transition-colors"
        aria-label="Change language"
      >
        <span className="text-xl">{currentLanguage.flag}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark shadow-lg z-50 overflow-hidden">
          {(Object.entries(supportedLanguages) as [SupportedLanguage, typeof currentLanguage][]).map(
            ([code, lang]) => (
              <button
                key={code}
                onClick={() => handleLanguageChange(code)}
                className={`
                  flex items-center justify-center size-12 transition-colors
                  ${i18n.language === code
                    ? 'bg-primary/10'
                    : 'hover:bg-background-light dark:hover:bg-white/10'
                  }
                `}
                title={lang.nativeName}
              >
                <span className="text-xl">{lang.flag}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
