import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, LogOut, Menu, X, ShieldCheck, Gift, CreditCard, CircleHelp as HelpCircle, UsersRound, Wallet, ChevronDown, Scale, UserX, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import { cn, getInitials } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onMobileToggle?: () => void;
}

export default function AdminSidebar({ mobileOpen = false, onMobileToggle }: AdminSidebarProps) {
  const { signOut, user } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, roles: ['admin', 'parceiro'] },
    { name: 'Usuários', href: '/admin/users', icon: Users, roles: ['admin', 'parceiro'] },
    { name: 'Planos', href: '/admin/plans', icon: CreditCard, roles: ['admin'] },
    { name: 'Mercado Pago', href: '/admin/mercadopago', icon: Wallet, roles: ['admin'] },
    { name: 'Banner de Clientes', href: '/admin/banner-clients', icon: UsersRound, roles: ['admin'] },
    { name: 'Indicações', href: '/admin/referrals', icon: Gift, roles: ['admin', 'parceiro'] },
    { name: 'Hero Landing', href: '/admin/landing-hero', icon: Smartphone, roles: ['admin'] },
    { name: 'Configurações', href: '/admin/settings', icon: Settings, roles: ['admin'] },
    { name: 'Central de Ajuda', href: '/admin/help', icon: HelpCircle, roles: ['admin'] },
    { name: 'Central Legal', href: '/admin/legal', icon: Scale, roles: ['admin'] },
    { name: 'Privacidade / LGPD', href: '/admin/privacy-requests', icon: UserX, roles: ['admin'] },
  ].filter(item => item.roles.includes(user?.role || ''));

  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <Logo showText size="md" />
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-foreground/[0.05] rounded">
            <ShieldCheck className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground tracking-tight">
              {user?.role === 'parceiro' ? 'Revenda' : 'Admin'}
            </span>
          </div>
          {isMobile && (
            <button
              onClick={onMobileToggle}
              className="h-8 w-8 flex items-center justify-center hover:bg-foreground/5 transition-colors ml-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <nav className="space-y-0.5">
          {navigation.map((item) => (
            <AdminNavItem
              key={item.name}
              name={item.name}
              href={item.href}
              icon={item.icon}
              end={item.href === '/admin'}
              onClick={() => isMobile && onMobileToggle?.()}
            />
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="mt-auto px-3 pb-4 pt-2">
        <div className="border-t border-foreground/[0.06] pt-3 mt-1">
          <div className="flex items-center gap-3 w-full p-2.5">
            <Avatar className="h-9 w-9 shrink-0 ring-1 ring-foreground/10">
              <AvatarImage src={user?.avatar_url} alt={user?.name} />
              <AvatarFallback className="text-xs font-bold bg-foreground text-background tracking-tight">
                {getInitials(user?.name || '')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] truncate leading-tight tracking-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user?.role === 'parceiro' ? 'Revenda' : 'Administrador'}
              </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2.5 py-2.5 px-2.5 w-full text-left text-muted-foreground hover:text-foreground transition-colors duration-150 mt-1 text-[15px] tracking-tight"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile trigger */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-3 left-4 z-50 md:hidden rounded-none border-foreground/20"
        onClick={onMobileToggle}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-background/80 z-40 md:hidden transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onMobileToggle}
      />

      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 w-[272px] z-50 transition-transform duration-250 ease-out md:hidden flex flex-col bg-background border-r border-foreground/[0.08]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent(true)}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col h-screen w-[256px] bg-background border-r border-foreground/[0.08]">
        {sidebarContent(false)}
      </div>
    </>
  );
}

interface AdminNavItemProps {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  onClick?: () => void;
}

function AdminNavItem({ name, href, icon: Icon, end, onClick }: AdminNavItemProps) {
  const location = useLocation();
  const isActive = end
    ? location.pathname === href
    : location.pathname.startsWith(href);

  return (
    <NavLink
      to={href}
      end={end}
      onClick={onClick}
      className={cn(
        "flex flex-row items-center gap-3 py-2.5 px-3 text-[15px] tracking-tight transition-colors duration-150 relative",
        isActive
          ? "text-foreground font-semibold bg-foreground/[0.04]"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-foreground" />
      )}
      <Icon className="h-[19px] w-[19px] shrink-0" />
      <span className="whitespace-nowrap">{name}</span>
    </NavLink>
  );
}
