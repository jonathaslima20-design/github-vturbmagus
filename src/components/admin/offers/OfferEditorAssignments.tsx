import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, X, Trash2, Mail, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { fetchAssignments, assignOfferToUsers, removeAssignment } from '@/lib/offerService';
import type { OfferUserAssignment } from '@/types/offers';

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

interface AssignmentWithUser extends OfferUserAssignment {
  user?: { name: string; email: string };
}

export function OfferEditorAssignments({ offerId, adminUserId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);
  const [notes, setNotes] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentWithUser[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  useEffect(() => {
    loadAssignments();
  }, [offerId]);

  const loadAssignments = async () => {
    try {
      setLoadingAssignments(true);
      const data = await fetchAssignments(offerId);
      setAssignments(data);
    } catch (err) {
      console.error('Error loading assignments:', err);
    } finally {
      setLoadingAssignments(false);
    }
  };

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
      const alreadyAssignedIds = assignments.map(a => a.user_id);
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
  }, [assignments, selectedUsers]);

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
      await assignOfferToUsers(offerId, selectedUsers.map(u => u.id), adminUserId, notes);
      toast.success(`Oferta atribuida a ${selectedUsers.length} usuario${selectedUsers.length > 1 ? 's' : ''}`);
      setSelectedUsers([]);
      setNotes('');
      await loadAssignments();
    } catch (err) {
      console.error('Assign error:', err);
      toast.error('Erro ao atribuir oferta');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      await removeAssignment(assignmentId);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      toast.success('Atribuicao removida');
    } catch (err) {
      toast.error('Erro ao remover atribuicao');
    }
  };

  const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    pendente: { label: 'Pendente', variant: 'secondary' },
    visualizada: { label: 'Visualizada', variant: 'outline' },
    aceita: { label: 'Aceita', variant: 'default' },
    dispensada: { label: 'Dispensada', variant: 'destructive' },
    expirada: { label: 'Expirada', variant: 'destructive' },
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-base">Enviar Oferta para Usuarios</h3>
        <p className="text-sm text-muted-foreground">
          Busque por e-mail ou nome do negocio para enviar esta oferta diretamente.
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

            <Button onClick={handleAssign} disabled={assigning} className="gap-1.5">
              <UserPlus className="h-4 w-4" />
              {assigning ? 'Atribuindo...' : `Atribuir Oferta (${selectedUsers.length})`}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold text-base">
          Usuarios Atribuidos
          {assignments.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({assignments.length})</span>
          )}
        </h3>

        {loadingAssignments ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : assignments.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum usuario atribuido a esta oferta.
          </div>
        ) : (
          <div className="space-y-2">
            {assignments.map(assignment => (
              <div
                key={assignment.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border bg-muted/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {assignment.user?.name || 'Usuario'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {assignment.user?.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusLabels[assignment.status]?.variant || 'secondary'}>
                    {statusLabels[assignment.status]?.label || assignment.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveAssignment(assignment.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
