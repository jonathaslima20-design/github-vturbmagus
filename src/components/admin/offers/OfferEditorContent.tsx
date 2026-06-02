import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { OfferFormData, OfferType } from '@/types/offers';

interface Props {
  form: OfferFormData;
  updateForm: (updates: Partial<OfferFormData>) => void;
}

export function OfferEditorContent({ form, updateForm }: Props) {
  return (
    <div className="space-y-5 rounded-xl border bg-card p-6">
      <h3 className="font-semibold text-base">Conteudo da Oferta</h3>

      <div className="space-y-2">
        <Label htmlFor="titulo">Titulo *</Label>
        <Input
          id="titulo"
          value={form.titulo}
          onChange={(e) => updateForm({ titulo: e.target.value })}
          placeholder="Ex: 50% OFF no Plano Anual"
          maxLength={80}
        />
        <p className="text-xs text-muted-foreground">{form.titulo.length}/80 caracteres</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subtitulo">Subtitulo</Label>
        <Input
          id="subtitulo"
          value={form.subtitulo}
          onChange={(e) => updateForm({ subtitulo: e.target.value })}
          placeholder="Ex: Oferta exclusiva por tempo limitado"
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="descricao">Descricao</Label>
        <Textarea
          id="descricao"
          value={form.descricao}
          onChange={(e) => updateForm({ descricao: e.target.value })}
          placeholder="Descreva os beneficios desta oferta..."
          rows={4}
        />
      </div>

      <div className="space-y-2">
        <Label>Tipo de Oferta</Label>
        <Select
          value={form.tipo_oferta}
          onValueChange={(v) => updateForm({ tipo_oferta: v as OfferType })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upgrade">Upgrade de Plano</SelectItem>
            <SelectItem value="renovacao">Renovacao</SelectItem>
            <SelectItem value="desconto_geral">Desconto Geral</SelectItem>
            <SelectItem value="parceiro">Parceiro Externo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="imagem_url">URL da Imagem</Label>
        <Input
          id="imagem_url"
          value={form.imagem_url}
          onChange={(e) => updateForm({ imagem_url: e.target.value })}
          placeholder="https://..."
          type="url"
        />
        {form.imagem_url && (
          <div className="mt-2 h-24 w-full rounded-lg overflow-hidden bg-muted">
            <img src={form.imagem_url} alt="Preview" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="botao_texto">Texto do Botao (CTA)</Label>
        <Input
          id="botao_texto"
          value={form.botao_texto}
          onChange={(e) => updateForm({ botao_texto: e.target.value })}
          placeholder="Ex: Aproveitar Oferta"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="url_destino">URL de Destino (ao clicar no CTA)</Label>
        <Input
          id="url_destino"
          value={form.url_destino}
          onChange={(e) => updateForm({ url_destino: e.target.value })}
          placeholder="Ex: /dashboard/checkout?plan=anual"
        />
      </div>
    </div>
  );
}
