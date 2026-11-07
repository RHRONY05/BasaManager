import { useTranslation } from 'react-i18next';
import { PlaceholderDataRegion } from '../../components/domain/PlaceholderDataRegion';

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-md mx-auto w-full space-y-6 py-8 min-w-0">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-fg break-words">{t('auth.loginTitle')}</h1>
      </div>

      <PlaceholderDataRegion />
    </div>
  );
}
