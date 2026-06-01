import { useEffect, useState } from 'react';
import { Save, Code as Code2, ChartBar as BarChart3, Loader as Loader2, CircleCheck as CheckCircle2, CircleAlert as AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface TrackingConfig {
  meta_pixel_id: string;
  google_tag_id: string;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export default function SettingsPage() {
  const [config, setConfig] = useState<TrackingConfig>({ meta_pixel_id: '', google_tag_id: '' });
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('landing_tracking_config')
        .select('meta_pixel_id, google_tag_id')
        .maybeSingle();
      if (data) setConfig({ meta_pixel_id: data.meta_pixel_id, google_tag_id: data.google_tag_id });
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaveState('saving');
    setErrorMsg('');
    const { error } = await supabase
      .from('landing_tracking_config')
      .upsert({ id: 1, ...config, updated_at: new Date().toISOString() });
    if (error) {
      setErrorMsg(error.message);
      setSaveState('error');
    } else {
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 3000);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl page-title">Configurações do Sistema</h1>
        <p className="text-muted-foreground">Gerencie as configurações globais da plataforma</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <Code2 className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Rastreamento da Landing Page</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                Configure os pixels e tags de rastreamento exibidos na página pública
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Carregando configurações...</span>
            </div>
          ) : (
            <>
              {/* Meta Pixel */}
              <div className="space-y-2">
                <Label htmlFor="meta-pixel" className="flex items-center gap-2 text-sm font-medium">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-[#0866FF] text-white text-[10px] font-bold leading-none select-none">f</span>
                  Meta Pixel ID
                </Label>
                <Input
                  id="meta-pixel"
                  placeholder="Ex: 1234567890123456"
                  value={config.meta_pixel_id}
                  onChange={(e) => setConfig((c) => ({ ...c, meta_pixel_id: e.target.value.trim() }))}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Encontre seu Pixel ID em{' '}
                  <span className="font-medium">Gerenciador de Anúncios &gt; Pixels</span>.
                  Apenas o número, ex: <span className="font-mono">1234567890123456</span>
                </p>
              </div>

              {/* Google Tag */}
              <div className="space-y-2">
                <Label htmlFor="google-tag" className="flex items-center gap-2 text-sm font-medium">
                  <BarChart3 className="h-4 w-4 text-[#E37400]" />
                  Google Tag ID
                </Label>
                <Input
                  id="google-tag"
                  placeholder="Ex: GTM-XXXXXXX ou G-XXXXXXXXXX"
                  value={config.google_tag_id}
                  onChange={(e) => setConfig((c) => ({ ...c, google_tag_id: e.target.value.trim() }))}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Aceita formato <span className="font-mono">GTM-XXXXXXX</span> (Google Tag Manager) ou{' '}
                  <span className="font-mono">G-XXXXXXXXXX</span> (Google Analytics 4).
                </p>
              </div>

              {saveState === 'error' && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{errorMsg || 'Erro ao salvar. Tente novamente.'}</span>
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={saveState === 'saving'}
                className="w-full sm:w-auto"
              >
                {saveState === 'saving' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {saveState === 'success' && <CheckCircle2 className="h-4 w-4 mr-2" />}
                {(saveState === 'idle' || saveState === 'error') && <Save className="h-4 w-4 mr-2" />}
                {saveState === 'saving' ? 'Salvando...' : saveState === 'success' ? 'Salvo!' : 'Salvar configurações'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
