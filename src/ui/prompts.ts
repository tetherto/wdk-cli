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

import { input, password, confirm } from '@inquirer/prompts'

export async function promptPassphrase(message: string = 'Enter passphrase:'): Promise<string> {
  const envPassword = process.env.WDK_PASSWORD
  if (envPassword) return envPassword
  return password({ message })
}

export async function promptSeedPhrase(): Promise<string> {
  return input({
    message: 'Enter your seed phrase:',
  })
}

export async function promptConfirm(message: string): Promise<boolean> {
  return confirm({ message })
}

export async function promptInput(message: string): Promise<string> {
  return input({ message })
}
