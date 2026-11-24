import { describe, it, expect, beforeEach } from 'vitest'
import { parseTagsPanelVisible, tagsPanelShown, toggleTagsPanelFromView, useTagsPanel } from '../../src/renderer/labiia/tags-panel'

// The Características panel can be closed and reopened from the View tab.
// It lives inside the Documents panel, so showing it also reopens Documents.

describe('the Características panel', () => {
  beforeEach(() => useTagsPanel.setState({ visible: true }))

  it('is shown on a new installation and stays closed once closed', () => {
    expect(parseTagsPanelVisible(null)).toBe(true)
    expect(parseTagsPanelVisible('0')).toBe(false)
    expect(parseTagsPanelVisible('1')).toBe(true)
  })

  it('counts as on screen only with the Documents panel open', () => {
    expect(tagsPanelShown(true, true)).toBe(true)
    expect(tagsPanelShown(true, false)).toBe(false)
  })

  it('is hidden by the View button when on screen', () => {
    let opened = false
    toggleTagsPanelFromView(true, () => { opened = true })
    expect(useTagsPanel.getState().visible).toBe(false)
    expect(opened).toBe(false)
  })

  it('reopens the Documents panel when shown from the View tab', () => {
    useTagsPanel.setState({ visible: false })
    let opened = false
    toggleTagsPanelFromView(false, () => { opened = true })
    expect(useTagsPanel.getState().visible).toBe(true)
    expect(opened).toBe(true)
    // With Documents closed, the panel was not on screen: the button shows it rather than hiding it.
    opened = false
    toggleTagsPanelFromView(false, () => { opened = true })
    expect(useTagsPanel.getState().visible).toBe(true)
    expect(opened).toBe(true)
  })
})
