import { useEffect, useState } from 'react';
import {
  Save,
  Loader as Loader2,
  CircleCheck as CheckCircle2,
  CircleAlert as AlertCircle,
  TriangleAlert as AlertTriangle,
  Eye,
  EyeOff,
  Globe,
  Plug,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface NetlifyConfig {
  id?: string;
  access_token: string;
  site_id: string;
  site_name: string;
  updated_at?: string;
}

interface TestResult {
  ok: boolean;
  site_name?: string | null;
  site_url?: string | null;
  primary_domain?: string | null;
  primary_domain_set?: boolean;
  aliases_count?: number;
  warning?: string | null;
  error?: string;
  details?: string;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export default function NetlifyIntegrationPage() {
  const [config, setConfig] = useState<NetlifyConfig>({
    access_token: '',
    site_id: '',
    site_name: '',
  });
  const [originalToken, setOriginalToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('netlify_integration_config')
        .select('id, access_token, site_id, site_name, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error loading config:', error);
        return;
      }

      if (data) {
        setConfig({
          id: data.id,
          access_token: data.access_token || '',
          site_id: data.site_id || '',
          site_name: data.site_name || '',
          updated_at: data.updated_at,
        });
        setOriginalToken(data.access_token || '');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.access_token.trim() || !config.site_id.trim()) {
      setErrorMsg('Access Token e Site ID sao obrigatorios.');
      setSaveState('error');
      return;
    }

    setSaveState('saving');
    setErrorMsg('');

    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      access_token: config.access_token.trim(),
      site_id: config.site_id.trim(),
      site_name: config.site_name.trim(),
      updated_by: user?.id,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (config.id) {
      result = await supabase
        .from('netlify_integration_config')
        .update(payload)
        .eq('id', config.id)
        .select()
        .maybeSingle();
    } else {
      result = await supabase
        .from('netlify_integration_config')
        .insert(payload)
        .select()
        .maybeSingle();
    }

    if (result.error) {
      setErrorMsg(result.error.message);
      setSaveState('error');
      return;
    }

    if (result.data) {
      setConfig({
        id: result.data.id,
        access_token: result.data.access_token,
        site_id: result.data.site_id,
        site_name: result.data.site_name || '',
        updated_at: result.data.updated_at,
      });
      setOriginalToken(result.data.access_token);
    }

    setSaveState('success');
    toast.success('Configuracao salva com sucesso');
    setTimeout(() => setSaveState('idle'), 3000);
  };

  const handleTest = async () => {
    if (!config.access_token.trim() || !config.site_id.trim()) {
      toast.error('Preencha Access Token e Site ID antes de testar');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error('Sessao expirada');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-custom-domain/test-connection`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: config.access_token.trim(),
            site_id: config.site_id.trim(),
          }),
        }
      );

      const data = await response.json();
      setTestResult(data);

      if (data.ok) {
        toast.success('Conexao com Netlify validada');
      } else {
        toast.error(data.error || 'Falha ao conectar com Netlify');
      }
    } catch (err) {
      console.error('Test error:', err);
      toast.error('Erro ao testar conexao');
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!config.id) return;
    if (!confirm('Tem certeza que deseja remover as credenciais do Netlify? Isso desativara a integracao.')) return;

    setRemoving(true);
    const { error } = await supabase
      .from('netlify_integration_config')
      .delete()
      .eq('id', config.id);

    if (error) {
      toast.error('Erro ao remover credenciais');
      setRemoving(false);
      return;
    }

    setConfig({ access_token: '', site_id: '', site_name: '' });
    setOriginalToken('');
    setTestResult(null);
    toast.success('Credenciais removidas');
    setRemoving(false);
  };

  const tokenChanged = config.access_token !== originalToken;
  const isConfigured = !!config.id && !!originalToken;

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Carregando configuracoes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl page-title">Integracao Netlify</h1>
          <p className="text-muted-foreground">
            Gerencie as credenciais do Netlify usadas para ativar dominios personalizados dos usuarios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Nao configurado
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
              <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Credenciais do Netlify</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                Access Token e Site ID que o sistema utiliza para gerenciar dominios via API
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="access-token" className="text-sm font-medium">Access Token</Label>
            <div className="relative">
              <Input
                id="access-token"
                type={showToken ? 'text' : 'password'}
                placeholder="nfp_xxxxxxxxxxxxxxxxxxxxxx"
                value={config.access_token}
                onChange={(e) => setConfig((c) => ({ ...c, access_token: e.target.value }))}
                className="font-mono text-sm pr-10"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-muted text-muted-foreground"
                aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Crie um Personal Access Token em{' '}
              <a
                href="https://app.netlify.com/user/applications#personal-access-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Netlify &gt; User Settings &gt; Applications
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-id" className="text-sm font-medium">Site ID</Label>
            <Input
              id="site-id"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={config.site_id}
              onChange={(e) => setConfig((c) => ({ ...c, site_id: e.target.value.trim() }))}
              className="font-mono text-sm"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Encontre em <span className="font-medium">Site settings &gt; General &gt; Site information &gt; Site ID</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="site-name" className="text-sm font-medium">
              Apelido do site <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="site-name"
              placeholder="Ex: vitrineturbo-prod"
              value={config.site_name}
              onChange={(e) => setConfig((c) => ({ ...c, site_name: e.target.value }))}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Apenas para sua referencia interna. Nao impacta na integracao.
            </p>
          </div>

          {saveState === 'error' && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMsg || 'Erro ao salvar. Tente novamente.'}</span>
            </div>
          )}

          {tokenChanged && originalToken && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                O Access Token foi alterado. Salve para aplicar a nova credencial.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="gap-1.5"
            >
              {saveState === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
              {saveState === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {(saveState === 'idle' || saveState === 'error') && <Save className="h-4 w-4" />}
              {saveState === 'saving'
                ? 'Salvando...'
                : saveState === 'success'
                  ? 'Salvo!'
                  : 'Salvar configuracao'}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || !config.access_token || !config.site_id}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              {testing ? 'Testando...' : 'Testar conexao'}
            </Button>
            {isConfigured && (
              <Button
                variant="ghost"
                onClick={handleRemove}
                disabled={removing}
                className="gap-1.5 text-destructive hover:text-destructive ml-auto"
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover credenciais
              </Button>
            )}
          </div>

          {config.updated_at && (
            <p className="text-xs text-muted-foreground">
              Ultima atualizacao: {new Date(config.updated_at).toLocaleString('pt-BR')}
            </p>
          )}
        </CardContent>
      </Card>

      {testResult && (
        <Card className={testResult.ok ? 'border-emerald-200' : 'border-red-200'}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              {testResult.ok ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <CardTitle className="text-base">
                {testResult.ok ? 'Conexao validada' : 'Falha na conexao'}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setTestResult(null)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {testResult.ok ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <InfoRow label="Nome do site" value={testResult.site_name || '-'} />
                  <InfoRow label="URL" value={testResult.site_url || '-'} mono />
                  <InfoRow
                    label="Primary Domain"
                    value={testResult.primary_domain || 'Nao configurado'}
                    mono={!!testResult.primary_domain}
                  />
                  <InfoRow
                    label="Aliases configurados"
                    value={String(testResult.aliases_count ?? 0)}
                  />
                </div>
                {testResult.warning && (
                  <Alert className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-sm text-amber-800 dark:text-amber-300">
                      {testResult.warning}
                    </AlertDescription>
                  </Alert>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-red-600 dark:text-red-400">{testResult.error}</p>
                {testResult.details && (
                  <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
                    {testResult.details}
                  </pre>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs space-y-1.5">
          <p>
            <strong>Como obter as credenciais:</strong>
          </p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Acesse o painel do Netlify e abra o site usado em producao</li>
            <li>Em <em>Site settings &gt; General</em>, copie o <strong>Site ID</strong></li>
            <li>Em <em>User settings &gt; Applications</em>, gere um <strong>Personal Access Token</strong> com permissao de gerenciar sites</li>
            <li>Cole ambos os valores acima e clique em <strong>Testar conexao</strong> para validar</li>
            <li>Confirme que o site possui um <strong>Primary Domain</strong> configurado, caso contrario a ativacao de dominios personalizados ira falhar</li>
          </ol>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-sm mt-0.5 break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
