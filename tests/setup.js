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

// Chalk colours its output when it detects a terminal, so a suite that asserts
// on logged strings passes in CI (no TTY, no colour) and fails on a developer's
// machine, with a diff whose two sides look identical. Pinning it off here
// makes every run deterministic, wherever it runs.
process.env.FORCE_COLOR = '0'
