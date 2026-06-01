import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  createPixPayment,
  createCardPayment,
  getPaymentStatus,
  getPublicKey,
  type PixPaymentResult,
  type CardPaymentResult,
} from '@/lib/mpPayments';
import { formatCurrencyI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { QrCode, CreditCard, Copy, Check, Loader as Loader2, ArrowLeft, ShieldCheck, Clock, CircleCheck as CheckCircle2, Circle as XCircle, CircleAlert as AlertCircle, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { initMercadoPago, CardPayment } from '@mercadopago/sdk-react';

type PaymentTab = 'pix' | 'card';

interface PlanInfo {
  id: string;
  name: string;
  price: number;
  duration: string;
}

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function PixSection({ plan, onSuccess, earlyRenewal }: { plan: PlanInfo; onSuccess: () => void; earlyRenewal?: boolean }) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [doc, setDoc] = useState('');
  const [loading, setLoading] = useState(false);
  const [pixResult, setPixResult] = useState<PixPaymentResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentApproved, setPaymentApproved] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (user?.name) {
      const parts = user.name.split(' ');
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const startPolling = useCallback((paymentId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getPaymentStatus(paymentId);
        if (status.status === 'approved') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPaymentApproved(true);
          onSuccess();
        }
      } catch (e) {
        // ignore polling errors
      }
    }, 5000);

    channelRef.current = supabase
      .channel(`mp_payment_${paymentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mp_payments',
          filter: `id=eq.${paymentId}`,
        },
        (payload) => {
          if (payload.new?.status === 'approved') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setPaymentApproved(true);
            onSuccess();
          }
        }
      )
      .subscribe();
  }, [onSuccess]);

  const handleSubmit = async () => {
    if (!firstName || !email || !doc) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const cleanDoc = doc.replace(/\D/g, '');
    if (cleanDoc.length < 11) {
      toast.error('CPF/CNPJ inválido');
      return;
    }

    setLoading(true);
    try {
      const result = await createPixPayment({
        plan_id: plan.id,
        billing_cycle: plan.duration,
        payer: {
          email,
          first_name: firstName,
          last_name: lastName,
          doc: cleanDoc,
        },
        early_renewal: earlyRenewal,
      });
      setPixResult(result);
      startPolling(result.payment_id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar PIX');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (pixResult?.pix_qr_code) {
      navigator.clipboard.writeText(pixResult.pix_qr_code);
      setCopied(true);
      toast.success('Código PIX copiado!');
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (paymentApproved) {
    return <PaymentSuccess />;
  }

  if (pixResult) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <QrCode className="h-7 w-7 text-green-600" />
            </div>
          </div>
          <h3 className="text-lg font-semibold">QR Code gerado!</h3>
          <p className="text-sm text-muted-foreground">
            Escaneie o QR Code ou copie o codigo para pagar
          </p>
        </div>

        {pixResult.pix_qr_code_base64 && (
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-lg border">
              <img
                src={`data:image/png;base64,${pixResult.pix_qr_code_base64}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
          </div>
        )}

        {pixResult.pix_qr_code && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Código Pix (copia e cola)</Label>
            <div className="flex gap-2">
              <Input
                value={pixResult.pix_qr_code}
                readOnly
                className="text-xs font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Aguardando confirmação do pagamento...</span>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-xs text-muted-foreground">
            Após o pagamento, seu plano será ativado automaticamente em poucos segundos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Nome *</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Nome"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Sobrenome</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Sobrenome"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail *</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="doc">CPF/CNPJ *</Label>
        <Input
          id="doc"
          value={doc}
          onChange={(e) => setDoc(formatCpf(e.target.value))}
          placeholder="000.000.000-00"
          maxLength={18}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <QrCode className="h-4 w-4 mr-2" />
        )}
        Gerar QR Code Pix
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        O pagamento via Pix é confirmado instantaneamente
      </p>
    </div>
  );
}

interface CardSectionProps {
  plan: PlanInfo;
  onSuccess: () => void;
  earlyRenewal?: boolean;
}

function CardSection({ plan, onSuccess, earlyRenewal }: CardSectionProps) {
  const [result, setResult] = useState<CardPaymentResult | null>(null);
  const [brickReady, setBrickReady] = useState(false);
  const planRef = useRef(plan);
  planRef.current = plan;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const earlyRenewalRef = useRef(earlyRenewal);
  earlyRenewalRef.current = earlyRenewal;

  const handleSubmit = useCallback(async (formData: any) => {
    return new Promise<void>(async (resolve, reject) => {
      try {
        const currentPlan = planRef.current;
        const cardResult = await createCardPayment({
          plan_id: currentPlan.id,
          billing_cycle: currentPlan.duration,
          token: formData.token,
          installments: formData.installments,
          payment_method_id: formData.payment_method_id,
          issuer_id: formData.issuer_id || '',
          payer: {
            email: formData.payer?.email || '',
            doc: formData.payer?.identification?.number || '',
          },
          early_renewal: earlyRenewalRef.current,
        });
        setResult(cardResult);
        if (cardResult.status === 'approved') {
          onSuccessRef.current();
        }
        resolve();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Erro ao processar pagamento');
        reject();
      }
    });
  }, []);

  const handleReady = useCallback(() => {
    setBrickReady(true);
  }, []);

  const handleError = useCallback((error: any) => {
    console.error('CardPayment Brick error:', error);
  }, []);

  const initialization = useMemo(() => ({ amount: plan.price }), [plan.price]);
  const customization = useMemo(() => ({
    visual: { hideFormTitle: true },
    paymentMethods: { maxInstallments: 12 },
  }), []);

  if (result) {
    if (result.status === 'approved') {
      return <PaymentSuccess />;
    }

    if (result.status === 'in_process') {
      return (
        <div className="text-center space-y-4 py-8">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-7 w-7 text-amber-500" />
            </div>
          </div>
          <h3 className="text-lg font-semibold">Pagamento em análise</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Seu pagamento está sendo processado. Você será notificado assim que for aprovado.
          </p>
          <Badge variant="outline" className="text-amber-600">
            {result.card_last4 && `Cartão ****${result.card_last4}`}
          </Badge>
        </div>
      );
    }

    return (
      <div className="text-center space-y-4 py-8">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle className="h-7 w-7 text-red-500" />
          </div>
        </div>
        <h3 className="text-lg font-semibold">Pagamento recusado</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {result.status_detail || 'Verifique os dados do cartão e tente novamente.'}
        </p>
        <Button variant="outline" onClick={() => setResult(null)}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!brickReady && (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Carregando formulário seguro...</span>
        </div>
      )}
      <div style={{ minHeight: brickReady ? undefined : 0, overflow: brickReady ? undefined : 'hidden' }}>
        <CardPayment
          initialization={initialization}
          customization={customization}
          onSubmit={handleSubmit}
          onReady={handleReady}
          onError={handleError}
        />
      </div>

      {brickReady && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Pagamento processado com seguranca pelo Mercado Pago</span>
        </div>
      )}
    </div>
  );
}

function PaymentSuccess() {
  const navigate = useNavigate();

  return (
    <div className="text-center space-y-4 py-8">
      <div className="flex justify-center">
        <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in duration-300">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
      </div>
      <h3 className="text-xl font-semibold">Pagamento aprovado!</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Seu plano foi ativado com sucesso. Aproveite todos os recursos da plataforma!
      </p>
      <Button onClick={() => navigate('/dashboard')} size="lg">
        Ir para o Dashboard
      </Button>
    </div>
  );
}

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PaymentTab>('pix');
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);

  const planId = searchParams.get('plan');
  const cycle = searchParams.get('cycle');
  const earlyRenewal = searchParams.get('early_renewal') === 'true';

  useEffect(() => {
    if (!planId) {
      navigate('/dashboard/settings');
      return;
    }

    const fetchPlan = async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, price, duration')
        .eq('id', planId)
        .maybeSingle();

      if (error || !data) {
        toast.error('Plano não encontrado');
        navigate('/dashboard/settings');
        return;
      }

      setPlan({
        id: data.id,
        name: data.name,
        price: Number(data.price),
        duration: cycle || data.duration,
      });
      setPlanLoading(false);
    };

    fetchPlan();
  }, [planId, cycle, navigate]);

  useEffect(() => {
    let cancelled = false;

    const initSdk = async () => {
      try {
        const info = await getPublicKey();
        if (cancelled) return;
        if (!info.public_key) {
          setSdkError(true);
          return;
        }
        initMercadoPago(info.public_key, { locale: 'pt-BR' });
        setSdkReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error('MercadoPago SDK init failed:', error);
          setSdkError(true);
        }
      }
    };

    initSdk();
    return () => { cancelled = true; };
  }, []);

  const handleRetrySDK = useCallback(async () => {
    setSdkError(false);
    setSdkReady(false);
    try {
      const info = await getPublicKey();
      if (!info.public_key) {
        setSdkError(true);
        return;
      }
      initMercadoPago(info.public_key, { locale: 'pt-BR' });
      setSdkReady(true);
    } catch {
      setSdkError(true);
    }
  }, []);

  const handleSuccess = useCallback(async () => {
    setPaymentComplete(true);
    await refreshUser();
  }, [refreshUser]);

  if (planLoading || !plan) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderCardContent = () => {
    if (sdkError) {
      return (
        <div className="text-center space-y-4 py-8">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
          </div>
          <h3 className="text-lg font-semibold">Erro ao carregar formulário</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Não foi possível inicializar o sistema de pagamento. Verifique sua conexão.
          </p>
          <Button variant="outline" onClick={handleRetrySDK}>
            Tentar novamente
          </Button>
        </div>
      );
    }

    if (!sdkReady) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <CardSection
        plan={plan}
        onSuccess={handleSuccess}
        earlyRenewal={earlyRenewal}
      />
    );
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
      <div className="max-w-lg mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{plan.name}</p>
                <p className="text-sm text-muted-foreground">Ciclo: {plan.duration}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">
                  {formatCurrencyI18n(plan.price)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {earlyRenewal && user?.subscription_end_date && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
            <CalendarClock className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Renovação antecipada — o novo período será calculado a partir do vencimento atual
              {' '}(<strong>{new Date(user.subscription_end_date).toLocaleDateString('pt-BR')}</strong>),
              sem perda dos dias restantes.
            </p>
          </div>
        )}

        {paymentComplete ? (
          <Card>
            <CardContent className="p-6">
              <PaymentSuccess />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Forma de pagamento</CardTitle>
              <CardDescription>Escolha como deseja pagar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveTab('pix')}
                  className={cn(
                    'flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all',
                    activeTab === 'pix'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  <QrCode className="h-4 w-4" />
                  <span className="text-sm font-medium">Pix</span>
                </button>
                <button
                  onClick={() => setActiveTab('card')}
                  className={cn(
                    'flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all',
                    activeTab === 'card'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-muted hover:border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm font-medium">Cartão</span>
                </button>
              </div>

              <Separator />

              {activeTab === 'pix' ? (
                <PixSection plan={plan} onSuccess={handleSuccess} earlyRenewal={earlyRenewal} />
              ) : (
                renderCardContent()
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>Pagamento seguro processado por Mercado Pago</span>
        </div>
      </div>
    </div>
  );
}
