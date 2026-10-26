'use client';

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changeOwnPassword, passwordChangeError } from '@/lib/supabase/auth';

interface ChangePasswordDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSaving(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    const validation = passwordChangeError(currentPassword, newPassword, confirmPassword);
    if (validation) {
      setError(validation);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      toast.success('Clave actualizada. Úsela en el próximo ingreso.');
      handleOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la clave.');
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-[#cf1b22]" />
            Actualizar clave
          </DialogTitle>
          <DialogDescription>
            La clave nueva queda asociada a su usuario. Se confirma la clave actual antes de
            guardarla.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="clave-actual">Clave actual</Label>
            <Input
              id="clave-actual"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clave-nueva">Nueva clave</Label>
            <Input
              id="clave-nueva"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clave-confirmar">Confirmar nueva clave</Label>
            <Input
              id="clave-confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={saving}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-[#cf1b22] hover:bg-[#a81419] text-white"
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {saving ? 'Guardando…' : 'Actualizar clave'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
