import { useTranslation } from 'react-i18next';
import { PlaceholderDataRegion } from '../../components/domain/PlaceholderDataRegion';

export default function BillingPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 max-w-4xl min-w-0">
      <h1 className="text-2xl font-bold text-fg break-words">
        {t('headings.billing')}
      </h1>
      <PlaceholderDataRegion />
    </div>
  );
}
