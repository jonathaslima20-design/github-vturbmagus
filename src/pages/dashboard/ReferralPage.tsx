import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReferralData } from '@/hooks/useReferralData';
import { formatCurrencyI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Gift, Users, DollarSign, CircleCheck as CheckCircle2, TrendingUp,
  Share2, UserPlus, MousePointerClick, Crown, CreditCard, Copy,
  CircleAlert as AlertCircle, Lock, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import PixKeyDialog from '@/components/referral/PixKeyDialog';
import WithdrawalDialog from '@/components/referral/WithdrawalDialog';
import { useSubscriptionModal } from '@/contexts/SubscriptionModalContext';
import { supabase } from '@/lib/supabase';

function PremiumLockOverlay({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-2 text-center px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <Lock className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Disponivel em planos pagos</p>
        <Button size="sm" onClick={onUpgrade} className="mt-1">
          Fazer Upgrade
        </Button>
      </div>
    </div>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.substring(0, 2);
  return `${visible}***@${domain}`;
}

function getPlanBadge(planStatus: string) {
  switch (planStatus) {
    case 'active':
      return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Ativo</Badge>;
    case 'free':
      return <Badge variant="secondary">Gratis</Badge>;
    case 'expired':
      return <Badge variant="outline" className="text-orange-600 border-orange-300">Expirado</Badge>;
    default:
      return <Badge variant="secondary">{planStatus}</Badge>;
  }
}

export default function ReferralPage() {
  const { user } = useAuth();
  const { stats, pixKeys, referralLink, clickCount, referredUsers, isLoading, refreshData, error } = useReferralData(user?.id);
  const [showPixDialog, setShowPixDialog] = useState(false);
  const [showWithdrawalDialog, setShowWithdrawalDialog] = useState(false);
  const { openModal } = useSubscriptionModal();
  const [shareMessages, setShareMessages] = useState({ whatsapp: '', telegram: '' });

  const isFreePlan = user?.plan_status === 'free' || user?.plan_status === 'expired';

  useEffect(() => {
    supabase
      .from('referral_settings')
      .select('share_message_whatsapp, share_message_telegram')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setShareMessages({
            whatsapp: data.share_message_whatsapp || '',
            telegram: data.share_message_telegram || '',
          });
        }
      });
  }, []);

  const buildShareText = (template: string) => {
    const fallback = `Crie sua vitrine online no VitrineTurbo! Cadastre-se aqui: ${referralLink}`;
    if (!template) return fallback;
    return template.replace(/\{link\}/g, referralLink);
  };

  const copyToClipboard = async () => {
    if (isFreePlan) {
      toast('O programa Indique e Ganhe esta disponivel apenas para usuarios com plano ativo.', {
        description: 'Faca upgrade para comecar a ganhar com indicacoes!',
        action: {
          label: 'Fazer Upgrade',
          onClick: () => openModal(false),
        },
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Link copiado para area de transferencia!');
    } catch {
      toast.error('Erro ao copiar link');
    }
  };

  const shareViaWhatsApp = () => {
    if (isFreePlan) {
      toast('O programa Indique e Ganhe esta disponivel apenas para usuarios com plano ativo.', {
        description: 'Faca upgrade para comecar a ganhar com indicacoes!',
        action: {
          label: 'Fazer Upgrade',
          onClick: () => openModal(false),
        },
      });
      return;
    }
    const text = encodeURIComponent(buildShareText(shareMessages.whatsapp));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareViaTelegram = () => {
    if (isFreePlan) {
      toast('O programa Indique e Ganhe esta disponivel apenas para usuarios com plano ativo.', {
        description: 'Faca upgrade para comecar a ganhar com indicacoes!',
        action: {
          label: 'Fazer Upgrade',
          onClick: () => openModal(false),
        },
      });
      return;
    }
    const text = encodeURIComponent(buildShareText(shareMessages.telegram));
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !referralLink) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error || 'Nao foi possivel gerar seu link de indicacao. Por favor, recarregue a pagina.'}
          </AlertDescription>
        </Alert>
        <Button onClick={refreshData} className="w-full max-w-md mx-auto block">
          Tentar Novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      {/* Header Section */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 dark:bg-slate-100 mb-4">
          <Gift className="h-8 w-8 text-white dark:text-slate-900" />
        </div>
        <h1 className="text-4xl font-bold">Indique e Ganhe</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Compartilhe o VitrineTurbo com amigos e ganhe <span className="font-bold text-foreground">ate R$ 100</span> por cada indicacao que ativar um plano
        </p>
      </div>

      {/* Empty State Banner */}
      {referredUsers.length === 0 && (
        <Alert className="border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-900/20">
          <Share2 className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Comece agora!</strong> Compartilhe seu link de indicacao e ganhe ate R$ 100 por cada amigo que ativar um plano.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Cliques no Link</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clickCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Total de Indicados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referredUsers.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.activeReferrals || 0} com plano ativo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Comissoes Totais</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrencyI18n(stats?.totalCommissions || 0, 'BRL', 'pt-BR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Disponivel p/ Saque</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrencyI18n(stats?.availableForWithdrawal || 0, 'BRL', 'pt-BR')}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium">Comissoes Pagas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrencyI18n(stats?.paidCommissions || 0, 'BRL', 'pt-BR')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Referral Link Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Seu Link de Indicacao
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={referralLink}
              readOnly
              className="font-mono text-sm"
            />
            <Button onClick={copyToClipboard} className="shrink-0">
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={shareViaWhatsApp} className="gap-2 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Compartilhar no WhatsApp
            </Button>
            <Button variant="outline" size="sm" onClick={shareViaTelegram} className="gap-2 text-[#0088cc] border-[#0088cc]/30 hover:bg-[#0088cc]/10">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Compartilhar no Telegram
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Commission Plans */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6 text-center space-y-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-3xl font-bold">R$ 50</div>
            <div className="text-sm text-muted-foreground">Plano Trimestral</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="pt-6 text-center space-y-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Crown className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-3xl font-bold">R$ 70</div>
            <div className="text-sm text-muted-foreground">Plano Semestral</div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="pt-6 text-center space-y-2">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Gift className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-3xl font-bold">R$ 100</div>
            <div className="text-sm text-muted-foreground">Plano Anual</div>
          </CardContent>
        </Card>
      </div>

      {/* Referred Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Seus Indicados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referredUsers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum indicado ainda.</p>
              <p className="text-xs mt-1">Compartilhe seu link e comece a ganhar!</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead>Plano</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referredUsers.map((referred) => (
                    <TableRow key={referred.id}>
                      <TableCell className="font-medium">{referred.name || '\u2014'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{maskEmail(referred.email)}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(referred.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>{getPlanBadge(referred.plan_status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it Works Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Como Funciona
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 dark:bg-slate-100">
                <Share2 className="h-6 w-6 text-white dark:text-slate-900" />
              </div>
              <h3 className="font-semibold">1. Compartilhe</h3>
              <p className="text-sm text-muted-foreground">
                Envie seu link de indicacao para amigos e conhecidos
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 dark:bg-slate-100">
                <UserPlus className="h-6 w-6 text-white dark:text-slate-900" />
              </div>
              <h3 className="font-semibold">2. Eles se Cadastram</h3>
              <p className="text-sm text-muted-foreground">
                Seus amigos criam conta e ativam um plano pago
              </p>
            </div>

            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 dark:bg-slate-100">
                <DollarSign className="h-6 w-6 text-white dark:text-slate-900" />
              </div>
              <h3 className="font-semibold">3. Voce Ganha</h3>
              <p className="text-sm text-muted-foreground">
                Receba sua comissao automaticamente
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PIX and Withdrawal Section */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="relative overflow-hidden">
          {isFreePlan && <PremiumLockOverlay onUpgrade={() => openModal(false)} />}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Chave PIX
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pixKeys.length > 0 ? (
              <div className="space-y-2">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm font-medium">{pixKeys[0].holder_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {pixKeys[0].pix_key_type.toUpperCase()}: {pixKeys[0].pix_key}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowPixDialog(true)}
                >
                  Editar Chave PIX
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Configure sua chave PIX para receber os saques
                </p>
                <Button
                  className="w-full"
                  onClick={() => setShowPixDialog(true)}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Configurar PIX
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          {isFreePlan && <PremiumLockOverlay onUpgrade={() => openModal(false)} />}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Solicitar Saque
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl font-bold">
                {formatCurrencyI18n(stats?.availableForWithdrawal || 0, 'BRL', 'pt-BR')}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Disponivel para saque</p>
            </div>

            {(stats?.availableForWithdrawal || 0) >= 50 ? (
              <Button
                className="w-full"
                onClick={() => setShowWithdrawalDialog(true)}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Solicitar Saque
              </Button>
            ) : (
              <Button className="w-full" disabled variant="secondary">
                <DollarSign className="h-4 w-4 mr-2" />
                Solicitar Saque
              </Button>
            )}

            <p className="text-xs text-center text-muted-foreground">
              {pixKeys.length === 0
                ? 'Configure sua chave PIX primeiro'
                : 'Valor minimo para saque: R$ 50,00'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Terms Link */}
      <div className="text-center py-4">
        <Link
          to="/termos-indicacoes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileText className="h-4 w-4" />
          Termos e Condicoes do Programa de Indicacoes
        </Link>
      </div>

      {/* Dialogs */}
      <PixKeyDialog
        open={showPixDialog}
        onOpenChange={setShowPixDialog}
        onSuccess={refreshData}
        existingKey={pixKeys[0] || null}
      />

      <WithdrawalDialog
        open={showWithdrawalDialog}
        onOpenChange={setShowWithdrawalDialog}
        onSuccess={refreshData}
        availableAmount={stats?.availableForWithdrawal || 0}
        pixKeys={pixKeys}
        onConfigurePixKey={() => {
          setShowWithdrawalDialog(false);
          setShowPixDialog(true);
        }}
      />
    </div>
  );
}
