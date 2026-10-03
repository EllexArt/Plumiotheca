import { Dialog as Radix } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './Dialog.module.css';

/**
 * Fenêtre de dialogue (Radix) : focus piégé à l'intérieur puis rendu à l'élément qui l'a
 * ouverte, Échap pour fermer, titre et description annoncés (RGAA 7.1, WCAG 2.4.3).
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  footer,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Radix.Trigger asChild>{trigger}</Radix.Trigger>}
      <Radix.Portal>
        <Radix.Overlay className={styles.overlay} />
        <Radix.Content
          className={styles.content}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className={styles.header}>
            <Radix.Title className={styles.title}>{title}</Radix.Title>
            <Radix.Close className={styles.close} aria-label="Fermer">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Radix.Close>
          </div>
          <div className={styles.body}>
            {description && <Radix.Description>{description}</Radix.Description>}
            {children}
          </div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

export const DialogClose = Radix.Close;
