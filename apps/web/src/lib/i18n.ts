import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from '../locales/en/common.json';
import { generatePseudoLocale } from './pseudo-locale';

const pseudoCommon = generatePseudoLocale(commonEn);

let initialLng = 'en';
if (typeof window !== 'undefined') {
  const searchParams = new URLSearchParams(window.location.search);
  const urlLng = searchParams.get('lng');
  if (urlLng) {
    initialLng = urlLng;
    try {
      localStorage.setItem('bm.lng', urlLng);
    } catch {
      // Ignore storage errors
    }
  } else {
    try {
      const savedLng = localStorage.getItem('bm.lng');
      if (savedLng) {
        initialLng = savedLng;
      }
    } catch {
      // Ignore storage errors
    }
  }
}

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
