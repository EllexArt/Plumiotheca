import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'amber' | 'secondary' | 'ghost' | 'danger';

interface Look {
  variant?: ButtonVariant;
  size?: 'medium' | 'small';
  wide?: boolean;
}

const classes = ({ variant = 'secondary', size = 'medium', wide }: Look, extra?: string) =>
  [styles.button, styles[variant], size === 'small' && styles.small, wide && styles.wide, extra]
    .filter(Boolean)
    .join(' ');

/** Bouton : une action. Pour aller vers une page, utiliser ButtonLink. */
export function Button({
  variant,
  size,
  wide,
  className,
  type = 'button',
  ...props
}: Look & ComponentProps<'button'>) {
  return <button type={type} className={classes({ variant, size, wide }, className)} {...props} />;
}

/** Lien qui a l'apparence d'un bouton (navigation interne). */
export function ButtonLink({
  variant,
  size,
  wide,
  className,
  ...props
}: Look & ComponentProps<typeof Link>) {
  return <Link className={classes({ variant, size, wide }, className)} {...props} />;
}
