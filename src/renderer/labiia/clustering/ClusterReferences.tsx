import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDocumentStore } from '../../stores/document-store'
import { useSurveyViewStore } from '../../stores/survey-view-store'
import type { SharedReferenceEntry } from './model'

const VISIBLE_REFERENCES = 100

export function ClusterReferences({
  first,
  second,
  references,
  sourceNames,
  codeNames,
  onClose
}: {
  first: string
  second: string
  references: SharedReferenceEntry[]
  sourceNames: Map<string, string>
  codeNames: Map<string, string>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [limit, setLimit] = useState(VISIBLE_REFERENCES)
  const title =
    first === second
      ? t('labiia.clustering.singleTitle', { item: first })
      : t('labiia.clustering.sharedTitle', { first, second })

  return (
    <section className="analysis-section" aria-label={title}>
      <div className="labiia-cluster-controls">
        <h3>{title}</h3>
        <button type="button" className="secondary" onClick={onClose}>
          {t('labiia.clustering.closeReferences')}
        </button>
      </div>
      {!references.length ? (
        <p>{t('labiia.clustering.noSharedReferences')}</p>
      ) : (
        <>
          <p>
            {t('labiia.clustering.referenceCount', {
              shown: Math.min(limit, references.length),
              total: references.length
            })}
          </p>
          <ol>
            {references.slice(0, limit).map(({ document, unitLabel, selection, matchedCodes }, idx) => {
              const docLabel = unitLabel ?? sourceNames.get(document) ?? document
              return (
                <li key={`${document}/${selection.guid}/${idx}`}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const cell = selection.surveyCell
                      if (cell) {
                        const surveyView = useSurveyViewStore.getState()
                        surveyView.setView(document, 'respondent', cell.respondentId)
                        surveyView.setScrollTarget({ surveyGuid: document, ...cell })
                      }
                      useDocumentStore.getState().viewDocumentAt(
                        document,
                        selection.startPosition,
                        selection.endPosition,
                        selection.pdfRegion,
                        selection.timeRange
                      )
                    }}
                  >
                    {selection.name
                      ? t('labiia.clustering.openNamedReference', {
                          document: docLabel,
                          selection: selection.name
                        })
                      : t('labiia.clustering.openReference', { document: docLabel })}
                  </button>
                  {' · '}
                  {matchedCodes.map((guid) => codeNames.get(guid) ?? guid).join(', ')}
                </li>
              )
            })}
          </ol>
          {limit < references.length && (
            <button
              type="button"
              className="secondary"
              onClick={() => setLimit((value) => value + VISIBLE_REFERENCES)}
            >
              {t('labiia.clustering.moreReferences')}
            </button>
          )}
        </>
      )}
    </section>
  )
}
