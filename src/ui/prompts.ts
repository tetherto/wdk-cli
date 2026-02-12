import { input, password, confirm } from '@inquirer/prompts'

export async function promptPassword(message: string = 'Enter password:'): Promise<string> {
  return password({ message })
}

export async function promptSeedPhrase(): Promise<string> {
  return password({
    message: 'Enter your seed phrase:',
    mask: '*',
  })
}

export async function promptConfirm(message: string): Promise<boolean> {
  return confirm({ message })
}

export async function promptInput(message: string): Promise<string> {
  return input({ message })
}
