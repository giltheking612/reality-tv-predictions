import type { Metadata } from 'next'
import { Rubik } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'
import { createClient } from '@/lib/supabase/server'

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  variable: '--font-rubik',
})

export const metadata: Metadata = {
  title: 'חיזויי ריאליטי',
  description: 'אתר חיזויים לתוכניות ריאליטי ישראליות',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let displayName = ''
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    displayName = profile?.display_name ?? ''
  }

  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {user && displayName && <Nav displayName={displayName} />}
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  )
}
