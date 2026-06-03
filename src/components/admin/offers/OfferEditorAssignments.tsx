import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, UserPlus, X, Trash2, Mail, Store, Send, Eye, MousePointerClick, CircleCheck as CheckCircle, Circle as XCircle, Clock, ArrowUp, ArrowDown, ArrowUpDown, Bot, User as UserIcon } from 'lucide-react';
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

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

type SortKey = 'user_name' | 'status' | 'assigned_at' | 'last_action_at' | 'views_count' | 'clicks_count' | 'conversions_count' | 'dismissals_count';
type SortDir = 'asc' | 'desc';

const STATUS_BAR_COLORS: Record<OfferAssignmentStatus, string> = {
  pendente: '#94a3b8',
  visualizada: '#3b82f6',
  aceita: '#10b981',
  dispensada: '#ef4444',
  expirada: '#64748b',
};

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
  const [sortKey, setSortKey] = useState<SortKey>('assigned_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  const filtered = useMemo(() => {
    const list = recipients.filter(r => {
      if (statusFilter !== 'todos' && r.status !== statusFilter) return false;
      if (recipientSearch.trim()) {
        const q = recipientSearch.toLowerCase();
        if (!r.user_name.toLowerCase().includes(q) && !r.user_email.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });

    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });

    return sorted;
  }, [recipients, statusFilter, recipientSearch, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'user_name' ? 'asc' : 'desc');
    }
  };

  const totals = {
    total: recipients.length,
    visualizadas: recipients.filter(r => r.views_count > 0).length,
    aceitas: recipients.filter(r => r.status === 'aceita').length,
    convertidas: recipients.filter(r => r.conversions_count > 0).length,
    dispensadas: recipients.filter(r => r.status === 'dispensada').length,
    pendentes: recipients.filter(r => r.status === 'pendente').length,
  };

  const distribution = useMemo(() => {
    const counts: Record<OfferAssignmentStatus, number> = {
      pendente: 0,
      visualizada: 0,
      aceita: 0,
      dispensada: 0,
      expirada: 0,
    };
    for (const r of recipients) counts[r.status] += 1;
    const total = recipients.length || 1;
    return (Object.keys(counts) as OfferAssignmentStatus[])
      .map(status => ({
        status,
        count: counts[status],
        percent: (counts[status] / total) * 100,
      }))
      .filter(item => item.count > 0);
  }, [recipients]);

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
          <SummaryStat
            label="Atribuidas"
            value={totals.total}
            active={statusFilter === 'todos'}
            onClick={() => setStatusFilter('todos')}
          />
          <SummaryStat
            label="Pendentes"
            value={totals.pendentes}
            active={statusFilter === 'pendente'}
            onClick={() => setStatusFilter(statusFilter === 'pendente' ? 'todos' : 'pendente')}
          />
          <SummaryStat
            label="Visualizadas"
            value={totals.visualizadas}
            active={statusFilter === 'visualizada'}
            onClick={() => setStatusFilter(statusFilter === 'visualizada' ? 'todos' : 'visualizada')}
          />
          <SummaryStat
            label="Aceitas"
            value={totals.aceitas}
            active={statusFilter === 'aceita'}
            onClick={() => setStatusFilter(statusFilter === 'aceita' ? 'todos' : 'aceita')}
          />
          <SummaryStat
            label="Convertidas"
            value={totals.convertidas}
            highlight
          />
          <SummaryStat
            label="Dispensadas"
            value={totals.dispensadas}
            active={statusFilter === 'dispensada'}
            onClick={() => setStatusFilter(statusFilter === 'dispensada' ? 'todos' : 'dispensada')}
          />
        </div>

        {distribution.length > 0 && (
          <div className="space-y-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {distribution.map(item => (
                <div
                  key={item.status}
                  style={{
                    width: `${item.percent}%`,
                    backgroundColor: STATUS_BAR_COLORS[item.status],
                  }}
                  title={`${STATUS_LABELS[item.status]?.label ?? item.status}: ${item.count} (${item.percent.toFixed(1)}%)`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {distribution.map(item => (
                <span key={item.status} className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATUS_BAR_COLORS[item.status] }}
                  />
                  {STATUS_LABELS[item.status]?.label ?? item.status} - {item.count} ({item.percent.toFixed(1)}%)
                </span>
              ))}
            </div>
          </div>
        )}

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
                <tr className="border-b text-left text-xs uppercase tracking-wider">
                  <th className="py-2 pr-3">
                    <SortableHeader label="Usuario" sortKey="user_name" currentSort={sortKey} currentDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="py-2 px-3">
                    <SortableHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="py-2 px-3">
                    <SortableHeader label="Atribuida" sortKey="assigned_at" currentSort={sortKey} currentDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="py-2 px-3">
                    <SortableHeader label="Ultima acao" sortKey="last_action_at" currentSort={sortKey} currentDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th className="py-2 px-3 text-right">
                    <SortableHeader label="Engajamento" sortKey="views_count" currentSort={sortKey} currentDir={sortDir} onToggle={toggleSort} align="right" />
                  </th>
                  <th className="py-2 pl-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const statusInfo = STATUS_LABELS[r.status] || { label: r.status, variant: 'secondary' as const };
                  return (
                    <tr key={r.assignment_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {r.user_avatar_url ? (
                              <img src={r.user_avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <span className="text-xs font-semibold text-primary">
                                {(r.user_name || r.user_email || '?').slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[220px]">{r.user_name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[220px]">{r.user_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">{formatDateTime(r.assigned_at)}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div>{formatDateTime(r.last_action_at)}</div>
                        {r.time_to_click_seconds != null && (
                          <div className="text-[11px] text-muted-foreground">
                            Tempo ate clique: {formatDuration(r.time_to_click_seconds)}
                          </div>
                        )}
                      </td>
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
              {timelineEvents.map((event, idx) => {
                const isAuto = isAutoEvent(event);
                return (
                  <li key={idx} className="ml-4">
                    <span
                      className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full"
                      style={{ background: timelineColor(event.type) }}
                    />
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">{timelineLabel(event.type)}</div>
                      <Badge
                        variant={isAuto ? 'outline' : 'secondary'}
                        className="gap-1 px-1.5 py-0 text-[10px] h-5"
                      >
                        {isAuto ? <Bot className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                        {isAuto ? 'Automatico' : 'Usuario'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(event.at)}</div>
                    {event.context && Object.keys(event.context).length > 0 && (
                      <pre className="mt-1 text-[11px] bg-muted/50 rounded p-2 overflow-x-auto">
                        {JSON.stringify(event.context, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SummaryStatProps {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
  highlight?: boolean;
}

function SummaryStat({ label, value, active, onClick, highlight }: SummaryStatProps) {
  const interactive = typeof onClick === 'function';
  const baseClass = 'rounded-lg border px-3 py-2 text-left transition-colors';
  const bgClass = highlight
    ? 'bg-emerald-500/10 border-emerald-500/40'
    : active
      ? 'bg-primary/10 border-primary/40'
      : 'bg-muted/20';
  const interactionClass = interactive ? 'hover:border-primary/60 hover:bg-primary/5 cursor-pointer' : '';
  const labelClass = highlight
    ? 'text-emerald-600 dark:text-emerald-400'
    : active
      ? 'text-primary'
      : 'text-muted-foreground';

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={`${baseClass} ${bgClass} ${interactionClass}`}>
        <div className={`text-xs ${labelClass}`}>{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </button>
    );
  }

  return (
    <div className={`${baseClass} ${bgClass}`}>
      <div className={`text-xs ${labelClass}`}>{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onToggle,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort === sortKey;
  const Icon = isActive ? (currentDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${
        isActive ? 'text-foreground' : 'text-muted-foreground'
      } hover:text-foreground transition-colors`}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
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

function isAutoEvent(event: OfferTimelineEvent): boolean {
  if (event.type === 'convertida') return true;
  if (event.type === 'assigned') return true;
  const source = event.context && typeof event.context === 'object'
    ? (event.context as Record<string, unknown>).source
    : undefined;
  if (typeof source === 'string') {
    return ['mp-webhook', 'mp-poll', 'mp-card', 'system', 'cron'].includes(source);
  }
  return false;
}
