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

/** @typedef {import('commander').Command} Command */

/**
 * @typedef {Object} HelpItem
 * @property {string} flags - The flag or param string, e.g. `--network <name>`.
 * @property {string} description - Description of the flag or param.
 * @property {boolean} [required] - Whether the item is required.
 */

/**
 * @typedef {Object} HelpConfig
 * @property {HelpItem[]} [args] - Positional argument items (rendered as `Args:` section).
 * @property {HelpItem[]} [params] - Flag parameter items.
 * @property {HelpItem[]} [options] - Option items.
 * @property {string[]} [hideFlags] - Flag strings to hide from the global flags section.
 */

/**
 * Formats a help section with a title and padded item rows.
 *
 * @param {string} title - Section title.
 * @param {HelpItem[]} items - Items to display.
 * @param {number} pad - Column padding width.
 * @returns {string} Formatted section string.
 */
function formatSection (title, items, pad) {
  const lines = [`${title}:`]
  for (const item of items) {
    const label = item.required ? ' (REQUIRED)' : ''
    lines.push(`  ${item.flags.padEnd(pad)}${item.description}${label}`)
  }
  return lines.join('\n')
}

/**
 * Configures a Commander command with a custom help formatter.
 *
 * @param {Command} cmd - The Commander command to configure.
 * @param {HelpConfig} config - Help configuration with params, options, and hidden flags.
 * @returns {void}
 */
export function configureHelp (cmd, config) {
  const hasArgs = config.args && config.args.length > 0
  const hasParams = config.params && config.params.length > 0
  const hasOptions = config.options && config.options.length > 0

  cmd.configureHelp({
    formatHelp (cmd, helper) {
      const usage = helper.commandUsage(cmd)
      const desc = helper.commandDescription(cmd)

      const allItems = [
        ...(config.args || []),
        ...(config.params || []),
        ...(config.options || [])
      ]
      const pad = allItems.length > 0 ? Math.max(...allItems.map((i) => i.flags.length)) + 4 : 24

      const sections = []
      sections.push(usage)
      if (desc) sections.push(desc)

      if (hasArgs) {
        sections.push(formatSection('Args', config.args, pad))
      }

      if (hasParams) {
        sections.push(formatSection('Params', config.params, pad))
      }

      if (hasOptions) {
        sections.push(formatSection('Options', config.options, pad))
      }

      const subs = cmd.commands.filter((c) => c.name() !== 'help')
      if (subs.length > 0) {
        const cmdItems = subs.map((c) => ({
          flags: c.name(),
          description: c.description()
        }))
        const cmdPad = Math.max(pad, ...cmdItems.map((i) => i.flags.length + 4))
        sections.push(formatSection('Commands', cmdItems, cmdPad))
      }

      let root = cmd.parent
      while (root?.parent) root = root.parent
      const isRoot = !root || root === cmd
      const flagSource = isRoot ? cmd : root
      const hiddenFlags = config.hideFlags || []
      const globalFlags = (flagSource?.options || []).filter(
        (o) => !o.hidden && !hiddenFlags.some((h) => o.flags.includes(h))
      )
      if (globalFlags.length > 0) {
        const flagItems = globalFlags
          .filter((o) => !o.flags.startsWith('-V'))
          .map((o) => ({ flags: o.flags, description: o.description || '' }))
        const flagPad = Math.max(pad, ...flagItems.map((i) => i.flags.length + 4))
        sections.push(formatSection('Flags', flagItems, flagPad))
      }

      sections.push('')
      return sections.join('\n\n')
    }
  })
}
