import { MessageSquare, Eye, CreditCard, Phone, Tag, Info, X, ShoppingBag, TriangleAlert as AlertTriangle, PackageX, Gift, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  new_lead: MessageSquare,
  whatsapp_click: Phone,
  view_milestone: Eye,
  subscription_expiring: CreditCard,
  subscription_expired: CreditCard,
  product_sold: Tag,
  new_order: ShoppingBag,
  low_stock: AlertTriangle,
  out_of_stock: PackageX,
  referral_signup: UserPlus,
  referral_upgrade: Gift,
  system: Info,
};

const COLOR_MAP: Record<NotificationType, string> = {
  new_lead: 'text-blue-500 bg-blue-500/10',
  whatsapp_click: 'text-green-500 bg-green-500/10',
  view_milestone: 'text-amber-500 bg-amber-500/10',
  subscription_expiring: 'text-orange-500 bg-orange-500/10',
  subscription_expired: 'text-red-500 bg-red-500/10',
  product_sold: 'text-emerald-500 bg-emerald-500/10',
  new_order: 'text-teal-500 bg-teal-500/10',
  low_stock: 'text-amber-600 bg-amber-500/10',
  out_of_stock: 'text-red-600 bg-red-500/10',
  referral_signup: 'text-cyan-500 bg-cyan-500/10',
  referral_upgrade: 'text-emerald-600 bg-emerald-500/10',
  system: 'text-muted-foreground bg-muted',
};

interface NotificationItemProps {
  notification: AppNotification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick?: (notification: AppNotification) => void;
}

export default function NotificationItem({
  notification,
  onRead,
  onDelete,
  onClick,
}: NotificationItemProps) {
  const Icon = ICON_MAP[notification.type] || Info;
  const colorClass = COLOR_MAP[notification.type] || COLOR_MAP.system;

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ptBR,
  });

  const handleClick = () => {
    if (!notification.is_read) {
      onRead(notification.id);
    }
    onClick?.(notification);
  };

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/50 border-b border-border/50 last:border-b-0',
        !notification.is_read && 'bg-primary/[0.03]'
      )}
      onClick={handleClick}
    >
      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('text-sm truncate', !notification.is_read ? 'font-semibold' : 'font-medium')}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo}</p>
      </div>

      <button
        className="mt-0.5 shrink-0 rounded-md p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(notification.id);
        }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
