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

import walletsFile from '../../wdk.config.json' with { type: 'json' }

type ModuleAssets = Record<string, string>

const moduleConfigs: Record<string, Record<string, ModuleAssets>> = {}

for (const [name, entry] of Object.entries(walletsFile.networks)) {
  const net = entry as Record<string, unknown>
  const modules: Record<string, ModuleAssets> = {}
  if (net.moonpay) modules.moonpay = net.moonpay as ModuleAssets
  if (Object.keys(modules).length > 0) {
    moduleConfigs[name] = modules
  }
}

export function getModuleAssets(network: string, module: string): ModuleAssets | undefined {
  return moduleConfigs[network]?.[module]
}
