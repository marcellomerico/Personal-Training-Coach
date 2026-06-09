'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/lib/api';

// Root leitet je nach Login-Status auf Dashboard oder Login.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    getMe()
      .then(() => router.replace('/dashboard'))
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <div className="center-screen">
      <p className="muted">Lade …</p>
    </div>
  );
}
