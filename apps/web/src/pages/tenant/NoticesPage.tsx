import { useTranslation } from 'react-i18next';
import { PlaceholderDataRegion } from '../../components/domain/PlaceholderDataRegion';

export default function NoticesPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-xl min-w-0">
      <h1 className="text-2xl font-bold text-fg break-words">
        {t('headings.tenantNotices')}
      </h1>
      <PlaceholderDataRegion />
    </div>
  );
}
