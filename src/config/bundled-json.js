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

// The JSON files shipped with the package, loaded as JSON modules so every
// runtime (Node, Bare, a bundled worklet) reads them without a filesystem.
// Excluded from `standard` (package.json → standard.ignore): its parser
// (espree 9) cannot read import attributes.
// Typed `any`, as `JSON.parse` would return: each consumer declares the shape
// it reads.
import packageJsonModule from '../../package.json' with { type: 'json' }
import wdkConfigJsonModule from '../../wdk.config.json' with { type: 'json' }
import wdkTokensJsonModule from '../../wdk.tokens.json' with { type: 'json' }

/** @type {any} */
export const packageJson = packageJsonModule
/** @type {any} */
export const wdkConfigJson = wdkConfigJsonModule
/** @type {any} */
export const wdkTokensJson = wdkTokensJsonModule
