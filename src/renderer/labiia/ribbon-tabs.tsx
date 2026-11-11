/**
 * labiia_quali's ribbon: the tabs and buttons, organised as in labiia_quali
 * 0.1 (Home, Analyses, Lexical analyses, View, Help), with Magnolia 2.1's
 * newer actions (the Memos window) in their place. A button's tile colour
 * says which family its action belongs to, the same colour in every tab.
 *
 * App.tsx passes in the actions it owns; everything else is decided here,
 * so a new Magnolia release that changes App.tsx touches one call.
 */
import type { RibbonButtonDef, RibbonFamily, RibbonMenuItem, RibbonTabDef } from '../components/Toolbar/Ribbon'
import type { AnalysisToolType } from '../models/types'
import type { LexicalTestId } from '../models/lexical-api'
import { LEXICAL_TESTS, lexicalToolType } from '../components/Lexical/lexical-catalog'
import { TOOL_REGISTRY } from '../utils/tool-registry'
import {
  faBook,
  faFileAlt,
  faFilePlus,
  faFolderOpen,
  faFolderPlus,
  faGear,
  faGitMerge,
  faCircleInfo,
  faMagnifyingGlass,
  faMoon,
  faNotebookPen,
  faPanelsTopLeft,
  faScale,
  faSquareArrowRightEnter,
  faSun,
  faTags,
  faZoomIn,
  faZoomOut,
  type IconComponent
} from '../components/Icon'
import { t } from '../i18n'
import { MANUAL_URL } from './config'

export type LabiiaPanel = 'documents' | 'codes' | 'queries' | 'memos' | 'quotes' | 'analyses'

export interface RibbonActions {
  newProject: () => void
  openProject: () => void
  importSources: () => void
  newFolder: () => void
  mergeProjects: () => void
  projectDetails: () => void
  openCodebook: () => void
  manageTags: () => void
  openLogbook: () => void
  openMemos: () => void
  openQuery: () => void
  openAnalysis: (toolType: AnalysisToolType) => void
  openPreferences: () => void
  openLicence: () => void
  /** Why actions that change the project are unavailable (checked out by someone else). */
  lockedReason?: string
  panelVisible: (id: LabiiaPanel) => boolean
  togglePanel: (id: LabiiaPanel) => void
  memosIcon?: IconComponent
}

/** Light and dark versions of each look, for the Dark mode button. */
const DARK_PAIR: Record<string, string> = {
  windows: 'windows-dark',
  'windows-dark': 'windows',
  magnolia: 'magnolia-dark',
  'magnolia-dark': 'magnolia'
}
const INTERFACE_SCALES = [1, 1.25, 1.5, 2]

const currentTheme = (): string => document.documentElement.getAttribute('data-theme') ?? 'windows'
const isDark = (theme: string): boolean => theme.endsWith('dark')

async function toggleDarkLook(): Promise<void> {
  const theme = currentTheme()
  const next = DARK_PAIR[theme] ?? (isDark(theme) ? 'windows' : 'windows-dark')
  document.documentElement.setAttribute('data-theme', next)
  window.api.broadcastTheme(next)
  const prefs = (await window.api.loadPreferences()) ?? {}
  await window.api.savePreferences({ ...prefs, theme: next })
}

async function changeInterfaceScale(direction: 1 | -1): Promise<void> {
  const prefs = (await window.api.loadPreferences()) ?? {}
  const current = typeof prefs.interfaceScale === 'number' ? prefs.interfaceScale : 1
  const index = INTERFACE_SCALES.findIndex((v) => v >= current - 0.001)
  const next = INTERFACE_SCALES[Math.min(INTERFACE_SCALES.length - 1, Math.max(0, (index < 0 ? 0 : index) + direction))]
  window.api.setZoomFactor(next)
  window.api.broadcastZoomFactor(next)
  await window.api.savePreferences({ ...prefs, interfaceScale: next })
}

/** The recent projects, then "Browse…", for the Open button's list. */
async function recentProjectsMenu(openProject: () => void): Promise<RibbonMenuItem[]> {
  const recent = ((await window.api.getRecentProjects()) ?? []).slice(0, 10)
  const items: RibbonMenuItem[] = recent.map((p) => ({
    id: p.path,
    label: p.path.split(/[\\/]/).pop()?.replace(/\.qdpx$/i, '') || p.name,
    hint: p.path,
    icon: faFileAlt,
    onClick: () => window.api.sendWelcomeAction(`open-recent:${p.path}`)
  }))
  if (!items.length) items.push({ id: 'none', label: t('labiia.ribbon.noRecentProjects'), onClick: openProject })
  items.push({
    id: 'browse',
    label: t('labiia.ribbon.browseForProject'),
    hint: t('labiia.ribbon.browseHint'),
    icon: faFolderOpen,
    separated: true,
    onClick: openProject
  })
  return items
}

export function labiiaRibbonTabs(a: RibbonActions): RibbonTabDef[] {
  const analysisButton = (family: RibbonFamily) => (toolType: AnalysisToolType): RibbonButtonDef => {
    const def = TOOL_REGISTRY[toolType]
    return { id: toolType, label: def.label, title: def.description, icon: def.icon, family, onClick: () => a.openAnalysis(toolType) }
  }
  const lexicalButton = (family: RibbonFamily) => (id: LexicalTestId): RibbonButtonDef => {
    const def = LEXICAL_TESTS.find((d) => d.id === id)!
    // Ribbon labels stay short: "CHD (Classificação …)" shows as "CHD", the full name in the tooltip.
    const label = def.label.split(' (')[0]
    return {
      id,
      label,
      title: `${def.label}: ${def.description}`,
      icon: def.icon,
      family,
      onClick: () => a.openAnalysis(lexicalToolType(id))
    }
  }
  const panelButton = (id: LabiiaPanel): RibbonButtonDef => {
    const visible = a.panelVisible(id)
    const name = t(`panes.${id}`)
    return {
      id: `panel-${id}`,
      label: name,
      icon: faPanelsTopLeft,
      family: 'neutral',
      pressed: visible,
      title: visible ? t('toolbar.hidePane', { pane: name }) : t('toolbar.showPane', { pane: name }),
      onClick: () => a.togglePanel(id)
    }
  }
  const dark = isDark(currentTheme())

  return [
    {
      id: 'home',
      label: t('toolbar.tabHome'),
      groups: [
        {
          label: t('labiia.ribbon.groupProject'),
          buttons: [
            { id: 'new-project', label: t('labiia.ribbon.new'), title: t('labiia.ribbon.newProject'), icon: faFilePlus, family: 'sources', onClick: a.newProject },
            {
              // Split button: the icon opens the file picker, "Open ▾" lists recent projects.
              id: 'open-project',
              label: t('labiia.ribbon.open'),
              title: t('labiia.ribbon.openProject'),
              icon: faFolderOpen,
              family: 'sources',
              onClick: a.openProject,
              menu: () => recentProjectsMenu(a.openProject)
            },
            { id: 'project-details', label: t('toolbar.projectDetails'), icon: faCircleInfo, family: 'sources', onClick: a.projectDetails },
            { id: 'merge', label: t('toolbar.merge'), title: t('toolbar.mergeTitle'), icon: faGitMerge, iconStyle: { transform: 'scale(-1, -1)' }, family: 'sources', onClick: a.mergeProjects }
          ]
        },
        {
          label: t('labiia.ribbon.groupSources'),
          buttons: [
            { id: 'import', label: t('toolbar.import'), title: t('toolbar.importTitle'), icon: faSquareArrowRightEnter, family: 'sources', disabledReason: a.lockedReason, onClick: a.importSources },
            { id: 'folder', label: t('labiia.ribbon.newFolder'), icon: faFolderPlus, family: 'sources', disabledReason: a.lockedReason, onClick: a.newFolder }
          ]
        },
        {
          label: t('labiia.ribbon.groupCoding'),
          buttons: [
            { id: 'codebook', label: t('toolbar.codebook'), icon: faBook, family: 'coding', onClick: a.openCodebook },
            { id: 'tags', label: t('toolbar.tags'), title: t('toolbar.tagsTitle'), icon: faTags, family: 'coding', onClick: a.manageTags },
            { id: 'logbook', label: t('toolbar.logbook'), icon: faNotebookPen, family: 'coding', onClick: a.openLogbook },
            { id: 'memos', label: t('toolbar.memos'), title: t('toolbar.memosTitle'), icon: a.memosIcon ?? faNotebookPen, family: 'coding', onClick: a.openMemos }
          ]
        },
        {
          label: t('toolbar.groupQuery'),
          buttons: [
            { id: 'query', label: t('toolbar.query'), title: TOOL_REGISTRY.queryBuilder.description, icon: faMagnifyingGlass, family: 'query', onClick: a.openQuery }
          ]
        }
      ]
    },
    {
      id: 'analyses',
      label: t('labiia.ribbon.tabAnalyses'),
      groups: [
        { label: t('toolbar.groupCodes'), buttons: (['codes-in-documents', 'framework-matrix', 'code-cooccurrences', 'code-orders', 'code-frequencies'] as AnalysisToolType[]).map(analysisButton('codes')) },
        { label: t('labiia.ribbon.groupResultsWords'), buttons: (['results-in-documents', 'word-frequencies', 'word-combinations', 'relationship-map'] as AnalysisToolType[]).map(analysisButton('results')) },
        { label: t('labiia.ribbon.groupReports'), buttons: (['reports'] as AnalysisToolType[]).map(analysisButton('reports')) }
      ]
    },
    {
      id: 'lexical',
      label: t('labiia.ribbon.tabLexical'),
      groups: [
        { label: t('labiia.ribbon.groupExploration'), buttons: (['wordcloud', 'word-tree', 'bigrams', 'trigrams'] as LexicalTestId[]).map(lexicalButton('explore')) },
        { label: t('labiia.ribbon.groupStructure'), buttons: (['chd', 'similitude', 'thematic-map', 'lda'] as LexicalTestId[]).map(lexicalButton('structure')) },
        { label: t('labiia.ribbon.groupKeywords'), buttons: (['yake', 'keyword-associations', 'sentiment', 'emotions'] as LexicalTestId[]).map(lexicalButton('keywords')) }
      ]
    },
    {
      id: 'view',
      label: t('toolbar.tabView'),
      groups: [
        {
          label: t('toolbar.groupPanes'),
          buttons: (['documents', 'codes', 'queries', 'memos', 'quotes', 'analyses'] as LabiiaPanel[]).map(panelButton)
        },
        {
          label: t('labiia.ribbon.groupAppearance'),
          buttons: [
            { id: 'dark', label: dark ? t('labiia.ribbon.lightMode') : t('labiia.ribbon.darkMode'), icon: dark ? faSun : faMoon, family: 'neutral', onClick: () => void toggleDarkLook() },
            { id: 'zoom-in', label: t('labiia.ribbon.larger'), title: t('labiia.ribbon.largerTitle'), icon: faZoomIn, family: 'neutral', onClick: () => void changeInterfaceScale(1) },
            { id: 'zoom-out', label: t('labiia.ribbon.smaller'), title: t('labiia.ribbon.smallerTitle'), icon: faZoomOut, family: 'neutral', onClick: () => void changeInterfaceScale(-1) }
          ]
        }
      ]
    },
    {
      id: 'help',
      label: t('toolbar.tabHelp'),
      groups: [
        {
          label: 'labiia_quali',
          buttons: [
            { id: 'preferences', label: t('toolbar.preferences'), icon: faGear, family: 'neutral', onClick: a.openPreferences },
            { id: 'licence', label: t('toolbar.licence'), title: t('toolbar.licenceAttributions'), icon: faScale, family: 'neutral', onClick: a.openLicence },
            { id: 'manual', label: t('toolbar.manual'), title: t('labiia.ribbon.manualTitle'), icon: faFileAlt, family: 'neutral', onClick: () => window.open(MANUAL_URL, '_blank') }
          ]
        }
      ]
    }
  ]
}
