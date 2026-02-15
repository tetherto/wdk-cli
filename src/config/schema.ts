import type { WdkCliConfig } from '../types/index.js'

export const CONFIG_DEFAULTS: WdkCliConfig = {
  defaultNetwork: 'ethereum',
  defaultIndex: 0,
  indexer: {
    baseUrl: 'https://wdk-api.tether.io',
    apiKey: '',
  },
  providers: {},
  evm: {},
  output: {
    json: false,
    noColor: false,
  },
}

export const CONFIG_SCHEMA = {
  defaultNetwork: {
    type: 'string' as const,
    default: CONFIG_DEFAULTS.defaultNetwork,
  },
  defaultIndex: {
    type: 'number' as const,
    default: CONFIG_DEFAULTS.defaultIndex,
  },
  'indexer.baseUrl': {
    type: 'string' as const,
    default: CONFIG_DEFAULTS.indexer.baseUrl,
  },
  'indexer.apiKey': {
    type: 'string' as const,
    default: CONFIG_DEFAULTS.indexer.apiKey,
  },
  'output.json': {
    type: 'boolean' as const,
    default: false,
  },
  'output.noColor': {
    type: 'boolean' as const,
    default: false,
  },
}
