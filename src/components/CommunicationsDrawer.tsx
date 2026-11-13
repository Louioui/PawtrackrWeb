'use client';

import React, { useState, useEffect } from 'react';

interface CommunicationRecord {
  id: string;
  message_type: 'booking_confirmation' | 'reminder_24h' | 'ready_for_pickup' | 'report_card_ready' | 'recall_prompt';
  channel: 'sms' | 'email';
  recipient_phone: string | null;
  recipient_email: string | null;
  body: string;
  status: 'prepared' | 'queued' | 'sent' | 'delivered' | 'failed' | 'opted_out';
  error_details: string | null;
  created_at: string;
}

interface CommunicationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  visitId?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  petName?: string;
  onMessageLogged?: () => void;
}

export default function CommunicationsDrawer({
  isOpen,
  onClose,
  visitId,
  clientPhone,
  clientEmail,
  petName,
  onMessageLogged
}: CommunicationsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'log' | 'compose'>('log');
  const [communications, setCommunications] = useState<CommunicationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compose state
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [messageType, setMessageType] = useState<'ready_for_pickup' | 'recall_prompt' | 'booking_confirmation'>('ready_for_pickup');
  const [recipient, setRecipient] = useState(clientPhone || '');
  const [body, setBody] = useState(
    petName ? `Hi! ${petName} is fresh, groomed, and ready for pickup at Pawtrackr!` : 'Hi! Your pet is ready for pickup at Pawtrackr!'
  );

  useEffect(() => {
    if (clientPhone && channel === 'sms') {
      setRecipient(clientPhone);
    } else if (clientEmail && channel === 'email') {
      setRecipient(clientEmail);
    }
  }, [clientPhone, clientEmail, channel]);

  useEffect(() => {
    if (isOpen) {
      loadCommunications();
    }
  }, [isOpen, visitId]);

  async function loadCommunications() {
    setLoading(true);
    setError(null);
    try {
      const url = visitId ? `/api/communications?visitId=${visitId}` : '/api/communications';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load message ledger');
      }
      const data = await res.json();
      setCommunications(data.communications || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching communications');
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!recipient.trim()) {
      setError('Recipient phone or email is required.');
      return;
    }
    if (!body.trim()) {
      setError('Message body cannot be empty.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload: any = {
        message_type: messageType,
        channel,
        body
      };
      if (visitId) payload.visit_id = visitId;
      if (channel === 'sms') payload.recipient_phone = recipient.trim();
      if (channel === 'email') payload.recipient_email = recipient.trim();

      const res = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to dispatch communication');
      }

      await loadCommunications();
      setActiveTab('log');
      if (onMessageLogged) onMessageLogged();
    } catch (err: any) {
      setError(err.message || 'Error sending message');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" data-testid="communications-drawer">
      <div className="relative flex h-full w-full max-w-lg flex-col bg-slate-900 text-slate-100 shadow-2xl border-l border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded">WF16 / WF17</span>
              <h2 className="text-lg font-bold text-white">Client Communications Ledger</h2>
            </div>
            <p className="text-xs text-slate-400">Audit trail, pickup notifications & carrier delivery fallbacks</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            data-testid="close-communications-drawer"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4">
          <button
            onClick={() => setActiveTab('log')}
            className={`py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'log'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            data-testid="tab-message-log"
          >
            Message Ledger ({communications.length})
          </button>
          <button
            onClick={() => setActiveTab('compose')}
            className={`py-2 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'compose'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
            data-testid="tab-compose-message"
          >
            Dispatch Notification
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'log' ? (
            loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-slate-400">Loading communication history...</div>
            ) : communications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                <span className="text-3xl mb-2">💬</span>
                <p className="text-sm font-medium">No client messages logged yet.</p>
                <p className="text-xs text-slate-500 mt-1">Ready-for-pickup alerts and report card notifications will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3" data-testid="communications-list">
                {communications.map((msg) => {
                  const isFailed = msg.status === 'failed' || msg.status === 'opted_out';
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-3 text-xs ${
                        isFailed
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                          : 'border-slate-800 bg-slate-950/60 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-slate-200 capitalize">
                          {msg.message_type.replace(/_/g, ' ')} ({msg.channel.toUpperCase()})
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            msg.status === 'delivered'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : msg.status === 'sent'
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : msg.status === 'queued'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {msg.status}
                        </span>
                      </div>
                      <p className="text-slate-300 mb-2 italic">"{msg.body}"</p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>To: {msg.recipient_phone || msg.recipient_email || 'Unknown'}</span>
                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Delivery Fallback Alert */}
                      {isFailed && (
                        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/20 p-2 text-amber-300">
                          <span className="font-bold">⚠️ Front-Desk Follow-up Required: </span>
                          Call pet parent directly at {msg.recipient_phone || 'their on-file phone'} ({msg.error_details || 'Carrier delivery issue'}).
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Channel</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setChannel('sms');
                      if (clientPhone) setRecipient(clientPhone);
                    }}
                    className={`flex-1 py-1.5 text-xs rounded border font-medium ${
                      channel === 'sms'
                        ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    SMS Text
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChannel('email');
                      if (clientEmail) setRecipient(clientEmail);
                    }}
                    className={`flex-1 py-1.5 text-xs rounded border font-medium ${
                      channel === 'email'
                        ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Email
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Notification Type</label>
                <select
                  value={messageType}
                  onChange={(e: any) => setMessageType(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
                >
                  <option value="ready_for_pickup">Ready for Pickup (WF16)</option>
                  <option value="recall_prompt">Rebooking / Recall Reminder (WF38)</option>
                  <option value="booking_confirmation">Booking Confirmation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Recipient {channel === 'sms' ? 'Phone Number' : 'Email Address'}
                </label>
                <input
                  type={channel === 'sms' ? 'tel' : 'email'}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder={channel === 'sms' ? '+1 (555) 000-0000' : 'parent@example.com'}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
                  data-testid="communication-recipient-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Message Body</label>
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
                  data-testid="communication-body-input"
                />
              </div>

              <div className="rounded border border-slate-800 bg-slate-950/40 p-2 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300">Message Independence Rule:</span> Text/email dispatch failures will never alter appointment status. Any carrier delivery failure generates a front-desk phone follow-up task.
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={submitting}
                className="w-full rounded bg-teal-600 py-2.5 text-xs font-bold text-white hover:bg-teal-500 disabled:opacity-50"
                data-testid="submit-communication-btn"
              >
                {submitting ? 'Dispatching...' : 'Dispatch Message'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
