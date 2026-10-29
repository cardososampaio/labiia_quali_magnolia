import { Icon, faUpRightFromSquare } from '../Icon'
import { t } from '../../i18n'
import { BUNDLED_LIBRARIES, LEXICAL_CREDITS, R_CREDITS, type CreditRow } from './credits'

interface Props {
  open: boolean
  onClose: () => void
}

function SectionTitle({ children }: { children: string }): JSX.Element {
  return <h3 style={{ margin: '20px 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{children}</h3>
}

function SectionIntro({ children }: { children: string }): JSX.Element {
  return <p style={{ margin: '0 0 10px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{children}</p>
}

/** One credits table: name and role on the left, licence on the right. */
function CreditTable({ rows }: { rows: CreditRow[] }): JSX.Element {
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

export function LicenceDialog({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 620, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>{t("Licence & Attributions")}</h2>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--font-size-base)', lineHeight: 1.5 }}>
            <strong>{t("labiia_quali is free and open-source software, based on Magnolia by Cale Davis.")}</strong>
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {t("Released under the")}{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{t("European Union Public Licence (EUPL) v1.2")}</strong>{t(". You are free to use, study, copy, modify, and redistribute the software, including for commercial purposes. Derivative works must be distributed under the EUPL or one of its compatible licences, and their source code must be made available.")}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {t('Original work: Magnolia, © 2026 Cale Davis (github.com/caledavis/Magnolia).')}
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {t('This version and the lexical analyses: Rafael Cardoso Sampaio (UFPE, labiia_lab), from labiia_lex (github.com/cardososampaio/labiia_lex), with the collaboration of Anderson Henrique, Dalson Figueiredo, Ian Batista, Leonardo Nascimento and Nilton Sainz.')}
          </p>

          <button
            className="secondary"
            onClick={() => window.api.openLicence()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}
          >
            {t("View full licence text")}{' '}<Icon icon={faUpRightFromSquare} style={{ fontSize: 10 }} />
          </button>

          <SectionTitle>{t("Bundled libraries")}</SectionTitle>
          <SectionIntro>{t("labiia_quali is built on top of these open-source projects. Full attribution and licence text for every dependency is bundled with the app.")}</SectionIntro>
          <CreditTable rows={BUNDLED_LIBRARIES} />

          <SectionTitle>{t("Lexical analyses: origin, resources and methods")}</SectionTitle>
          <SectionIntro>{t("The lexical analyses come from labiia_lex and, through it, from IRaMuTeQ. The dictionaries and lexicons below ship with the program; the methods are reimplemented from their publications.")}</SectionIntro>
          <CreditTable rows={LEXICAL_CREDITS} />

          <SectionTitle>{t("R and R packages")}</SectionTitle>
          <SectionIntro>{t("Word cloud, CHD, Similitude, Emotions and LDA run in R with these CRAN packages. They are not bundled: the installer or the program downloads them from CRAN, each under its own licence.")}</SectionIntro>
          <CreditTable rows={R_CREDITS} />

          <button
            className="secondary"
            onClick={() => window.api.openAcknowledgements()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12 }}
          >
            {t("View full attributions")}{' '}<Icon icon={faUpRightFromSquare} style={{ fontSize: 10 }} />
          </button>
        </div>

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button onClick={onClose}>{t("Close")}</button>
        </div>
      </div>
    </div>
  )
}
