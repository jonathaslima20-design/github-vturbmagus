import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, X, Trash2, Mail, Store, Send, Eye, MousePointerClick, CircleCheck as CheckCircle, Circle as XCircle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  assignOfferToUsers,
  removeAssignment,
  fetchOfferRecipients,
  fetchOfferUserTimeline,
  broadcastOfferPush,
} from '@/lib/offerService';
import type { OfferRecipientSummary, OfferTimelineEvent, OfferAssignmentStatus } from '@/types/offers';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  offerId: string;
  adminUserId: string;
}

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
}

const STATUS_LABELS: Record<OfferAssignmentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente: { label: 'Pendente', variant: 'secondary' },
  visualizada: { label: 'Visualizada', variant: 'outline' },
  aceita: { label: 'Aceita', variant: 'default' },
  dispensada: { label: 'Dispensada', variant: 'destructive' },
  expirada: { label: 'Expirada', variant: 'destructive' },
};

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export function OfferEditorAssignments({ offerId, adminUserId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [notes, setNotes] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [recipients, setRecipients] = useState<OfferRecipientSummary[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OfferAssignmentStatus | 'todos'>('todos');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineUser, setTimelineUser] = useState<OfferRecipientSummary | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<OfferTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const loadRecipients = useCallback(async () => {
    try {
      setLoadingRecipients(true);
      const data = await fetchOfferRecipients(offerId);
      setRecipients(data);
    } catch (err) {
      console.error('Error loading recipients:', err);
    } finally {
      setLoadingRecipients(false);
    }
  }, [offerId]);

  useEffect(() => {
    loadRecipients();
  }, [loadRecipients]);

  // Realtime subscription so the recipients view updates as users interact
  useEffect(() => {
    const channel = supabase
      .channel(`offer_recipients_${offerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'offer_user_assignments',
        filter: `offer_id=eq.${offerId}`,
      }, () => {
        loadRecipients();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'offer_impressions',
        filter: `offer_id=eq.${offerId}`,
      }, () => {
        loadRecipients();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [offerId, loadRecipients]);

  const searchUsers = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, avatar_url')
        .or(`email.ilike.%${term}%,name.ilike.%${term}%`)
        .neq('role', 'admin')
        .limit(10);

      if (error) throw error;
      const alreadyAssignedIds = recipients.map(r => r.user_id);
      const alreadySelectedIds = selectedUsers.map(u => u.id);
      const filtered = (data || []).filter(
        u => !alreadyAssignedIds.includes(u.id) && !alreadySelectedIds.includes(u.id)
      );
      setSearchResults(filtered);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  }, [recipients, selectedUsers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchUsers]);

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUsers(prev => [...prev, user]);
    setSearchResults(prev => prev.filter(u => u.id !== user.id));
    setSearchTerm('');
  };

  const handleRemoveSelected = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleAssign = async () => {
    if (selectedUsers.length === 0) return;

    try {
      setAssigning(true);
      const userIds = selectedUsers.map(u => u.id);
      await assignOfferToUsers(offerId, userIds, adminUserId, notes);
      toast.success(`Oferta atribuida a ${selectedUsers.length} usuario${selectedUsers.length > 1 ? 's' : ''}`);
      setSelectedUsers([]);
      setNotes('');
      await loadRecipients();
    } catch (err) {
      console.error('Assign error:', err);
      toast.error('Erro ao atribuir oferta');
    } finally {
      setAssigning(false);
    }
  };

  const handleSendNow = async () => {
    if (selectedUsers.length === 0) return;

    try {
      setAssigning(true);
      const userIds = selectedUsers.map(u => u.id);
      await assignOfferToUsers(offerId, userIds, adminUserId, notes);
      await broadcastOfferPush(offerId, userIds);
      toast.success(`Oferta enviada em tempo real para ${selectedUsers.length} usuario${selectedUsers.length > 1 ? 's' : ''}`);
      setSelectedUsers([]);
      setNotes('');
      await loadRecipients();
    } catch (err) {
      console.error('Send now error:', err);
      toast.error('Erro ao enviar oferta em tempo real');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await removeAssignment(assignmentId);
      setRecipients(prev => prev.filter(r => r.assignment_id !== assignmentId));
      toast.success('Atribuicao removida');
    } catch (err) {
      console.error('Remove assignment error:', err);
      toast.error('Erro ao remover atribuicao');
    }
  };

  const openTimeline = async (recipient: OfferRecipientSummary) => {
    setTimelineUser(recipient);
    setTimelineOpen(true);
    setTimelineLoading(true);
    try {
      const events = await fetchOfferUserTimeline(offerId, recipient.user_id);
      setTimelineEvents(events);
    } catch (err) {
      console.error('Timeline error:', err);
      toast.error('Erro ao carregar linha do tempo');
    } finally {
      setTimelineLoading(false);
    }
  };

  const filtered = recipients.filter(r => {
    if (statusFilter !== 'todos' && r.status !== statusFilter) return false;
    if (recipientSearch.trim()) {
      const q = recipientSearch.toLowerCase();
      if (!r.user_name.toLowerCase().includes(q) && !r.user_email.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totals = {
    total: recipients.length,
    visualizadas: recipients.filter(r => r.views_count > 0).length,
    aceitas: recipients.filter(r => r.status === 'aceita').length,
    convertidas: recipients.filter(r => r.conversions_count > 0).length,
    dispensadas: recipients.filter(r => r.status === 'dispensada').length,
    pendentes: recipients.filter(r => r.status === 'pendente').length,
  };

  const exportCsv = () => {
    const header = ['Nome', 'Email', 'Status', 'Atribuida em', 'Ultima acao', 'Visualizacoes', 'Cliques', 'Conversoes', 'Dispensas'].join(',');
    const rows = filtered.map(r => [
      JSON.stringify(r.user_name),
      JSON.stringify(r.user_email),
      r.status,
      r.assigned_at,
      r.last_action_at || '',
      r.views_count,
      r.clicks_count,
      r.conversions_count,
      r.dismissals_count,
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oferta-destinatarios-${offerId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-base">Enviar Oferta para Usuarios</h3>
        <p className="text-sm text-muted-foreground">
          Busque por e-mail ou nome do negocio. Use "Enviar agora" para entrega instantanea sem refresh do usuario.
        </p>

        <div className="space-y-2">
          <Label>Buscar Usuario</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Digite o e-mail ou nome do negocio..."
              className="pl-9"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
              {searchResults.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <Store className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{user.name || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {searching && (
            <p className="text-xs text-muted-foreground">Buscando...</p>
          )}
        </div>

        {selectedUsers.length > 0 && (
          <div className="space-y-3">
            <Label>Usuarios selecionados ({selectedUsers.length})</Label>
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map(user => (
                <Badge key={user.id} variant="secondary" className="gap-1.5 py-1 pl-2 pr-1">
                  <Mail className="h-3 w-3" />
                  <span className="max-w-[180px] truncate">{user.email}</span>
                  <button
                    onClick={() => handleRemoveSelected(user.id)}
                    className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Observacoes (opcional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Nota interna sobre esta atribuicao..."
                rows={2}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleAssign} disabled={assigning} variant="outline" className="gap-1.5">
                <UserPlus className="h-4 w-4" />
                {assigning ? 'Atribuindo...' : `Atribuir (${selectedUsers.length})`}
              </Button>
              <Button onClick={handleSendNow} disabled={assigning} className="gap-1.5">
                <Send className="h-4 w-4" />
                {assigning ? 'Enviando...' : `Enviar agora (${selectedUsers.length})`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-base">Destinatarios</h3>
            <p className="text-sm text-muted-foreground">Veja quem recebeu a oferta e qual acao foi tomada.</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            Exportar CSV
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryStat label="Atribuidas" value={totals.total} />
          <SummaryStat label="Pendentes" value={totals.pendentes} />
          <SummaryStat label="Visualizadas" value={totals.visualizadas} />
          <SummaryStat label="Aceitas" value={totals.aceitas} />
          <SummaryStat label="Convertidas" value={totals.convertidas} />
          <SummaryStat label="Dispensadas" value={totals.dispensadas} />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OfferAssignmentStatus | 'todos')}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="visualizada">Visualizada</option>
            <option value="aceita">Aceita</option>
            <option value="dispensada">Dispensada</option>
            <option value="expirada">Expirada</option>
          </select>
        </div>

        {loadingRecipients ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {recipients.length === 0 ? 'Nenhum usuario atribuido a esta oferta.' : 'Nenhum destinatario corresponde aos filtros atuais.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Usuario</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Atribuida</th>
                  <th className="py-2 px-3">Ultima acao</th>
                  <th className="py-2 px-3 text-right">Acoes</th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const statusInfo = STATUS_LABELS[r.status] || { label: r.status, variant: 'secondary' as const };
                  return (
                    <tr key={r.assignment_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[260px]">{r.user_name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[260px]">{r.user_email}</p>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.assigned_at)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.last_action_at)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1" title="Visualizacoes">
                            <Eye className="h-3.5 w-3.5" /> {r.views_count}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Cliques">
                            <MousePointerClick className="h-3.5 w-3.5" /> {r.clicks_count}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Conversoes">
                            <CheckCircle className="h-3.5 w-3.5" /> {r.conversions_count}
                          </span>
                          <span className="inline-flex items-center gap-1" title="Dispensas">
                            <XCircle className="h-3.5 w-3.5" /> {r.dismissals_count}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => openTimeline(r)}>
                            <Clock className="h-3.5 w-3.5 mr-1" /> Linha do tempo
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveAssignment(r.assignment_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Linha do tempo</DialogTitle>
            <DialogDescription>
              {timelineUser?.user_name} ({timelineUser?.user_email})
            </DialogDescription>
          </DialogHeader>
          {timelineLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : timelineEvents.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Sem eventos registrados ainda.</div>
          ) : (
            <ol className="relative border-l border-muted-foreground/30 ml-3 space-y-4 max-h-[420px] overflow-y-auto">
              {timelineEvents.map((event, idx) => (
                <li key={idx} className="ml-4">
                  <span
                    className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full"
                    style={{ background: timelineColor(event.type) }}
                  />
                  <div className="text-sm font-medium">{timelineLabel(event.type)}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(event.at)}</div>
                  {event.context && Object.keys(event.context).length > 0 && (
                    <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto">
                      {JSON.stringify(event.context, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function timelineLabel(type: OfferTimelineEvent['type']): string {
  switch (type) {
    case 'assigned': return 'Oferta atribuida';
    case 'exibida': return 'Oferta exibida';
    case 'clicada': return 'Usuario clicou em "Aproveitar"';
    case 'fechada': return 'Usuario dispensou a oferta';
    case 'convertida': return 'Conversao registrada (pagamento)';
    case 'status': return 'Mudanca de status';
    default: return String(type);
  }
}

function timelineColor(type: OfferTimelineEvent['type']): string {
  switch (type) {
    case 'assigned': return '#94a3b8';
    case 'exibida': return '#3b82f6';
    case 'clicada': return '#f59e0b';
    case 'fechada': return '#ef4444';
    case 'convertida': return '#10b981';
    default: return '#64748b';
  }
}
