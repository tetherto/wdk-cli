import defaults from './defaults.json' with { type: 'json' }

export const CONFIG_DEFAULTS = defaults

export function validateKey(_key: string, _value: string): string | null {
  return null
}
