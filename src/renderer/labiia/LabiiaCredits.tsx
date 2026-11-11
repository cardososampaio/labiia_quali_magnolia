/**
 * labiia_quali's credits, shown under Magnolia's list of bundled libraries
 * in Help → Licence & Attributions: where the lexical analyses come from
 * (labiia_lex, IRaMuTeQ), the dictionaries and lexicons shipped with the
 * program, the methods reimplemented, and R with the CRAN packages the
 * R-based analyses run on.
 */
import { useTranslation } from 'react-i18next'
import { LEXICAL_CREDITS, R_CREDITS, type CreditRow } from '../components/Licence/credits'

function SectionTitle({ children }: { children: string }) {
  return <h3 style={{ margin: '20px 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>
}

function SectionIntro({ children }: { children: string }) {
  return <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{children}</p>
}

/** One credits table: name and role on the left, licence on the right. */
function CreditTable({ rows }: { rows: CreditRow[] }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      {rows.map((row, i) => (
        <div
          key={row.name}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            alignItems: 'baseline',
            gap: 12,
            padding: '8px 12px',
            fontSize: 'var(--font-size-sm)',
            borderTop: i === 0 ? 'none' : '1px solid var(--border-color)'
          }}
        >
          <span>
            <strong>{row.name}</strong>
            <span style={{ color: 'var(--text-muted)' }}> — {row.role}</span>
            {row.note && <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--danger)' }}>{row.note}</span>}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {row.licence}
          </span>
        </div>
      ))}
    </div>
  )
}

export function LabiiaCredits() {
  const { t } = useTranslation()
  return (
    <>
      <SectionTitle>{t('labiia.credits.lexicalTitle')}</SectionTitle>
      <SectionIntro>{t('labiia.credits.lexicalIntro')}</SectionIntro>
      <CreditTable rows={LEXICAL_CREDITS} />

      <SectionTitle>{t('labiia.credits.rTitle')}</SectionTitle>
      <SectionIntro>{t('labiia.credits.rIntro')}</SectionIntro>
      <CreditTable rows={R_CREDITS} />
    </>
  )
}
