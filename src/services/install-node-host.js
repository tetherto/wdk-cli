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

// Registers the config store and module host of a process that runs from the
// installed CLI package. Hosts import this module before anything else: some
// modules (config/networks.js) read the config while they load, so both must
// be in place by then.
import { configService } from './config-service.js'
import { createConfStore } from './conf-store.js'
import { useModuleHost } from './module-host.js'
import { createNodeModuleHost } from './node-module-host.js'

configService.useStore(createConfStore())
useModuleHost(createNodeModuleHost())
