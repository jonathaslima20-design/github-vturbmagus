import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, MousePointerClick, CircleCheck as CheckCircle, Circle as XCircle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchOfferById, fetchOfferAnalytics } from '@/lib/offerService';
import type { OfferWithConfig, OfferAnalytics } from '@/types/offers';

export default function OfferAnalyticsPage() {
  const { offerId } = useParams();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<OfferWithConfig | null>(null);
  const [analytics, setAnalytics] = useState<OfferAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!offerId) return;
    const load = async () => {
      try {
        const [offerData, analyticsData] = await Promise.all([
          fetchOfferById(offerId),
          fetchOfferAnalytics(offerId, 30),
        ]);
        setOffer(offerData);
        setAnalytics(analyticsData);
      } catch (err) {
        toast.error('Erro ao carregar analytics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [offerId]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="h-96 flex items-center justify-center text-muted-foreground">
          Carregando analytics...
        </div>
      </div>
    );
  }

  if (!offer || !analytics) {
    return (
      <div className="container mx-auto p-6">
        <p>Oferta nao encontrada</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/offers')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Analytics: {offer.titulo}</h1>
          <p className="text-sm text-muted-foreground">
            Metricas dos ultimos 30 dias
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Impressoes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.total_impressions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MousePointerClick className="w-4 h-4" />
              Cliques (CTR)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.total_clicks}</p>
            <p className="text-xs text-muted-foreground">{analytics.ctr.toFixed(1)}% taxa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Conversoes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.total_conversions}</p>
            <p className="text-xs text-muted-foreground">{analytics.conversion_rate.toFixed(1)}% taxa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Dispensadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.total_dismissals}</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Funil de Conversao
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <FunnelStep
              label="Impressoes"
              value={analytics.total_impressions}
              percentage={100}
              color="bg-blue-500"
            />
            <FunnelStep
              label="Cliques"
              value={analytics.total_clicks}
              percentage={analytics.total_impressions > 0 ? (analytics.total_clicks / analytics.total_impressions) * 100 : 0}
              color="bg-amber-500"
            />
            <FunnelStep
              label="Conversoes"
              value={analytics.total_conversions}
              percentage={analytics.total_impressions > 0 ? (analytics.total_conversions / analytics.total_impressions) * 100 : 0}
              color="bg-emerald-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Daily Data */}
      {analytics.daily_data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historico Diario</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Data</th>
                    <th className="text-right py-2 font-medium">Impressoes</th>
                    <th className="text-right py-2 font-medium">Cliques</th>
                    <th className="text-right py-2 font-medium">Conversoes</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.daily_data.map((day) => (
                    <tr key={day.date} className="border-b last:border-0">
                      <td className="py-2">{new Date(day.date).toLocaleDateString('pt-BR')}</td>
                      <td className="text-right py-2">{day.impressions}</td>
                      <td className="text-right py-2">{day.clicks}</td>
                      <td className="text-right py-2">{day.conversions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FunnelStep({ label, value, percentage, color }: { label: string; value: number; percentage: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(percentage, 2)}%` }} />
      </div>
    </div>
  );
}
