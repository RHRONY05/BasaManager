import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '../locales/en/common.json';
import { generatePseudoLocale } from './pseudo-locale';
import { resolveInitialLng } from './lng';

const pseudoCommon = generatePseudoLocale(commonEn);

function safeLocalStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const initialLng =
  typeof window === 'undefined'
    ? 'en'
    : resolveInitialLng(window.location.search, import.meta.env.MODE, safeLocalStorage());

void i18n.use(initReactI18next).init({
  lng: initialLng,
  fallbackLng: 'en',
  defaultNS: 'common',
  resources: {
    en: {
      common: commonEn,
    },
    'en-XA': {
      common: pseudoCommon,
    },
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
