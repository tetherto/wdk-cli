// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { Command } from 'commander'

interface HelpItem {
  flags: string
  description: string
  required?: boolean
}

interface HelpConfig {
  params?: HelpItem[]
  options?: HelpItem[]
  hideFlags?: string[]
}

function formatSection(title: string, items: HelpItem[], pad: number): string {
  const lines = [`${title}:`]
  for (const item of items) {
    const label = item.required ? ' (required)' : ''
    lines.push(`  ${item.flags.padEnd(pad)}${item.description}${label}`)
  }
  return lines.join('\n')
}

export function configureHelp(cmd: Command, config: HelpConfig): void {
  const hasParams = config.params && config.params.length > 0
  const hasOptions = config.options && config.options.length > 0

  cmd.configureHelp({
    formatHelp(cmd, helper) {
      const usage = helper.commandUsage(cmd)
      const desc = helper.commandDescription(cmd)

      const allItems = [...(config.params || []), ...(config.options || [])]
      const pad = allItems.length > 0 ? Math.max(...allItems.map(i => i.flags.length)) + 4 : 24

      const sections: string[] = []
      sections.push(usage)
      if (desc) sections.push(desc)

      if (hasParams) {
        sections.push(formatSection('Params', config.params!, pad))
      }

      if (hasOptions) {
        sections.push(formatSection('Options', config.options!, pad))
      }

      const subs = cmd.commands.filter(c => c.name() !== 'help')
      if (subs.length > 0) {
        const cmdItems = subs.map(c => ({
          flags: c.name(),
          description: c.description(),
        }))
        const cmdPad = Math.max(pad, ...cmdItems.map(i => i.flags.length + 4))
        sections.push(formatSection('Commands', cmdItems, cmdPad))
      }

      let root = cmd.parent
      while (root?.parent) root = root.parent
      const isRoot = !root || root === cmd
      const flagSource = isRoot ? cmd : root!
      const hiddenFlags = config.hideFlags || []
      const globalFlags = (flagSource?.options || []).filter(o => !o.hidden && !hiddenFlags.some(h => o.flags.includes(h)))
      if (globalFlags.length > 0) {
        const flagItems = globalFlags
          .filter(o => !o.flags.startsWith('-V'))
          .map(o => ({ flags: o.flags, description: o.description || '' }))
        const flagPad = Math.max(pad, ...flagItems.map(i => i.flags.length + 4))
        sections.push(formatSection('Flags', flagItems, flagPad))
      }

      sections.push('')
      return sections.join('\n\n')
    },
  })
}
