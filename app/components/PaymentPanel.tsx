'use client';

import { PaymentFlow } from './PaymentFlow';

export default function PaymentPanel() {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full max-w-6xl mx-auto overflow-hidden">
      <PaymentFlow embedded />
    </div>
  );
}
