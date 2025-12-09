import { NextResponse } from 'next/server';

// Route disabled: frontend posts directly to Power Automate webhook
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Contact route disabled. Frontend posts directly to Power Automate webhook.',
    },
    { status: 410 }
  );
}
