'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Upload,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Calendar,
  AlertCircle,
  Clock,
} from 'lucide-react';
import {
  DocumentType,
  DocumentStatus,
  DOCUMENT_TYPES,
  formatDocumentTypeLabel,
  isDocumentExpired,
} from '@/lib/media-and-documents';

export interface PetDocumentItem {
  id: string;
  pet_id: string;
  client_id: string;
  document_type: DocumentType;
  file_path: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string;
  status: DocumentStatus;
  verification_notes: string | null;
  verified_at: string | null;
  expires_at: string | null;
  created_at: string;
  signed_url?: string | null;
}

export interface PetDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pet: {
    id: string;
    name: string;
    breed: string;
    rabies_verified: boolean;
    client_id: string;
  } | null;
  getAccessToken: () => Promise<string | null>;
  onPetUpdated?: () => void;
}

export default function PetDocumentsModal({
  isOpen,
  onClose,
  pet,
  getAccessToken,
  onPetUpdated,
}: PetDocumentsModalProps) {
  const [documents, setDocuments] = useState<PetDocumentItem[]>([]);
  const [rabiesVerified, setRabiesVerified] = useState<boolean>(pet?.rabies_verified ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Upload Form state
  const [docType, setDocType] = useState<DocumentType>('rabies_certificate');
  const [fileName, setFileName] = useState('');
  const [filePath, setFilePath] = useState('');
  const [uploading, setUploading] = useState(false);

  // Verification state for selected doc
  const [verifyingDocId, setVerifyingDocId] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'verified' | 'rejected'>('verified');
  const [expiresAt, setExpiresAt] = useState('');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [submittingVerify, setSubmittingVerify] = useState(false);

  useEffect(() => {
    if (!isOpen || !pet) return;
    setRabiesVerified(pet.rabies_verified);
    setError(null);
    setSuccess(null);
    setVerifyingDocId(null);

    async function loadDocs() {
      setLoading(true);
      try {
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch(`/api/pets/${pet!.id}/documents`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const body = await res.json();
          setDocuments(body.documents || []);
          if (body.pet) {
            setRabiesVerified(body.pet.rabies_verified);
          }
        } else {
          setError('Failed to load pet documents.');
        }
      } catch {
        setError('Connection issue loading documents.');
      } finally {
        setLoading(false);
      }
    }

    void loadDocs();
  }, [isOpen, pet, getAccessToken]);

  if (!isOpen || !pet) return null;

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim() || !filePath.trim()) {
      setError('File name and storage path are required.');
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Signed in session required.');

      const res = await fetch(`/api/pets/${pet.id}/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          petId: pet.id,
          clientId: pet.client_id,
          documentType: docType,
          filePath: filePath.trim(),
          fileName: fileName.trim(),
          mimeType: 'application/pdf',
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Failed to upload document.');
      }

      setSuccess(`Document "${fileName}" registered successfully.`);
      setFileName('');
      setFilePath('');

      // Refresh documents
      const reloadRes = await fetch(`/api/pets/${pet.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reloadRes.ok) {
        const reloadBody = await reloadRes.json();
        setDocuments(reloadBody.documents || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleVerify = async (docId: string) => {
    setSubmittingVerify(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Signed in session required.');

      const res = await fetch(`/api/pets/${pet.id}/documents/${docId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: verifyStatus,
          expiresAt: expiresAt || null,
          notes: verifyNotes.trim() || null,
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Verification action failed.');
      }

      setSuccess(`Document marked as ${verifyStatus}.`);
      setVerifyingDocId(null);
      setVerifyNotes('');
      setExpiresAt('');

      // Refresh docs and pet
      const reloadRes = await fetch(`/api/pets/${pet.id}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reloadRes.ok) {
        const reloadBody = await reloadRes.json();
        setDocuments(reloadBody.documents || []);
        if (reloadBody.pet) {
          setRabiesVerified(reloadBody.pet.rabies_verified);
        }
      }
      onPetUpdated?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmittingVerify(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-obsidian-950 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-periwinkle-400/10 text-periwinkle-300">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {pet.name}’s Medical Documents & Vaccine Vault
              </h2>
              <p className="text-xs text-zinc-400">{pet.breed} · Eligibility & Health Records (WF20)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Rabies Status Badge */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            {rabiesVerified ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-rose-400" />
            )}
            <div>
              <div className="text-xs font-semibold text-white">
                Rabies Vaccine Eligibility Status
              </div>
              <div className="text-[11px] text-zinc-400">
                {rabiesVerified
                  ? 'Active verified rabies certificate on file. Eligible for all grooming packages.'
                  : 'No active rabies certificate verified. Grooming may be restricted by salon policy.'}
              </div>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              rabiesVerified
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/20 text-rose-300'
            }`}
          >
            {rabiesVerified ? 'Verified' : 'Action Required'}
          </span>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Documents List */}
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Uploaded Documents ({documents.length})
          </h3>

          {loading ? (
            <div className="mt-2 p-4 text-center text-xs text-zinc-400">Loading documents…</div>
          ) : documents.length === 0 ? (
            <div className="mt-2 rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
              No documents uploaded for this pet yet.
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {documents.map((doc) => {
                const expired = isDocumentExpired(doc.expires_at);
                const isVerifying = verifyingDocId === doc.id;

                return (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-white/10 bg-obsidian-900/60 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-white">
                          {formatDocumentTypeLabel(doc.document_type)}
                        </div>
                        <div className="text-[11px] text-zinc-400">{doc.file_name}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                            doc.status === 'verified' && !expired
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : doc.status === 'rejected' || expired
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {expired ? 'Expired' : doc.status}
                        </span>

                        {doc.signed_url && (
                          <a
                            href={doc.signed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/20"
                          >
                            <ExternalLink className="h-3 w-3" /> View (15m signed link)
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setVerifyingDocId(isVerifying ? null : doc.id)}
                          className="rounded border border-white/10 px-2 py-1 text-[11px] text-periwinkle-300 hover:bg-white/5"
                        >
                          {isVerifying ? 'Close' : 'Review / Verify'}
                        </button>
                      </div>
                    </div>

                    {/* Expiry and Notes */}
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-zinc-400">
                      {doc.expires_at && (
                        <div>
                          Expires: <strong className="text-zinc-200">{doc.expires_at}</strong>
                        </div>
                      )}
                      {doc.verification_notes && (
                        <div>
                          Notes: <span className="text-zinc-300">{doc.verification_notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Verification Form */}
                    {isVerifying && (
                      <div className="mt-3 rounded-lg border border-periwinkle-400/20 bg-periwinkle-950/20 p-3">
                        <div className="text-xs font-bold text-white">Staff Verification Review</div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div>
                            <label className="block text-[11px] text-zinc-400">Action</label>
                            <select
                              value={verifyStatus}
                              onChange={(e) =>
                                setVerifyStatus(e.target.value as 'verified' | 'rejected')
                              }
                              className="mt-1 w-full rounded border border-white/10 bg-obsidian-950 p-1.5 text-xs text-white"
                            >
                              <option value="verified">Verify & Approve</option>
                              <option value="rejected">Reject / Request Clearer Copy</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] text-zinc-400">
                              Expiration Date (if applicable)
                            </label>
                            <input
                              type="date"
                              value={expiresAt}
                              onChange={(e) => setExpiresAt(e.target.value)}
                              className="mt-1 w-full rounded border border-white/10 bg-obsidian-950 p-1.5 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="mt-2">
                          <label className="block text-[11px] text-zinc-400">Verification Notes</label>
                          <input
                            type="text"
                            placeholder="e.g. Clinic Rabies Tag #4921 verified with Valley Vet"
                            value={verifyNotes}
                            onChange={(e) => setVerifyNotes(e.target.value)}
                            className="mt-1 w-full rounded border border-white/10 bg-obsidian-950 p-1.5 text-xs text-white"
                          />
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            disabled={submittingVerify}
                            onClick={() => handleVerify(doc.id)}
                            className="rounded bg-emerald-400 px-3 py-1.5 text-xs font-bold text-obsidian-950 hover:bg-emerald-300 disabled:opacity-50"
                          >
                            {submittingVerify ? 'Saving…' : 'Submit Review'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setVerifyingDocId(null)}
                            className="rounded border border-white/10 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="mt-6 border-t border-white/10 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Intake / Upload New Document
          </h3>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] text-zinc-400">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-obsidian-900 p-2 text-xs text-white"
              >
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatDocumentTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-400">File Name</label>
              <input
                type="text"
                placeholder="e.g. rabies_cert_2026.pdf"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-obsidian-900 p-2 text-xs text-white"
              />
            </div>
          </div>

          <div className="mt-2.5">
            <label className="block text-[11px] text-zinc-400">
              Storage Path in <code>pet-documents</code> (e.g. {pet.client_id.slice(0, 8)}/rabies.pdf)
            </label>
            <input
              type="text"
              placeholder="e.g. 11111111-1111-4111-8111-111111111111/pet/rabies.pdf"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-obsidian-900 p-2 text-xs text-white"
            />
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-periwinkle-400 px-4 py-2 text-xs font-bold text-obsidian-950 hover:bg-periwinkle-300 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? 'Registering…' : 'Register Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
