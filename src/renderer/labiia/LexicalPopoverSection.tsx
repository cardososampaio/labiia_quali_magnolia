/**
 * The lexical analyses inside the compact toolbar's "Analyse" menu.
 *
 * With the compact toolbar (Preferences → toolbar style), this menu is the
 * only way to reach the analyses, so it must list the twelve lexical
 * analyses as well as Magnolia's own tools. The tiles show only the name to
 * keep the menu short; the description is the tooltip.
 */
import { useTranslation } from 'react-i18next'
import { Icon, type IconComponent } from '../components/Icon'
import { LEXICAL_TESTS, lexicalToolType } from '../components/Lexical/lexical-catalog'
import { PALETTE_ICON_CLASS } from '../utils/icon-tint'
import type { AnalysisToolType } from '../models/types'
import type { LexicalTestId } from '../models/lexical-api'

/** Same order as the ribbon's Lexical tab: exploration, structure, keywords. */
const ORDER: LexicalTestId[] = [
  'wordcloud', 'word-tree', 'bigrams', 'trigrams',
  'chd', 'similitude', 'thematic-map', 'lda',
  'yake', 'keyword-associations', 'sentiment', 'emotions'
]

export function LexicalPopoverSection({ onSelect }: { onSelect: (toolType: AnalysisToolType) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="analysis-popover-title" style={{ marginTop: 14 }}>{t('labiia.ribbon.tabLexical')}</div>
      <div className="analysis-popover-grid">
        {ORDER.map((id) => LEXICAL_TESTS.find((d) => d.id === id)).map((def) => {
          if (!def) return null
          const ToolIcon: IconComponent = def.icon
          return (
            <button
              key={def.id}
              type="button"
              role="menuitem"
              className="analysis-popover-tile"
              title={def.description}
              onClick={() => onSelect(lexicalToolType(def.id))}
            >
              <Icon icon={ToolIcon} className={PALETTE_ICON_CLASS} style={{ fontSize: 14 }} />
              <div className="analysis-popover-tile-name">{def.label}</div>
            </button>
          )
        })}
      </div>
    </>
  )
}
