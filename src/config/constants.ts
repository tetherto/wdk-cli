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

import { join } from 'node:path'
import { homedir } from 'node:os'

export const APP_NAME = 'wdk-cli'
export const APP_VERSION = '0.1.0'
export const CONFIG_DIR = APP_NAME
export const KEYRING_FILENAME = 'keyring.enc'
function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME
  const base = xdgConfig || join(homedir(), '.config')
  return join(base, CONFIG_DIR)
}

export const SESSION_FILENAME = 'session.json'
export const SESSION_TTL_MINUTES = 30

export function getKeyringPath(): string {
  return join(getConfigDir(), KEYRING_FILENAME)
}

export function getSessionPath(): string {
  return join(getConfigDir(), SESSION_FILENAME)
}
