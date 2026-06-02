import { Percent, Tag } from 'lucide-react';
import type { OfferFormData } from '@/types/offers';

interface Props {
  form: OfferFormData;
}

export function OfferLivePreview({ form }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Preview ao Vivo
        </h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {form.template === 'fullscreen' && 'Tela Cheia'}
          {form.template === 'modal_central' && 'Modal'}
          {form.template === 'banner_topo' && 'Banner'}
          {form.template === 'slide_lateral' && 'Slide'}
        </span>
      </div>

      {/* Phone mockup */}
      <div className="relative mx-auto" style={{ width: 280 }}>
        <div className="rounded-[2.5rem] border-[8px] border-zinc-800 dark:border-zinc-700 bg-zinc-900 overflow-hidden shadow-xl">
          {/* Status bar */}
          <div className="h-6 bg-zinc-900 flex items-center justify-center">
            <div className="w-16 h-4 bg-zinc-800 rounded-full" />
          </div>

          {/* Screen content */}
          <div className="relative bg-gray-100 dark:bg-gray-900" style={{ height: 500 }}>
            {/* Simulated dashboard background */}
            <div className="p-3 space-y-2">
              <div className="h-4 w-24 bg-gray-300 dark:bg-gray-700 rounded" />
              <div className="h-20 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700" />
              <div className="h-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700" />
              <div className="h-16 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700" />
            </div>

            {/* Offer overlay */}
            {form.template === 'fullscreen' && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4">
                <div
                  className="w-full rounded-xl overflow-hidden shadow-lg"
                  style={{ backgroundColor: form.cor_fundo, color: form.cor_texto }}
                >
                  {form.imagem_url && (
                    <div className="h-20 overflow-hidden">
                      <img src={form.imagem_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    {(form.desconto_percentual > 0 || form.desconto_valor_fixo > 0) && (
                      <DiscountBadge form={form} />
                    )}
                    <p className="font-bold text-xs leading-tight">{form.titulo || 'Titulo da oferta'}</p>
                    {form.subtitulo && <p className="text-[10px] opacity-70">{form.subtitulo}</p>}
                    <CTAButton form={form} />
                    <p className="text-center text-[8px] opacity-40">Agora nao, obrigado</p>
                  </div>
                </div>
              </div>
            )}

            {form.template === 'modal_central' && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4">
                <div
                  className="w-full rounded-xl overflow-hidden shadow-lg"
                  style={{ backgroundColor: form.cor_fundo, color: form.cor_texto }}
                >
                  {form.imagem_url && (
                    <div className="h-16 overflow-hidden">
                      <img src={form.imagem_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    {(form.desconto_percentual > 0 || form.desconto_valor_fixo > 0) && (
                      <DiscountBadge form={form} />
                    )}
                    <p className="font-bold text-xs leading-tight">{form.titulo || 'Titulo da oferta'}</p>
                    {form.subtitulo && <p className="text-[10px] opacity-70">{form.subtitulo}</p>}
                    <CTAButton form={form} />
                  </div>
                </div>
              </div>
            )}

            {form.template === 'banner_topo' && (
              <div
                className="absolute top-0 left-0 right-0 px-2 py-2 flex items-center gap-2 shadow-md"
                style={{ backgroundColor: form.cor_fundo, color: form.cor_texto }}
              >
                {(form.desconto_percentual > 0 || form.desconto_valor_fixo > 0) && (
                  <span
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: form.cor_destaque, color: '#fff' }}
                  >
                    {form.desconto_percentual > 0 ? `${form.desconto_percentual}%` : `R$${form.desconto_valor_fixo}`}
                  </span>
                )}
                <span className="text-[9px] font-medium flex-1 truncate">{form.titulo || 'Titulo'}</span>
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded text-white font-medium"
                  style={{ backgroundColor: form.botao_cor }}
                >
                  {form.botao_texto || 'CTA'}
                </span>
              </div>
            )}

            {form.template === 'slide_lateral' && (
              <div
                className="absolute top-0 right-0 bottom-0 w-3/5 shadow-2xl overflow-hidden"
                style={{ backgroundColor: form.cor_fundo, color: form.cor_texto }}
              >
                <div className="p-2 border-b border-black/10">
                  <span className="text-[7px] uppercase tracking-wider opacity-50">Oferta</span>
                </div>
                {form.imagem_url && (
                  <div className="h-16 overflow-hidden">
                    <img src={form.imagem_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-2 space-y-1.5">
                  {(form.desconto_percentual > 0 || form.desconto_valor_fixo > 0) && (
                    <DiscountBadge form={form} />
                  )}
                  <p className="font-bold text-[9px] leading-tight">{form.titulo || 'Titulo'}</p>
                  {form.subtitulo && <p className="text-[7px] opacity-70">{form.subtitulo}</p>}
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2">
                  <CTAButton form={form} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscountBadge({ form }: { form: OfferFormData }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold"
      style={{ backgroundColor: form.cor_destaque, color: '#fff' }}
    >
      {form.desconto_percentual > 0 ? (
        <><Percent className="w-2 h-2" />{form.desconto_percentual}% OFF</>
      ) : (
        <><Tag className="w-2 h-2" />R${form.desconto_valor_fixo} OFF</>
      )}
    </span>
  );
}

function CTAButton({ form }: { form: OfferFormData }) {
  return (
    <div
      className="w-full py-1.5 rounded-lg text-center text-[9px] font-semibold text-white"
      style={{ backgroundColor: form.botao_cor }}
    >
      {form.botao_texto || 'Aproveitar Oferta'}
    </div>
  );
}
