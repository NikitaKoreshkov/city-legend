'use client';

import { useState } from 'react';
import { adminBtnPrimary, adminInputStyle } from '@/app/components/admin/adminUi';
import { SubscriberPicker, type SubscriberPick } from '@/app/components/admin/SubscriberPicker';

/** Send lot link to bot subscriber from auction edit modal */
export function SendLotToBotPanel({ auctionId, lotName }: { auctionId: number; lotName: string }) {
  const [subscriber, setSubscriber] = useState<SubscriberPick | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const send = async () => {
    if (!subscriber) {
      setResult('Выберите подписчика');
      return;
    }
    setLoading(true);
    setResult('');
    try {
      const res = await fetch(`/api/admin/bots/subscribers/${subscriber.id}/send-lot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId, text: text || undefined, sendToAllPlatforms: true }),
      });
      const data = await res.json();
      if (res.ok) {
        const n = data.sentCount ?? 1;
        setResult(n > 1 ? `Отправлено в ${n} канала (TG+Max)` : `Отправлено: ${subscriber.first_name || `#${subscriber.id}`}`);
      } else {
        setResult(data.error || 'Ошибка');
      }
    } catch {
      setResult('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-[#0b2a24]/20 bg-[#0b2a24]/[0.03] p-4 space-y-3">
      <p className="text-sm font-medium text-[#0b2a24]">Отправить товар в бот</p>
      <p className="text-xs text-gray-500">
        Товар: <strong>{lotName}</strong>. Подписчик получит ссылку на карточку товара в Telegram и/или Max.
      </p>
      <SubscriberPicker value={subscriber} onChange={setSubscriber} placeholder="Найти по имени или телефону…" />
      <textarea
        rows={2}
        placeholder="Текст (необязательно). {имя} — имя подписчика"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ ...adminInputStyle, resize: 'vertical' }}
        className="w-full text-sm"
      />
      <button
        type="button"
        disabled={loading || !subscriber}
        onClick={() => void send()}
        className={adminBtnPrimary}
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        {loading ? 'Отправка…' : 'Отправить в бот'}
      </button>
      {result ? <p className={`text-xs ${result.startsWith('Отправлено') ? 'text-green-700' : 'text-red-600'}`}>{result}</p> : null}
    </div>
  );
}
