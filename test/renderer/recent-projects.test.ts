import { describe, it, expect } from 'vitest'
import { recentProjectLabel } from '../../src/renderer/labiia/recent-projects'

// The welcome screen's recent projects show the project's name in front and
// its folder underneath, on Windows (\) and on Mac (/) alike.

describe('recent projects on the welcome screen', () => {
  it('shows the project name from a Windows path, with its folder apart', () => {
    expect(recentProjectLabel('C:\\Users\\cardo\\Downloads\\Recife cópia.qdpx', 'Recife')).toEqual({
      name: 'Recife cópia',
      folder: 'C:\\Users\\cardo\\Downloads'
    })
  })

  it('does the same with a Mac path', () => {
    expect(recentProjectLabel('/Users/ana/Projetos/Entrevistas.QDPX')).toEqual({ name: 'Entrevistas', folder: '/Users/ana/Projetos' })
  })

  it('falls back to the saved name when the path has no file name', () => {
    expect(recentProjectLabel('C:\\pasta\\.qdpx', 'Projeto salvo').name).toBe('Projeto salvo')
  })
})
