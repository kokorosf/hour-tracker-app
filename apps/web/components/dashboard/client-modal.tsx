'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/../components/ui/modal';
import Input from '@/../components/ui/input';
import Button from '@/../components/ui/button';
import { useToast } from '@/../components/ui/toast';
import { api } from '@/lib/api/client';

export interface ClientForModal {
  id: string;
  name: string;
}

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  client: ClientForModal | null;
}

export default function ClientModal({ isOpen, onClose, onSaved, client }: ClientModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = client !== null;

  useEffect(() => {
    if (isOpen) {
      setName(client?.name ?? '');
      setError('');
      setSaving(false);
    }
  }, [isOpen, client]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = name.trim();
      if (!trimmed) {
        setError('Name is required.');
        return;
      }

      setSaving(true);
      setError('');

      try {
        if (isEdit) {
          await api.put(`/api/clients/${client.id}`, { name: trimmed });
          showToast('Client updated.', 'success');
        } else {
          await api.post('/api/clients', { name: trimmed });
          showToast('Client created.', 'success');
        }
        onSaved();
        onClose();
      } catch (err) {
        const message = (err as Error).message || 'Failed to save client.';
        setError(message);
        showToast(message, 'error');
      } finally {
        setSaving(false);
      }
    },
    [name, isEdit, client, onSaved, onClose, showToast],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Client' : 'Add Client'}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {isEdit ? 'Save Changes' : 'Add Client'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input
          label="Client Name"
          value={name}
          onChange={setName}
          placeholder="e.g. Acme Corp"
          required
          error={error}
          disabled={saving}
        />
      </form>
    </Modal>
  );
}
