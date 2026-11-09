import { useState, forwardRef, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id?: string;
  className?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ id, className = '', ...props }, ref) => {
    const { t } = useTranslation();
    const [showPassword, setShowPassword] = useState(false);

    return (
      <div className="relative flex items-center min-w-0 w-full">
        <input
          ref={ref}
          id={id}
          type={showPassword ? 'text' : 'password'}
          className={`input pr-11 ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-fg-muted hover:text-fg min-h-tap min-w-tap cursor-pointer"
          aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
          tabIndex={-1}
        >
          {showPassword ? (
            <EyeOff className="h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <Eye className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
