import type { ComponentProps, MouseEvent } from 'react';
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

/**
 * Bouton : une action. Pour aller vers une page, utiliser ButtonLink.
 *
 * `pending` (envoi en cours) : le bouton reste focalisable et annoncé « indisponible »
 * (aria-disabled), mais ignore les clics. `disabled` retirerait le focus, et le lecteur
 * d'écran perdrait sa position (WCAG 2.4.3).
 */
export function Button({
  variant,
  size,
  wide,
  className,
  type = 'button',
  pending = false,
  onClick,
  ...props
}: Look & ComponentProps<'button'> & { pending?: boolean }) {
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };
  return (
    <button
      type={type}
      className={classes({ variant, size, wide }, className)}
      aria-disabled={pending || undefined}
      onClick={click}
      {...props}
    />
  );
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
