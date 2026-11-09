import { useTranslation } from 'react-i18next';

export interface PasswordStrengthProps {
  password?: string;
}

export function calcPasswordStrength(password?: string): { score: number; hintKey: string } {
  if (!password || password.length === 0) {
    return { score: 0, hintKey: 'passwordHint' };
  }
  if (password.length < 10) {
    return { score: 1, hintKey: 'passwordStrengthWeak' };
  }

  let score = 2; // base score for reaching 10 chars
  if (password.length >= 14) score++;
  const hasLetters = /[a-zA-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if ((hasLetters && hasNumbers) || hasSpecial) {
    score++;
  }

  score = Math.min(score, 4);

  let hintKey = 'passwordStrengthGood';
  if (score === 2) hintKey = 'passwordStrengthFair';
  else if (score === 3) hintKey = 'passwordStrengthGood';
  else if (score >= 4) hintKey = 'passwordStrengthStrong';

  return { score, hintKey };
}

export function PasswordStrength({ password = '' }: PasswordStrengthProps) {
  const { t } = useTranslation();
  const { score, hintKey } = calcPasswordStrength(password);

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="pw-meter" aria-hidden="true">
        <span className={score >= 1 ? 'on' : ''} />
        <span className={score >= 2 ? 'on' : ''} />
        <span className={score >= 3 ? 'on' : ''} />
        <span className={score >= 4 ? 'on' : ''} />
      </div>
      <span className="hint">{t(`auth.${hintKey}`)}</span>
    </div>
  );
}
