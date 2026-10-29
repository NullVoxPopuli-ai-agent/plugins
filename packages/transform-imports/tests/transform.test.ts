import { describe, it, expect } from 'vitest'
import { rolldown } from 'rolldown'
import { transformImportsPlugin, type TransformImportsOptions } from '../src/index.ts'
import { globSync } from 'tinyglobby'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('transform-imports', () => {
  for (const ext of ['js', 'jsx', 'ts', 'tsx']) {
    it(`transforms imports in query-suffixed .${ext} modules`, async () => {
      const result = await transform(
        `import { IconCheck } from 'icons'; console.log(IconCheck)`,
        { icons: { transform: 'icons/{{member}}.js' } },
        `virtual:entry.${ext}?tsr-split=component`,
      )
      expect(result).toContain('icons/IconCheck.js')
    })
  }

  it('throws on namespace import when preventFullImport is true', async () => {
    const input = `import * as Bootstrap from 'react-bootstrap'\nconsole.log(Bootstrap)`
    const config = {
      'react-bootstrap': {
        transform: 'react-bootstrap/lib/{{member}}',
        preventFullImport: true,
      },
    }

    await expect(transform(input, config)).rejects.toThrow('preventFullImport')
  })

  it('throws on side-effect import when preventFullImport is true', async () => {
    const input = `import 'react-bootstrap'`
    const config = {
      'react-bootstrap': {
        transform: 'react-bootstrap/lib/{{member}}',
        preventFullImport: true,
      },
    }

    await expect(transform(input, config)).rejects.toThrow('preventFullImport')
  })
})

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixturePaths = globSync('*/input.js', { cwd: fixturesDir })

describe('fixtures', () => {
  for (const inputPath of fixturePaths) {
    const fixtureName = dirname(inputPath)
    const input = readFileSync(join(fixturesDir, inputPath), 'utf-8')
    const configPath = join(fixturesDir, fixtureName, 'config.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))

    it(fixtureName, async () => {
      const result = await transform(input, config)
      await expect(result).toMatchFileSnapshot(join(fixturesDir, fixtureName, 'output.js'))
    })
  }
})

async function transform(
  code: string,
  modules: TransformImportsOptions,
  virtualEntry = 'virtual:entry.ts',
): Promise<string> {
  const build = await rolldown({
    input: virtualEntry,
    plugins: [
      {
        name: 'virtual',
        resolveId(id) {
          if (id === virtualEntry) return id
          // Mark transformed imports as external
          return { id, external: true }
        },
        load(id) {
          if (id === virtualEntry) return code
        },
      },
      transformImportsPlugin(modules),
    ],
  })

  const { output } = await build.generate({ format: 'esm' })
  return stripRolldownRuntime(output[0].code)
}

function stripRolldownRuntime(code: string): string {
  return code.replace(
    /\/\/#region \\0rolldown\/runtime\.js[\s\S]*?\/\/#endregion\n*/g,
    '// [rolldown runtime elided]\n',
  )
}
